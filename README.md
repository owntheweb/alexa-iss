# Tracker for ISS Alexa Skill

![ISS skill icon](https://raw.githubusercontent.com/owntheweb/alexa-iss/master/source/graphics/alexaISSIcon108.jpg)

## Overview

Where is the International Space Station right now? The Tracker for ISS Alexa Skill will tell you its longitude, latitude, speed, altitude and nearby geographical features as it orbits around the Earth faster than a speeding bullet.

This skill was created in an effort to better understand Amazon Web Services (AWS) Lambda functions, AWS Simple Storage Service (S3), AWS DynamoDB, AWS EC2, AWS security policies and Node.js. Additional contributions are welcome!

## Support

Need to report a bug or have a feature request? Please create an [issue here](https://github.com/owntheweb/alexa-iss/issues).

## Skill Ingredients

#### AWS Lambda Functions

* [alexaISS](https://github.com/owntheweb/alexa-iss/tree/master/lambdaFuncitons/alexaISS):
  * Responds to Alexa skill requests
  * Node.js script that needs dependencies installed prior to upload to AWS (see below)
* [alexaISSGetTLEs](https://github.com/owntheweb/alexa-iss/tree/master/lambdaFuncitons/alexaISSGetTLEs):
  * Collects and caches TLE (Two Line Element) data needed to calculate ISS's orbital position
  * Scheduled via AWS CloudWatch Rules to run once per day
  * Node.js script that needs dependencies installed prior to upload to AWS (see below)

#### AWS DynamoDB Tables

* alexaISSOrbitalObjects
  * Caches TLE data collected by alexaISSGetTLEs Lambda function. TLE data changes every 1-3 days. Caching it here reduces skill request latency and prevents abuse of external APIs.
* alexaISSLonLatLookup (experimental)
  * Stores water body, country, state and city used in reverse geo lookups based on ISS's longitude and latitude. Its purpose is to reduce latency caused by additional API requests that can return most of this data, and reduce long-term costs by not needing to run an OSM server to handle reverse lookups in realtime.

#### Lon/Lat Lookup Table Generator Script

[This script](https://github.com/owntheweb/alexa-iss/blob/master/source/makeLonLatLookupTable/makeLonLatLookupTable.py) uses shapefiles from Natural Earth to populate the alexaISSLonLatLookup table with water body, country, state and city for approximately 6,480,000 lon/lat points around the Earth (0.1 degree increments). 

***Caution***: The table generator script is experimental and needs work. The resulting table has empty points and costs money to create (high DynamoDB capacity needed, lots of requests to handle). Next time: It may be better to generate this table with a OSM map server instead of shapefiles for improved performance and accuracy.

#### AWS Simple Storage Service (S3)

The skill currently delivers icon images (shown in Alexa app) from an S3 bucket. This may expand in the future to store and deliver dynamically generated images.

#### AWS IAM User, Roles, Policies

Under a root account, an IAM user with access keys is setup for local testing with IAM roles/policies attached that determine what the user can do with AWS. IAM roles are assigned to Lambda functions as well to restrict access to specific needs. See below for details.

#### Alexa Skill

Alexa skills are setup in the [Amazon Developer Console](https://developer.amazon.com). This is where skills are tested on Amazon Echo devices and published. Intents, slots, and sample utterances for this skill are [available here](https://github.com/owntheweb/alexa-iss/tree/master/skill).

## How It Works

![ISS skill icon](https://raw.githubusercontent.com/owntheweb/alexa-iss/master/source/graphics/skillSchematic.jpg)

Humans (or other vocal things) ask Alexa for the status of ISS. A response is calculated and returned by the alexaISS Lambda function after accessing stored TLE (two line element) data and nearby geographical features from the DynamoDB tables. Scheduled to run once per day, the alexaISSGetTLEs function retrieves and stores TLE data from the wheretheiss.at API. During setup of the skill, an GDAL-configured Ubuntu EC2 instance is launched and generates the geographic feature table later referenced by the skill (only run once during setup). All functions and tables run within the Amazon Web Services (AWS) services, with access policies configured using AWS IAM policies.

## Amazon Web Services Setup

To start, [sign up](https://console.aws.amazon.com) for an AWS account if needed. 

#### S3 Bucket

The ISS skill references images that can be seen in the Alexa mobile app and [website](http://alexa.amazon.com/) response cards. An S3 bucket will be created and configured to deliver response images while meeting delivery requirements (SSL/TLS, extra headers).

Visit the [S3 section](https://console.aws.amazon.com/s3/home) of the AWS control panel. Choose the "Create Bucket" button. Name the bucket something meaningful and unique ("alexaissinput" used in this example). Choose a region. Make sure to use the same region when creating Lambda functions and DynamoDB tables ("US Standard" covered needs in this example).

Cross-domain access to S3 files will be required in order to show card response images in the Alexa app and website. To allow, choose the bucket that was just created. Select the "Properties" button (top-right). Expand the "Permissions" accordion section. Choose "Edit CORS Configuration". A modal window will show. Paste this CORS configuration in the box then choose the "Save" button:

~~~
<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <CORSRule>
        <AllowedOrigin>*</AllowedOrigin>
        <AllowedMethod>GET</AllowedMethod>
        <MaxAgeSeconds>3000</MaxAgeSeconds>
        <AllowedHeader>Authorization</AllowedHeader>
    </CORSRule>
</CORSConfiguration>

~~~

While still in the bucket, choose the "Upload" button on the top left of the page and select the cardImageLarge.jpg and cardImageSmall.jpg images. Once the images are uploaded, they will still need to be openned up for anonomous access. On the left of the page check/select one image, then select the "Properties" button on the top right. Open up the "Permissions" accordion panel on the right, then choose "Add more permissions". Select a "Grantee" of "Everyone", check "Open/Download", then save. The URL shown at the top of the right panel is what is referenced in the alexaISS Lambda function (bucket name just needs to be changed in settings to match).

#### DynamoDB Tables

Two DynamoDB tables are used as part of the ISS skill. To configure, visit the [DynamoDB section](https://console.aws.amazon.com/dynamodb/home) of the AWS control panel.

The alexaISSOrbitalObjects table will store a single record containing Two Line Element (TLE) data used to calculate the orbital position of ISS. This record will be updated once per day by the alexaISSGetTLEs Lambda function (see below). The table will be read by the alexaISS Lambda function frequently when generating Alexa skill responses.

Choose the "Create table" button. Set the table name to `alexaISSOrbitalObjects` (any name will work, make sure to update script settings as needed). Set the primary key/partition key to `satCatNumber` as a number. Leave "Use default settings" checked and choose the "Create" button.

The alexaISSLonLatLookup table is currently experimental, storing water body, country, state and city for every 0.1 degree longitude/latitude increments covering the Earth. The purpose of this table is to suppliment response lon/lat information with nearby geographical features, while greatly reducing latency caused by making API requests to other reverse geo lookup services. Once data is generated and stored, the table will hold approximately 6,480,000 records. As the table is time consuming and costs money to make, the alexaISS lambda function that references this table will still function if the table is left empty.

Choose the "Create table" button. Set the table name to `alexaISSLonLatLookup` (any name will work, make sure to update script settings as needed). Set the primary key/partition key to `lonlat` as a string. Leave "Use default settings" checked and choose the "Create" button.

#### IAM Policies

IAM policies control who/what can do what on AWS. One IAM policy will be created and assigned to give users and created Lambda functions access to read and write to DynamoDB tables as needed (and nothing else for improved security).

Visit the [Policies section](https://console.aws.amazon.com/iam/home#policies) and choose the "Create Policy" button.

Create a policy named "alexaISSReadDynamoDB" (could be any name) and enter the following policy configuration. This policy will allow test users and the skill functions to read (but not write) the alexaISSLonLatLookup and alexaISSOrbitalObjects tables. Note: Users for testing locally and roles assigned to Lambda functions will be assigned this policy later. Make sure to update the Amazon Resource Name (ARN) of the tables as needed in the policy (found on the DynamoDB table edit pages in the AWS console):

~~~
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Effect": "Allow",
      "Resource": [
        "arn:aws:dynamodb:ZONEHERE:SOMENUMBERHERE:table/alexaISSLonLatLookup",
        "arn:aws:dynamodb:ZONEHERE:SOMENUMBERHERE:table/alexaISSOrbitalObjects"
      ]
    }
  ]
}
~~~

Create a policy named "alexaISSWriteDynamoDBTLEs". This policy, when assigned, will allow the scheduled alexaISSGetTLEs Lambda function to store/update retrieved TLE data for ISS orbital position calculations.

~~~
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Action": [
        "dynamodb:PutItem"
      ],
      "Effect": "Allow",
      "Resource": "arn:aws:dynamodb:ZONEHERE:SOMENUMBERHERE:table/alexaISSOrbitalObjects"
    }
  ]
}
~~~

Optional: Create a policy named "alexaISSWriteDynamoDBLonLat". This policy will allow test users that run the makeLonLatLookupTable.py script.

~~~
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Action": [
        "dynamodb:PutItem",
      ],
      "Effect": "Allow",
      "Resource": "arn:aws:dynamodb:ZONEHERE:SOMENUMBERHERE:table/alexaISSLonLatLookup"
    }
  ]
}
~~~

#### IAM User for Local Testing

If testing locally, setup a an IAM user to use with tests under the "Users" section. Choose a matching username for the task such as "alexaISSLocalTester" (anything useful for future memory). Once created, under the "Permissions" tab, attach the following policies:

* alexaISSReadDynamoDB
* alexaISSWriteDynamoDBTLEs
* alexaISSWriteDynamoDBLonLat (if planning to generate the LonLat table data, optional)

Under the "Security Credentials" tab, choose the "Create Access Key" button. The resulting private and public key will be used locally to gain access to services as set in the attached policies. Take note of or download the private and public key for local installation instructions below.

#### IAM Roles for Alexa ISS Skill

Lambda functions can be assigned a role with attached policies in order to access permitted services. 

The ISS skill will need a role that can read DynamoDB tables setup in the alexaISSReadDynamoDB policy. Visit the [Roles section](https://console.aws.amazon.com/iam/home#roles) and choose the "Create New Role" button. Name the role "alexaISSSkill" (any name will work) then choose the "Next Step" button. Under "AWS Service Roles", choose the "AWS Lambda" option. On the "Attach Policy" screen, choose the "alexaISSReadDynamoDB" policy that was created earlier then choose the "Next Step" button. Review the role settings and choose the "Create Role" button.

The ISS skill will need a role that can write to the DynamoDB table specified in the alexaISSWriteDynamoDBTLEs policy. Visit the [Roles section](https://console.aws.amazon.com/iam/home#roles) and choose the "Create New Role" button. Name the role "alexaISSSaveTLEs" (any name will work) then choose the "Next Step" button. Under "AWS Service Roles", choose the "AWS Lambda" option. On the "Attach Policy" screen, choose the "alexaISSWriteDynamoDBTLEs" policy that was created earlier then choose the "Next Step" button. Review the role settings and choose the "Create Role" button.

#### Lambda Functions

[AWS Lambda](https://aws.amazon.com/lambda/) allows code to be run on demand, only charging for compute time. It also integrates quickly with Alexa skills and other AWS services. The ISS skill is made up of two Node.js Lambda functions. Start by visiting the [Lambda section](https://console.aws.amazon.com/lambda/home) of the AWS control panel. 

The alexaISS Lambda function will handle ISS Skill requests. Choose the "Create a lambda function" button. Choose the "Skip" button at the bottom of the "Select blueprint" page. Set the function name to `alexaISS` (any name will work). Set "Runtime" to Node.js 4.3. Add a placeholder comment to the code area for now (e.g. `\\`). Dependencies need to be installed locally first prior to upload later, see Local Installation below. Keep "Handler" set to `index.handler`. Set "Role" to the newly created `alexaISSSkill` role. Leave all other settings as-is. It may be desired to set "Timeout" higher if testing out new features that make external API requests. Choose the "Next" button. Review settings, then choose the "Create Lambda function".

The alexaISSGetTLEs Lambda function will collect and cache TLE (Two Line Element) data needed to calculate ISS's orbital position. Follow instructions above, naming the function as `alexaISSGetTLEs` and selecting the `alexaISSSaveTLEs` role. This function will need to be scheduled to run once per day later once valid code has been added.

## Local Installation

For development purposes, this skill can be installed and tested locally prior to uploading to Amazon Web Services as a Lambda function and skill. While it's possible to alter and upload Lambda functions as a .zip file and test in AWS, frequent alterations may result in much time savings if tested locally first.

#### Clone Amazon Alexa ISS Skill Repository

Note: Git is required to clone this repository. Git Installation instructions can be found [here](https://help.github.com/articles/set-up-git/).

~~~
git clone git://github.com/owntheweb/alexa-iss.git
~~~

#### Install Node.js Dependencies (required prior to upload)

The ISS skill functions run as Node.js (server-side JavaScript) Lambda functions. After [installing node](https://nodejs.org) if needed, install dependencies for the dependencies for the two functions.

##### alexaISS: Lambda function that handles skill responses

~~~
cd lambda/lambdaFuncitons/alexaISS
mkdir node_modules
npm install aws-sdk dynamodb-doc satellite.js then-request
~~~

##### alexaISSGetTLEs: Lambda function run once per day to retrieve TLE data

~~~
cd ../alexaISSGetTLEs
mkdir node_modules
npm install aws-sdk aws-cli dynamodb-doc request
~~~

### Install and configure AWS-CLI

Amazon Webs Services Command Line Interface will be used to connect the local project to remote DynamoDB databases and for authentication purposes.

Note: [pip](https://pip.pypa.io/en/stable/installing/) is required prior to install.

~~~
pip install awscli
~~~

Test to make sure aws-cli is installed correctly.

~~~
aws
~~~

Configure to match your skill skill user account key/region settings (not recommended to use your root account for this).

~~~
aws configure
~~~

Fill in prompts to match key information generated when creating the test user (see 'IAM User for Local Testing') above. When prompted, also make sure to enter the matching region where Lambda functions, DynamoDB tables and S3 were configured (e.g. 'us-east-1').

## Configure Lambda Functions

After installing nodejs dependencies (see Install Node.js Dependencies above), update the settings sections near the top of the [alexaISS](https://github.com/owntheweb/alexa-iss/blob/master/lambdaFuncitons/alexaISS/index.js) and [alexaISSGetTLEs](https://github.com/owntheweb/alexa-iss/blob/master/lambdaFuncitons/alexaISSGetTLEs/index.js) Lambda function index.js files. Ensure that bucket names and DynamoDB table names match the existing names that were setup in AWS.

## Install lambda-local

To run Lambda functions locally for testing prior to uploading to AWS, install the [lamnda-local Node.js module](https://www.npmjs.com/package/lambda-local) globally.

~~~
npm install -g lambda-local
~~~

As lambda-local installs, take note of the path of where it was installed. Example on a Mac:

~~~
/Users/USERNAME/.node/bin/lambda-local -> /Users/USERNAME/.node/lib/node_modules/lambda-local/bin/lambda-local
~~~

To test this in terminal:

~~~
/Users/USERNAME/.node/bin/lambda-local 
~~~

This can also added to ~/.profile for faster use in the future with this line added near the bottom of the file before the `export PATH` line (again, may vary between Mac OS and other platforms):

~~~
PATH="/Users/USERNAME/.node/bin:$PATH"
~~~

If not present at the end of the file, add this line:

~~~
export PATH
~~~

After fully closing terminal and/or restarting, lambda-local can be executed with a simpler command:

~~~
lambda-local
~~~

On Mac OS *(need to follow up and test on Linux)*, lambda-local and/or aws-sdk node modules were found to run partially independently from the installed AWS-CLI configuration. While researching this for future efforts, setting AWS configuration values as environment variables in terminal before running lambda-local tests resolved issues that were occuring. Note: If the terminal window is closed, enter the environment variables again before further testing.

~~~
export AWS_ACCESS_KEY_ID='TEST_USER_ACCESS_KEY_HERE'
export AWS_SECRET_ACCESS_KEY='TEST_USER_SECRET_ACCESS_KEY_HERE'
export AWS_REGION='us-east-1'
~~~

## Local Testing

Now that lambda-local is installed and AWS-CLI environment variables are set, here is an example of how to use lambda-local to test the alexaISS skill function, passing in data that invokes the GetISSStatus intent:

~~~
cd lambdaFuncitons/alexaISS
lambda-local -l index.js -h handler -e testData/GetISSStatusIntent.js
~~~

Argument explanation:

 - -l, --lambdapath [lambda file name] Specify Lambda function file name.
 - -e, --eventpath [event data file name] Specify event data file name.
 - -h, --handler [lambda-function handler name (optional)] Lambda function handler name. Default is "handler".

When run, an Alexa skill format response should be printed in terminal:

~~~
Logs
----
START RequestId: 90edd3a8-e845-bbdc-4ce3-3cbb5d38e191
onIntent requestId=request5678, sessionId=session1234
END


Message
------
{
	"version": "1.0",
	"sessionAttributes": {
		"new": false,
		"sessionId": "session1234",
		"attributes": {},
		"user": {
			"userId": null
		},
		"application": {
			"applicationId": "amzn1.echo-sdk-ams.app.[unique-value-here]"
		}
	},
	"response": {
		"outputSpeech": {
			"type": "PlainText",
			"text": "At a latitude of 47 and longitude of -151, ISS is currently traveling at 27,624 kilometers per hour at an altitude of 407 kilometers. That's 17,165 miles per hour at an altitude of 253 miles."
		},
		"card": {
			"type": "Standard",
			"title": "ISS Status",
			"text": "At a latitude of 47 and longitude of -151, ISS is currently traveling at 27,624 kilometers per hour at an altitude of 407 kilometers. That's 17,165 miles per hour at an altitude of 253 miles.",
			"image": {
				"smallImageUrl": "https://s3.amazonaws.com/alexaissinput/cardImageSmall.jpg",
				"largeImageUrl": "https://s3.amazonaws.com/alexaissinput/cardImageLarge.jpg"
			}
		},
		"reprompt": {
			"outputSpeech": {
				"type": "PlainText",
				"text": " "
			}
		},
		"shouldEndSession": true
	}
}
~~~

Tests are available for all functions, intents and slot values.

## Upload to AWS

Follow Amazon's [instructions here](http://docs.aws.amazon.com/lambda/latest/dg/nodejs-create-deployment-pkg.html) (you'll want to zip up everything inside the Lambda function folder and upload as a zip on the Lambda function configuration page).

## Alexa Skill Setup and Testing

Sign in at the Amazon Developer console, and follow [Amazon's instructions here](https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/overviews/steps-to-build-a-custom-skill). [Sample utterances](https://raw.githubusercontent.com/owntheweb/alexa-iss/master/skill/sampleUtterances.md) can be copied from the project page, along with the [intent schema](https://raw.githubusercontent.com/owntheweb/alexa-iss/master/skill/intentSchema.md).

## Generate alexaISSLonLatLookup DynamoDB Table

The alexaISSLonLatLookup table stores water body, country, state and city for every 0.1 degree longitude/latitude increments covering the Earth. This data is optional and the skill will work as long as the alexaISSLonLatLookup table and access policies are in place (empty or not).

***EXPERIMENTAL, COSTS INVOLVED:*** The resulting table takes several hours to create. It requires high write capacity and adds millions of records (costs involved). Accuracy is not 100% with some land areas returning empty values. It's recommended to revisit this process utilizing an OSM database and not use shapefiles when generating this database. Benefit: No need to run an OSM server or other server/service (which can cost more money over time).

While any configured computer could be used to generate the alexaISSLonLatLookup table, configuration time (and possibly network transfer time) was saved by launching a pre-configured community GDAL server on AWS Elastic Compute Cloud (EC2).

Visit the [AWS EC2 section](https://console.aws.amazon.com/ec2/v2/home) of the AWS console and choose the "Launch Instance" button. Open the "Community AMIs" panel on the left and search for "GDAL". At the time of writing, an Ubuntu instance of "ubuntu-precise-12.04-amd64-cartodb-dev-geos-postgis-gdal-sqlapi-windshaft-cartodb" was chosen. Choose the "Select" button. A compute optimized instant type is recommended (c3.xlarge was chosen at the time of writing). Choose the "Review and Launch" button. Review then choose the "Launch" button.

***Important:*** A c3.xlarge instance runs at $0.21/hour at the time of writing. If left running after the the script is finished for a month, thats over $150 (terminate the instance when finished to save money).

In the key pair window, choose "Create a new key pair", give it a name (e.g. alexaISSEC2KeyPair) then download the file. Move the file to a safe place that can be accessed from terminal. Check that you acknolodge then choose the "Launch Instances" button. A note mentioning "Your instances are now launching" is shown. Choose the instance name/link mentioned in the message to visit the instances list.

To connect via terminal, select the instance in the list, then choose the "Connect" button. A window will show with important access information. Based on that information, change the file permissions of the key pair for access requirements:

~~~
cd folder/with/keypair
chmod 400 alexaISSEC2KeyPair.pem
~~~

Then login using the downloaded key pair (this file can be reused):

~~~
ssh -i "alexaISSEC2KeyPair.pem" ubuntu@ec2-XXX-XXX-XXX-XXX.compute-X.amazonaws.com
~~~

Install Python requirements (saving time as these requirements require other GDAL-related programs):

~~~
#upgrade pip
sudo pip install setuptools --no-use-wheel --upgrade

#AWS SDK for Python (Boto3)
sudo pip install boto3

#AWS-CLI
sudo pip install awscli
~~~

Configure AWS-CLI with same test user info as local setup:

~~~
aws configure

#!!! CHECK IF STILL NEEDED NEXT ROUND:
#set AWS-CLI environment variables:
export AWS_ACCESS_KEY_ID='TEST_USER_ACCESS_KEY_HERE'
export AWS_SECRET_ACCESS_KEY='TEST_USER_SECRET_ACCESS_KEY_HERE'
export AWS_REGION='us-east-1'
~~~

Download shapefiles from [Natural Earth](http://www.naturalearthdata.com):

~~~
#get countries
wget http://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/cultural/ne_10m_admin_0_countries.zip
unzip ne_10m_admin_0_countries.zip

# get states/provinces
wget http://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/cultural/ne_10m_admin_1_states_provinces.zip
unzip ne_10m_admin_1_states_provinces.zip

# get points for populated placces e.g. cities
wget http://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/cultural/ne_10m_populated_places_simple.zip
unzip ne_10m_populated_places_simple.zip

# get water coverage and names
wget http://www.naturalearthdata.com/http//www.naturalearthdata.com/download/50m/physical/ne_50m_geography_marine_polys.zip
unzip ne_50m_geography_marine_polys.zip
~~~

Download the table generating script from the [project source](https://github.com/owntheweb/alexa-iss/blob/master/source/makeLonLatLookupTable/makeLonLatLookupTable.py):

~~~
wget https://raw.githubusercontent.com/owntheweb/alexa-iss/master/source/makeLonLatLookupTable/makeLonLatLookupTable.py
~~~

Write capacity for the alexaISSLonLatLookup table needs to be greatly increased to handle bulk write requests (6,480,000ish records over a few hours). In a browser, visit the [DynamoDB section](https://console.aws.amazon.com/dynamodb/home) of the AWS console and choose the "alexaISSLonLatLookup" table. In the "Capacity" tab, set the write capacity to 500 and choose the "Save" button.

***Important:*** Increasing capacity incurs more costs over time ($242 over a month at the time of writing if left active). Be sure to take this back down to 5 as soon as the table generating script is finished running to prevent large charges.

The last step is to run the generator script. This will take hours and it's good to monitor the metrics available in the "Metrics" tab (updated every minute) to track usage.

~~~
nohup nice -n 10 python makeLonLatLookupTable.py "-1800" "1800" "-900" "0" "i01p01" &
nohup nice -n 10 python makeLonLatLookupTable.py "-1800" "1800" "0" "900" "i01p02" &

~~~

The above example will run two processes at the same time, one handling the lower half of Earth, the other handling the upper hemisphere. Note: it was found that the upper hemisphere takes much longer to process. It may be wise to split this up differently next round.

***Reminder:*** Use at your own risk!

## Todo/Wishlist

* Enhance and recreate lonlatLookup table using OSM database/server instead of shapefiles.
* Generate Alexa app images that show ISS on a map.
* Create Space-Track.org TLE retrieval script; Space-Track.org a more direct source of data, requires submittal of [Orbital Data Request (ODR)](https://www.space-track.org/documentation) form.
* Days in orbit
* Days occupied
* Number of orbits?
* Perigee
* Apogee
* Orbital inclination
* Orbital decay rate?
* Crew details (how many?, who?, how to keep up with these details?)
* News (Where to grab the latest ISS-only news in a usable data feed with permission to use?)
* FAQs (e.g. What do astronauts eat on ISS? Who built ISS? How do people go to the bathroom on ISS? [That's a common one])
* ISS module details?

## Thank You

TLS data API courtesy of [wheretheiss.at](http://wheretheiss.at).

TLS data made available for public sharing by [Space-Track.Org](https://www.space-track.org)

The [satellite.js](https://github.com/shashwatak/satellite-js) project makes position calculations/predictions possible.

Geographic data made with [Natural Earth](http://www.naturalearthdata.com).

Quality coffee makers everywhere.

The [Space Foundation](http://www.spacefoundation.org) that enspires me to explore space in ways that I can!

## Legal

MIT License

Copyright (c) 2016 Christopher Stevens (www.christopherstevens.cc)

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