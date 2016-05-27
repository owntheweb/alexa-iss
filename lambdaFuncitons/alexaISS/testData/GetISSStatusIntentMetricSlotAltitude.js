// test data for local event data tests
// tested utilizing https://www.npmjs.com/package/lambda-local

// To use: 
// cd lambdaFuncitons/alexaISS
// lambda-local -l index.js -h handler -e testData/GetISSStatusIntentMetricSlotAltitude.js

module.exports = {
  "session": {
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
  "version": "1.0",
  "request": {
    "intent": {
      "slots": {
        "Metric": {
          "name": "Metric",
          "value": "altitude"
        }
      },
      "name": "GetISSStatus"
    },
    "type": "IntentRequest",
    "requestId": "request5678"
  }
};