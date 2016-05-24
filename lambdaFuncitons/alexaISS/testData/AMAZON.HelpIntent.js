// test data for local event data tests
// tested utilizing https://www.npmjs.com/package/lambda-local

// $NODE_PATH -l index.js -h handler -e testData/AMAZON.HelpIntent.js 
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
      "name": "AMAZON.HelpIntent"
    },
    "type": "IntentRequest",
    "requestId": "request5678"
  }
};