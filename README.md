# Amazon Alexa ISS Skill

![ISS skill icon](https://raw.githubusercontent.com/owntheweb/alexa-iss/master/source/graphics/alexaISSIcon108.jpg)

## Overview

Where is the International Space Station right now? The International Space Station (ISS) Alexa Skill will tell you its longitude, latitude, speed, altitude and nearby geographical features as it orbits around the Earth faster than a speeding bullet.

TLS data courtesy of [wheretheiss.at](http://wheretheiss.at). Geographic data made with [Natural Earth](http://www.naturalearthdata.com/).

The ISS skill was created as part of an entry for the "Hey Alexa! The Amazon Alexa Skill Contest" at [Hackster.io](http://hackster.io) (contest entry link coming soon). With that, it has been posted here for your benefit. Contributions to improve the skill are also welcome.

This skill was also created in an effort to better understand Amazon Web Services (AWS) Lambda functions, AWS Simple Storage Service (S3), AWS DynamoDB and AWS security policies and Node.js.

## Support

Need to report a bug or have a feature request? Please create an [issue here](https://github.com/owntheweb/alexa-iss/issues).

## Setup Summary

*To be continued in shortly...*

## Amazon Web Services Setup

*To be continued in shortly...*

## Local Installation

For development purposes, this skill can be installed and tested locally prior to uploading to Amazon Web Services as a Lambda function. While it's possilble to alter and upload Lambda functions as a .zip file and test in AWS, frequent alterations may result in time savings if tested locally first.

### Clone Amazon Alexa ISS Skill Repository

Note: Git is required to clonet this repository. Git Installation instructions can be found [here](https://help.github.com/articles/set-up-git/).

~~~
cd ~/
git clone git://github.com/owntheweb/alexa-iss.git
~~~

#### Install Node.js Depencencies (required prior to upload)

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

*To be continued in shortly...*

### Install lamnda-local via npm

In order to run Lambda functions locally for testing, install lamnda-local globally.

~~~
npm install -g lambda-local
~~~

*To be continued in shortly...*

## Configure Scripts

*To be continued in shortly...*

## Testing

*To be continued in shortly...*

## Alexa Skill Setup

*To be continued in shortly...*

## Todo

* Use request-then or request node.js module, but not both!
* Enhance and recreate lonlatLookup table using OSM database/server instead of shapefiles
* *To be continued in shortly...*

## Thank You

*To be continued in shortly...*

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