'''
MIT License

Copyright (c) 2016 Christopher Stevens (chris@christopherstevens.cc)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
'''

#!/usr/bin/python
from __future__ import print_function # Python 2/3 compatibility
from osgeo import ogr
import boto3
import json
import datetime
import sys
import logging

########
# todo #
########

# * catch and handle any return db errors
# * troubleshoot a shortage of 12,000ish resulting db rows out of 6,480,000
# * improve the reporting and status updates for this script
# * search for "!!!" here to find other troublesome areas

##############
# how to use #
##############

#!!! DO THIS AT YOUR OWN RISK AND EXPENSE! (heavy data usage, gets EXPENSIVE if you don't terminate instances, reduce write capacity units immediately after building database)
#!!! It would take a medium instance with single CPU over a MONTH to complete this script
#!!! Consider using a database (OSM?) solution instead of this script that iterates through shapefiles over and over (learn as you go!)
'''
#Example use: (4 CPUs [2 run at a time for now] c4.xlarge, single instance at 1000 write capacity/sec, took about 6 hours [$$$ !!! take back down to 5 when finished !!! $$$])

nohup nice -n 10 python makeLonLatLookupTable.py "-1800" "1800" "-900" "0" "i01p01" &
nohup nice -n 10 python makeLonLatLookupTable.py "-1800" "1800" "0" "900" "i01p02" &

#i01p02 was taking forever, started another to help it along (remembered to stop i01p02 at 60 percent notification)...
nohup nice -n 10 python makeLonLatLookupTable.py "-1800" "1800" "540" "900" "i01p03" &
nohup nice -n 10 python makeLonLatLookupTable.py "-1800" "1800" "720" "900" "i01p04" &


'''

############
# settings #
############

#for best results, make sure to set environment variables as well before running this script:
#export AWS_ACCESS_KEY_ID='YOURACCESSKEY'
#export AWS_SECRET_ACCESS_KEY='YOURSECRETACCESSKEY'
#export AWS_REGION='us-east-1'

dynamoDBTableName = 'alexaISSLonLatLookup'
reportEveryXRowsAdded = 324000
sendToSNSTopic = True #!!! Man this got annoying, report progress a better way next time
SNSTopicArn = 'arn:aws:sns:us-east-1:631764164204:alexaISSLonLatLookupProgress'

########
# init #
########

#error logging
logger = logging.getLogger('makeLonLatLookupTable')
fh = logging.FileHandler('makeLonLatLookupTableErrors.log')
fh.setLevel(logging.DEBUG)
logger.addHandler(fh)
logger.warning('Error logging initiated...')

#stop it if arguments were not provided
if len(sys.argv) == 1:
	print ("error: arguments are needed: makeLonLatLookupTable.py lonStartX10, lonEndX10, latStartX10, latEndX10, processName")
	print ("Example: makeLonLatLookupTable.py \"-1800\", \"1800\", \"-900\", \"900\"")
	sys.exit("error: arguments are needed")

minLon = int(sys.argv[1])
maxLon = int(sys.argv[2])
minLat = int(sys.argv[3])
maxLat = int(sys.argv[4])
processName = str(sys.argv[5])

print ("minLon: " + str(minLon))
print ("maxLon: " + str(maxLon))
print ("minLat: " + str(minLat))
print ("maxLat: " + str(maxLat))
print ("processName: " + processName)


#enable DynamoDB table for access
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('alexaISSLonLatLookup')

#enable SNS topic access
snsClient = boto3.client('sns')

#prepare to load water and state shapefiles into memory
outdriver = ogr.GetDriverByName('MEMORY')
source = outdriver.CreateDataSource('memData')
tmp = outdriver.Open('memData',1)

#prepare to keep tabs of progress
rowInt = 0
rowTotal = (maxLon - minLon) * (maxLat - minLat)
rowUpdateEvery = reportEveryXRowsAdded
startTime = float(datetime.datetime.now().strftime("%s"))

#bulk put items to DynamoDB 25 at a time to save on write requests
bulkItems = []

########
# defs #
########

def processLonLat(lonLat):
	global rowInt, rowUpdateEvery

	lon = lonLat[0]
	lat = lonLat[1]

	#default saved values
	water = ' '
	country = ' '
	state = ' '
	city = ' '

	#prevent division of 0
	if lon != 0:
		pointLon = float(lon) / 10.0
	else:
		pointLon = 0.0

	if lat != 0:
		pointLat = float(lat) / 10.0
	else:
		pointLat = 0.0

	#Primary key used in DynamoDB for quick lookups
	pointKey = "lon" + str(pointLon) + "lat" + str(pointLat)
	
	#ogr point
	pointStr = "POINT(" + str(pointLon) + " " + str(pointLat) + ")"
	point = ogr.CreateGeometryFromWkt(pointStr)

	#water
	waterLayer.ResetReading()
	for feature in waterLayer:
		geometry = feature.GetGeometryRef()
		if geometry.Contains(point):
			water = feature.GetField(feature.GetFieldIndex("name"))
			#print (pointKey + ": " + water)
			break
	
	#If not over water, we're over land!
	#Don't check country, state, city if over water to go faster since much of Earth is covered by water.
	if water == ' ':
		#country
		countryLayer.ResetReading()
		for feature in countryLayer:
			geometry = feature.GetGeometryRef()
			if geometry.Contains(point):
				country = feature.GetField(feature.GetFieldIndex("ADMIN"))
				break

		#state/province
		stateLayer.ResetReading()
		for feature in stateLayer:
			geometry = feature.GetGeometryRef()
			if geometry.Contains(point):
				state = feature.GetField(feature.GetFieldIndex("name"))
				if country == ' ':
					country = feature.GetField(feature.GetFieldIndex("admin"))
				#print (pointKey + ": " + state + ": " + country)
				break

		#city
		#check if city exists in this rounded longitude and latitude
		if pointKey in cities:
			city = cities[pointKey]
			
	#print ('key: ' + pointKey + ', water: ' + str(water) + ', country: ' + str(country) + ', state/province: ' + str(state) + ", city: " + str(city))

	#put item to DynamoDB:
	dbPut(pointKey, water, country, state, city)

	rowInt += 1
	if rowInt % rowUpdateEvery == 0 or rowInt == 100:
		statusReport()	

#push data to DynamoDB table up to 25 items at a time (boto will help if we're over that for some reason as well)
def batchPut():
	global bulkItems
	
	with table.batch_writer() as batch:
		for i in range(len(bulkItems)):
			try:
				batch.put_item(
					Item=bulkItems[i]
				)
			except ValueError:
				#!!! Not too common, but some UTF-8 related errors were occuring, and I was unable to resolve quickly without cost
				#!!! Perfect is the enemy of done. Add blank records for now, log for further processing later
				print (bulkItems[i]) #not to hard to copy/paste from nohup.out directly to online admin, if not too many
				#print (ValueError)
				try:
					batch.put_item(
						Item={
							'lonlat': ' ',
							'data': {
								'water': ' ',
								'country': ' ',
								'state': ' ',
								'city': ' '
							}
						}
					)

					#log for later fixing
					#!!! 199 errors total last time this was run, water name encoding related, see nohup.out for specific items to extract, adjust this to make simpler next time
					logger.warning(bulkItems[i]['lonlat'])

				except ValueError:
					print ('Uh oh: Unable to add blank record...')
					print (ValueError)

#push data to DynamoDB table 25 items at a time
def dbPut(pointKey, water, country, state, city):
	global bulkItems
	bulkItems.append(
		{
			'lonlat': str(pointKey),
			'data': {
				'water': str(water),
				'country': str(country),
				'state': str(state),
				'city': str(city)
			}
		}
	)

	#start a batch write: speed up the process and reduce the number of write requests made to DynamoDB
	#DynamoDB supports 25 max entries at a time, boto3 however will auto-adjust as needed
	if len(bulkItems) >= 25:
		batchPut()
		bulkItems = []



#show a quick status report in terminal (or ~/nohup.out file)
#and report progress via SNS topic (email subscription in my case) if set to do so
def statusReport():
	#estimated completion time
	now = float(datetime.datetime.now().strftime("%s"))
	elapsedSeconds = now - startTime
	percentComplete = float(rowInt) / float(rowTotal)
	percentRemaining = 1.0 - percentComplete
	secondsRemaining = elapsedSeconds / percentComplete
	dateToComplete = datetime.datetime.now() + datetime.timedelta(0,int(secondsRemaining))

	statusProgress = processName + " " + str(rowInt) + " of " + str(rowTotal) + " (" + str(round(percentComplete * 100000) / 1000) + "%) rows completed"
	statusComplete = 'estimated comlpetion date/time: ' + str(dateToComplete)
	#print (statusProgress)
	#print (statusComplete)

	#Publish to SNS topic (sending emails, SMS, API calls, etc. to subscribers as set in topic)
	if sendToSNSTopic == True:
		subject = processName + " Lon: " + str(minLon) + "->" + str(maxLon) + ", Lat:" + str(minLat) + "->" + str(maxLat)
		message = processName + " Lat/Lon Progress Update: (" + str(round(percentComplete * 100000) / 1000) + "%), Lon: " + str(minLon) + "->" + str(maxLon) + ", Lat:" + str(minLat) + "->" + str(maxLat) 
		message += "\n\n" + "Have a very productive day," + "\n\n" + "The alexaISSLonLatLookup EC2 Instance"
		response = snsClient.publish(
			TopicArn = SNSTopicArn,
			Message = message,
			Subject = subject,
			MessageStructure = 'string'
		)
		#print ('Published to SNS topic')
		#print (response)

#####################
# load data sources #
#####################

print ('loading data into memory...')

#Note: You don't want to load detailed data into memory if it won't fit.
#Consider an OSM database or other database solution when appropriate

#load water data
waterDataset = ogr.Open("ne_50m_geography_marine_polys.shp")
waterLayer = waterDataset.GetLayerByName("ne_50m_geography_marine_polys")
waterLayer.ResetReading()
#move water layer into memory for faster access (!!! check to see if this is actually needed and not happening already)
pipes_mem1 = source.CopyLayer(waterLayer,'pipes',['OVERWRITE=YES'])
waterLayer = source.GetLayer('pipes')

#load state/province data
stateDataset = ogr.Open("ne_10m_admin_1_states_provinces.shp")
stateLayer = stateDataset.GetLayerByName("ne_10m_admin_1_states_provinces")
#move states layer into memory for faster access (!!! check to see if this is actually needed and not happening already)
pipes_mem2 = source.CopyLayer(stateLayer,'pipes2',['OVERWRITE=YES'])
stateLayer = source.GetLayer('pipes2')

#load country data
countryDataset = ogr.Open("ne_10m_admin_0_countries.shp")
countryLayer = countryDataset.GetLayerByName("ne_10m_admin_0_countries")
#move country layer into memory for faster access (!!! check to see if this is actually needed and not happening already)
pipes_mem3 = source.CopyLayer(countryLayer,'pipes3',['OVERWRITE=YES'])
countryLayer = source.GetLayer('pipes3')

#load city data
cityDataset = ogr.Open("ne_10m_populated_places_simple.shp")
cityLayer = cityDataset.GetLayerByName("ne_10m_populated_places_simple")

#load city points into a dict with rounded lon/lat first to save on repeated expense of the math
cities = {}
cityLayer.ResetReading()
for feature in cityLayer:
	geometry = feature.GetGeometryRef()
	geoLon, geoLat, geoZ = geometry.GetPoint()
	geoLon = round(geoLon * 10) / 10
	geoLat = round(geoLat * 10) / 10
	cities["lon" + str(geoLon) + "lat" + str(geoLat)] = str(feature.GetField(feature.GetFieldIndex("name")))

print ('spanning the globe, reporting updates every ' + str(rowUpdateEvery) + ' rows created...')

# generate table with country, state, city and water bodies located at .1 degree intervals in a lon/lat grid
for lon in range(minLon, maxLon):
	for lat in range(minLat, maxLat):
		processLonLat((lon, lat))

# finish off with any leftovers waiting to be added
batchPut()
statusReport()

print ("All done with " + processName + "!")
		