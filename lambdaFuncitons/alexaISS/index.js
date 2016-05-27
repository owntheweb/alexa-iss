/*
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
*/

'use strict';


//////////////
// settings //
//////////////

// used to prevent someone else from configuring a skill that sends requests to this function (check skipped if '')
let appID = '';

//title of the skill to show in cards
let skillTitle = 'Tracker for International Space Station (ISS)';

// home of stored TLE data collected from api.wheretheiss.at or other source with scheduled Lambda function
let tleTable = 'alexaISSOrbitalObjects';

// generated table containing major water body, country, state/provice and city for lons/lats rounded to 0.1 degree
let lonLatLookupTable = 'alexaISSLonLatLookup';

// home of images used in this skill, inlcuding default response card large and small image
let inputBucket = 'alexaissinput';

//////////////
// includes //
//////////////

// Amazon Web Services
let aws = require('aws-sdk');

// DynamoDB
let doc = require('dynamodb-doc');
let docClient = new doc.DynamoDB();

// satellite.js
let satellite = require('satellite.js');


//////////////////////////////
// handle incoming requests //
//////////////////////////////

// Route the incoming request based on type (LaunchRequest, IntentRequest,
// etc.) The JSON body of the request is provided in the event parameter.
exports.handler = function (event, context) {
	try {
		//console.log("event.session.application.applicationId=" + event.session.application.applicationId);

		// prevent someone else from configuring a skill that sends requests to this function.
		if(appID !== '') {
			if(event.session.application.applicationId !== appID) {
				 context.fail("Invalid Application ID");
			}
		}

		if(event.session.new) {
			onSessionStarted({requestId: event.request.requestId}, event.session);
		}

		if(event.request.type === "LaunchRequest") {
			onLaunch(event.request, event.session, function callback(sessionAttributes, speechletResponse) {
				context.succeed(buildResponse(sessionAttributes, speechletResponse));
			});
		} else if(event.request.type === "IntentRequest") {
			onIntent(event.request, event.session, function callback(sessionAttributes, speechletResponse) {
				context.succeed(buildResponse(sessionAttributes, speechletResponse));
			});
		} else if(event.request.type === "SessionEndedRequest") {
			onSessionEnded(event.request, event.session);
			context.succeed();
		}
	} catch(e) {
		context.fail("Exception: " + e);
	}
};


//////////////////
// skill events //
//////////////////

// called when the session starts
function onSessionStarted(sessionStartedRequest, session) {
	console.log("onSessionStarted requestId=" + sessionStartedRequest.requestId + ", sessionId=" + session.sessionId);
}

// called when the user launches the skill without specifying what they want
function onLaunch(launchRequest, session, callback) {
	console.log("onLaunch requestId=" + launchRequest.requestId + ", sessionId=" + session.sessionId);

	// dispatch to skill's launch
	getWelcomeResponse(callback);
}

// called when the user specifies an intent for this skill
function onIntent(intentRequest, session, callback) {
	console.log("onIntent requestId=" + intentRequest.requestId + ", sessionId=" + session.sessionId);

	var intent = intentRequest.intent;
	var intentName = intentRequest.intent.name;
	
	if("GetISSStatus" === intentName) {
		getISSStatus(intent, session, callback);
	} else if("GetISSStatusSpeed" === intentName) {
		//I'm calling this a status "helper intent" for for the GetISSStatus intent.
		//It's covered as a metric in GetISSStatus intent, but asked in a unique way making its way here.
		//Send to getISSStatus() with speed slot added.
		var intent = {
			slots: { 
				Metric: { 
					name: 'Metric', 
					value: 'speed' 
				}
			}
		};
		getISSStatus(intent, session, callback);
	} else if("GetISSStatusAltitude" === intentName) {
		//"helper intent" for for the GetISSStatus intent.
		var intent = { slots: { Metric: { name: 'Metric', value: 'altitude' }}};
		getISSStatus(intent, session, callback);
	} else if("GetISSStatusPeriod" === intentName) {
		//"helper intent" for for the GetISSStatus intent.
		var intent = { slots: { Metric: { name: 'Metric', value: 'period' }}};
		getISSStatus(intent, session, callback);
	} else if("GetISSStatusSize" === intentName) {
		//"helper intent" for for the GetISSStatus intent.
		var intent = { slots: { Metric: { name: 'Metric', value: 'size' }}};
		getISSStatus(intent, session, callback);
	} else if("AMAZON.HelpIntent" === intentName) {
		getHelpResponse(callback);
	} else {
		throw "Invalid intent";
	}
}

// called when the user ends the session
// is not called when the skill returns shouldEndSession=true
function onSessionEnded(sessionEndedRequest, session) {
	//console.log("onSessionEnded requestId=" + sessionEndedRequest.requestId + ", sessionId=" + session.sessionId);
	// Add cleanup logic here
	// !!! not needed thus far, but keeping function handy for reference at this time
}


////////////////////
// skill behavior //
////////////////////

function getWelcomeResponse(callback) {
	// If we wanted to initialize the session to have some attributes we could add those here.
	var sessionAttributes = {};

	var cardTitle = skillTitle + ": Welcome";
	var speechOutput = skillTitle + ". Say something like, 'how long does it take to orbit the Earth' or, 'give me a status update'. How would you like to proceed?";
	// If the user either does not reply to the welcome message or says something that is not
	// understood, they will be prompted again with this text.
	var repromptText = "Ask something such as, 'Where is ISS?'";
	var shouldEndSession = false;

	callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
}

function getHelpResponse(callback) {
	var sessionAttributes = {};
	var cardTitle = skillTitle + ": Help";
	var speechOutput = "Track the status of the International Space Station (ISS). You can ask me questions such as, 'Where is the International Space Station?', 'How long does it take ISS to orbit the Earth?', 'How fast is ISS?'";
	var repromptText = "Ask a question such as, 'What is the status of ISS?'";
	var shouldEndSession = false;

	callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
}

// Get International Space Station status data
function getISSStatus(intent, session, callback) {
	// First we'll build ISS status data for the GetISSStatus intent.
	// Then we'll generate an specific status response based on the intent slot(s).

	//get TLE data
	var tleParams = {};
	tleParams.Key = {satCatNumber: 25544};
	tleParams.TableName = tleTable;
	docClient.getItem(tleParams, function(err, data) {
		if(err) {
			console.log(err, err.stack);
			throw "Response Table Access Error";
		} else {
			// TLE data received. Now append in geographic features based on latitude and longitude.

			// Initialize a satellite record with starting calculated status info
			var satData = buildSatData(data.Item.data.TLE_LINE1, data.Item.data.TLE_LINE2);

			// get location point of interest info for current lat/lon (e.g. city, state, country)
			if(satData.hasOwnProperty('latitudeDeg') && satData.hasOwnProperty('longitudeDeg')) {
				
				// db primary partition key consists of lon[-]X.Xlat[-]Y.Y for quick db lookups
				var lonLatKey = "lon" + (Math.round(satData.longitudeDeg * 10) / 10).toFixed(1) + "lat" + (Math.round(satData.latitudeDeg * 10) / 10).toFixed(1);

				// get lon/lat geo feature data
				var lonlatParams = {};
				lonlatParams.Key = {lonlat: lonLatKey};
				lonlatParams.TableName = lonLatLookupTable;
				docClient.getItem(lonlatParams, function(lonLatErr, lonLatData) {
					if(lonLatErr) {
						console.log(lonLatErr, lonLatErr.stack);
						throw "Response Table Access Error";
					} else {
						// Lon/lat geo feature data received. Add data and build a response with available data.
						
						if(lonLatData.hasOwnProperty('Item') && lonLatData.Item.hasOwnProperty('data') && lonLatData.Item.data.hasOwnProperty('water')) {
							// We found water! (even if water was ' ', a result to talk about has been returned)
							satData.water = cleanWater(lonLatData.Item.data.water);
							satData.country = lonLatData.Item.data.country;
							satData.state = lonLatData.Item.data.state;
							satData.city = lonLatData.Item.data.city;
						} else {
							// no results
							satData.water = ' '; // ' ' matches DynamoDB non-empty requirements, perhaps just skip these empty values next time...
							satData.country = ' ';
							satData.state = ' ';
							satData.city = ' ';
						}

						// build response!
						// first, check for intent slot value present
						if(intent.hasOwnProperty('slots') && intent.slots.hasOwnProperty('Metric')) {
							var metric = intent.slots.Metric.value;

							// Determine what satus-specific response to build based on the metric value was passed
							switch(metric) {
								case 'location':
									callback(session, buildISSFullStatusResponse(satData));
								case 'position':
									callback(session, buildISSFullStatusResponse(satData));
								case 'status':
									callback(session, buildISSFullStatusResponse(satData));
								case 'status update':
									callback(session, buildISSFullStatusResponse(satData));
								case 'update':
									callback(session, buildISSFullStatusResponse(satData));
								case 'latitude':
									callback(session, buildISSLatitudeStatusResponse(satData));
								case 'longitude':
									callback(session, buildISSLongitudeStatusResponse(satData));
								case 'altitude':
									callback(session, buildISSAltitudeStatusResponse(satData));
								case 'elevation':
									callback(session, buildISSAltitudeStatusResponse(satData));
								case 'speed':
									callback(session, buildISSSpeedStatusResponse(satData));
								case 'velocity':
									callback(session, buildISSVelocityStatusResponse(satData));
								case 'size':
									callback(session, buildISSSizeStatusResponse(satData));
								case 'dimensions':
									callback(session, buildISSSizeStatusResponse(satData));
								case 'weight':
									callback(session, buildISSWeightStatusResponse(satData));
								case 'mass':
									callback(session, buildISSMassStatusResponse(satData));
								case 'volume':
									callback(session, buildISSVolumeStatusResponse(satData));
								case 'orbital period':
									callback(session, buildISSPeriodStatusResponse(satData));
								case 'period':
									callback(session, buildISSPeriodStatusResponse(satData));
								default:
									// Some other metric was provided that hasn't been properly accounted for yet...
									callback(session, buildISSFullStatusResponse(satData));
							}

						} else {
							// Return default, full response if no intent slot was specified.
							// This is normal. Intents can be called without a specific slot value set.
							callback(session, buildISSFullStatusResponse(satData));
						}
					}
				});

			} else {
				throw "Calculated Latitude and Longitude Invalid";
			}
		}
	});
}

//calculate satellite data used in most responses
//thanks!: https://github.com/shashwatak/satellite-js
function buildSatData(line1, line2) {
	var satData = {};

	var sat = satellite.satellite;

	// Initialize a satellite record
	var satrec = sat.twoline2satrec(line1, line2);

	//  Propagate satellite using current time
	var now = new Date();
	var positionAndVelocity = sat.propagate(
		satrec,
		now.getUTCFullYear(),
		now.getUTCMonth() + 1, // Note, this function requires months in range 1-12.
		now.getUTCDate(),
		now.getUTCHours(),
		now.getUTCMinutes(),
		now.getUTCSeconds()
	);

	satData.gmst = sat.gstimeFromDate(
		now.getUTCFullYear(),
		now.getUTCMonth() + 1, // Note, this function requires months in range 1-12.
		now.getUTCDate(),
		now.getUTCHours(),
		now.getUTCMinutes(),
		now.getUTCSeconds()
	);

	// The position_velocity result is a key-value pair of ECI coordinates.
	// These are the base results from which all other coordinates are derived.
	satData.positionEci = positionAndVelocity.position;
	satData.velocityEci = positionAndVelocity.velocity;
	
	satData.positionGd = sat.eciToGeodetic(satData.positionEci, satData.gmst);
	satData.longitude = satData.positionGd.longitude;
	satData.latitude = satData.positionGd.latitude;
	satData.height = satData.positionGd.height;

	satData.longitudeDeg = sat.degreesLong(satData.longitude);
	satData.latitudeDeg = sat.degreesLat(satData.latitude);

	satData.speed = Math.sqrt(Math.pow(satData.velocityEci.x * 60 * 60, 2) + Math.pow(satData.velocityEci.y * 60 * 60, 2) + Math.pow(satData.velocityEci.z * 60 * 60, 2));

	return satData;
}


/////////////////////
// build responses //
/////////////////////

// Build the full ISS status response.
function buildISSFullStatusResponse(satData) {
	//var imageRequestID = generateImageRequestID();
	var cardTitle = "ISS Status";
	var speechOutput = "";
	var repromptText = " ";
	var shouldEndSession = true;

	speechOutput += "At a latitude of " + Math.round(satData.latitudeDeg) + " and longitude of " + Math.round(satData.longitudeDeg) + ", ISS is currently ";
	
	if(satData.water !== ' ' || satData.city !== ' ' || satData.state !== ' ' || satData.country !== ' ') {
		speechOutput += "over ";
	}

	if(satData.water !== ' ') {
		speechOutput += "the " + satData.water + ", ";
	}
	
	if(satData.city !== ' ') {
		speechOutput += satData.city + ", ";
	}
	
	if(satData.state !== ' ' && satData.state !== satData.country) {
		speechOutput += satData.state + ", ";
	}
	
	if(satData.country !== ' ') {
		speechOutput += satData.country + ", ";
	}
	
	speechOutput += "traveling at " + formatNumber(satData.speed) + " kilometers per hour at an altitude of " + formatNumber(satData.height) + " kilometers. ";
	speechOutput += "That's " + formatNumber(kilometersToMiles(satData.speed)) + " miles per hour at an altitude of " + formatNumber(kilometersToMiles(satData.height)) + " miles.";

	return buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession);
}

// Build the latitude ISS status response.
function buildISSLatitudeStatusResponse(satData) {
	var cardTitle = "ISS Status: Latitude";
	var repromptText = " ";
	var shouldEndSession = true;
	var speechOutput = "ISS is currently at a latitude of " + Math.round(satData.latitudeDeg) + ".";

	return buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession);
}

// Build the longitude ISS status response.
function buildISSLongitudeStatusResponse(satData) {
	var cardTitle = "ISS Status: Longitude";
	var repromptText = " ";
	var shouldEndSession = true;
	var speechOutput = "ISS is currently at a longitude of " + Math.round(satData.longitudeDeg) + ".";

	return buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession);
}

// Build the altitude ISS status response.
function buildISSAltitudeStatusResponse(satData) {
	var cardTitle = "ISS Status: Altitude";
	var repromptText = " ";
	var shouldEndSession = true;
	var speechOutput = "ISS is currently at an altitude of " + formatNumber(satData.height) + " kilometers. That's " + formatNumber(kilometersToMiles(satData.height)) + " miles.";

	return buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession);
}

// Build the speed ISS status response.
function buildISSSpeedStatusResponse(satData) {
	var cardTitle = "ISS Status: Speed";
	var repromptText = " ";
	var shouldEndSession = true;
	var speechOutput = "ISS is currently traveling at " + formatNumber(satData.speed) + " kilometers per hour. That's " + formatNumber(kilometersToMiles(satData.speed)) + " miles per hour.";

	return buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession);
}

// Build the velocity ISS status response.
function buildISSVelocityStatusResponse(satData) {
	var cardTitle = "ISS Status: Velocity";
	var repromptText = " ";
	var shouldEndSession = true;
	var speechOutput = "ISS is currently traveling at an x velocity of " + (Math.round(satData.velocityEci.x * 1000) / 1000) + " kilometers per second, a y velocity of " + (Math.round(satData.velocityEci.y * 1000) / 1000) + " kilometers per second and a z velocity of " + (Math.round(satData.velocityEci.z * 1000) / 1000) + " kilometers per second. That's a speed of " + formatNumber(satData.speed) + " kilometers per hour, or " + formatNumber(kilometersToMiles(satData.speed)) + " miles per hour.";

	return buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession);
}

// Build the size ISS status response.
// source: http://www.nasa.gov/mission_pages/station/overview/index.html
function buildISSSizeStatusResponse(satData) {
	var cardTitle = "ISS Status: Size";
	var repromptText = " ";
	var shouldEndSession = true;
	var speechOutput = "ISS is roughly the size of an American football field.";

	return buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession);
}

// Build the weight ISS status response.
// source: https://en.wikipedia.org/wiki/International_Space_Station
function buildISSWeightStatusResponse(satData) {
	var cardTitle = "ISS Status: Weight";
	var repromptText = " ";
	var shouldEndSession = true;
	var speechOutput = "Without gravity at play, ISS does not have weight. The mass of ISS is approximately 419,455 kilograms, or 924,740 pounds.";

	return buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession);
}

// Build the weight ISS status response.
// source: https://en.wikipedia.org/wiki/International_Space_Station
function buildISSMassStatusResponse(satData) {
	var cardTitle = "ISS Status: Mass";
	var repromptText = " ";
	var shouldEndSession = true;
	var speechOutput = "The mass of ISS is approximately 419,455 kilograms, or 924,740 pounds.";

	return buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession);
}

// Build the volume ISS status response.
// source: https://en.wikipedia.org/wiki/International_Space_Station
function buildISSVolumeStatusResponse(satData) {
	var cardTitle = "ISS Status: Volume";
	var repromptText = " ";
	var shouldEndSession = true;
	var speechOutput = "The pressurised volume of ISS is approximately 916 meters cubed, or 32,300 cubic feet.";

	return buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession);
}

// Build the orbital period ISS status response.
// source: Peat, Chris (25 January 2015). "ISS - Orbit". Heavens-Above. Retrieved 25 January 2015.
// source link: http://www.heavens-above.com/orbit.aspx?satid=25544
function buildISSPeriodStatusResponse(satData) {
	var cardTitle = "ISS Status: Orbital Period";
	var repromptText = " ";
	var shouldEndSession = true;
	var speechOutput = "ISS orbits the Earth every 92.69 minutes. That's approximately 15.55 orbits around the Earth per day.";

	return buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession);
}


//////////////////////
// helper functions //
//////////////////////

// Return text and card output for response
function buildSpeechletResponse(title, output, repromptText, shouldEndSession) {
	return {
		outputSpeech: {
			type: "PlainText",
			text: output
		},
		card: {
			type: "Standard",
			title: title,
			text: output,
			image: {
				smallImageUrl: "https://s3.amazonaws.com/" + inputBucket + "/cardImageSmall.jpg",
				largeImageUrl: "https://s3.amazonaws.com/" + inputBucket + "/cardImageLarge.jpg"
			}
		},
		reprompt: {
			outputSpeech: {
				type: "PlainText",
				text: repromptText
			}
		},
		shouldEndSession: shouldEndSession
	};
}


function buildResponse(sessionAttributes, speechletResponse) {
	return {
		version: "1.0",
		sessionAttributes: sessionAttributes,
		response: speechletResponse
	};
}

// round and add commas
//thanks: http://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascript
function formatNumber(number) {
	var number = Math.round(number);
	var formatted = number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return formatted;
}

//Convert kilometers to miles for those people who haven't adopted the metric system yet.
function kilometersToMiles(kilometers) {
	var miles = kilometers * 0.621371;
	return miles;
}

// I wasn't happy with ALL CAPS titles for some bodies of water and extra spaces in others.
function cleanWater(text) {
	text = text.replace("ARCTIC OCEAN","Arctic Ocean");
	text = text.replace("SOUTHERN OCEAN","Southern Ocean");
	text = text.replace("NORTH ATLANTIC OCEAN","North Atlantic Ocean");
	text = text.replace("NORTH PACIFIC OCEAN","North Pacific Ocean");
	text = text.replace("SOUTH PACIFIC OCEAN","South Pacific Ocean");
	text = text.replace("INDIAN OCEAN","Indian Ocean");
	text = text.replace("SOUTH ATLANTIC OCEAN","South Atlantic Ocean");
	text = text.replace("Caribbean  Sea","Caribbean Sea");
	text = text.replace("Tasman  Sea","Tasman Sea");

	return text;
}