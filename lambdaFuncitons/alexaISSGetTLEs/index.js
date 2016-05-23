'use strict';

// Get TLEs from "Where the ISS at?" API and store TLE data in DynamoDB.
// This Lambda Function is scheduled, recommended to once every 24 hours.

// see any "!!!" denoting areas of mystery and improvement needed

//////////////
// settings //
//////////////

// home DynamoDB table of stored TLE data collected from api.wheretheiss.at with scheduled Lambda function
let tleTable = 'alexaISSOrbitalObjects';

// thank you: http://wheretheiss.at/w/developer
let tleRequestURL = 'https://api.wheretheiss.at/v1/satellites/25544/tles';

//////////////
// includes //
//////////////

// Amazon Web Services
let aws = require('aws-sdk');

// request wrapper functions
let request = require('request');

// DynamoDB
let doc = require('dynamodb-doc');
let docClient = new doc.DynamoDB();

//////////////////////////////
// handle incoming requests //
//////////////////////////////

exports.handler = function (event, context) {
	try {

		// load TLE data
		request(
			{
				url: tleRequestURL
			},
			function (error, response, body) {
				if (!error && response.statusCode == 200) {
					
					// parse received TLE data
					var tleData = JSON.parse(body);
					var line1 = tleData.line1;
					var line2 = tleData.line2;

					// update stored data in DynamoDB
					// keys in 'data' to match keys provided by space-track.org API (more direct source of data)
					var params = {};
					params.TableName = tleTable;
					params.Item = {
						'satCatNumber': 25544,
						'data': {
							'TLE_LINE1': line1,
							'TLE_LINE2': line2,
						}
					}
					
					//update data
					docClient.putItem(params, function(error, data) {
						if(error) {
							console.log(error, error.stack);
							context.fail("Exception: " + error);
						} else {
							console.log('TLE data saved!');
							context.succeed('TLE data saved!');
						}
					});

				} else {
					context.fail("Exception: " + error);
				}
			}
		);
	} catch(error) {
		console.log(error, error.stack);
		context.fail("Exception: " + error);
	}
};