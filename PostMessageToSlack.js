var assert = require('assert');
var AWS = require('aws-sdk');
var https = require('https');
var url = require('url');

exports.handler = function(event, context) {

  var codepipeline = new AWS.CodePipeline();

  // Retrieve the Job ID from the Lambda action
  var jobId = event["CodePipeline.job"].id;

  // Notify AWS CodePipeline of a successful job
  var putJobSuccess = function(message) {
	var params = {
	  jobId: jobId
	};

	codepipeline.putJobSuccessResult(params, function(err, data) {
	  if(err) {
		context.fail(err);
	  } else {
		context.succeed(message);
	  }
	});
  };

  // Notify AWS CodePipeline of a failed job
  var putJobFailure = function(message) {
	var params = {
	  jobId: jobId,
	  failureDetails: {
		message: JSON.stringify(message),
		type: 'JobFailed',
		externalExecutionId: context.invokeid
	  }
	};

	codepipeline.putJobFailureResult(params, function(err, data) {
	  context.fail(message);
	});
  };

  var getUserParams = function(event) {
	result = {
	  token: 0,
	  channel: ''
	};

	try {
	  // Retrieve the value of UserParameters from the Lambda action configuration in
	  // AWS CodePipeline
	  var userParamsAsString = event["CodePipeline.job"].data.actionConfiguration.configuration.UserParameters;
	  console.log("userParamsAsString", userParamsAsString);

	  var userParams = JSON.parse(userParamsAsString);
	  console.log("userParams", userParams);

	  result.token = userParams.token;
	  result.channel = userParams.channel;
	} catch(ex) {
	  console.error("Cannot parse user supplied params", ex);
	  result.error = ex;
	  throw ex;
	}

	return result;
  };

  // Helper function to make a HTTP POST request to the page.
  // The helper will test the response and succeed or fail the job accordingly
  var postMessageToSlack = function(callback) {

	var responseObject = {
	  body: '',
	  statusCode: 0
	};

	var userParams = getUserParams(event);

	var pathData = {
	  pathname: '/api/chat.postMessage',
	  query: {
		token: userParams.token,
		text: dogSays(),
		channel: userParams.channel,
		icon_emoji: ":dog:",
		username: "dogbot"
	  }
	};

	var path = url.format(pathData);

	var postOptions = {
	  hostname: 'slack.com',
	  path: path,
	  method: 'GET'
	};

	console.log("https.request", postOptions);
	
	var req = https.request(postOptions, function(response) {
	  responseObject.statusCode = response.statusCode;

	  response.on('data', function (chunk) {
		responseObject.body += chunk;
	  });

	  response.on('end', function () {
		callback(responseObject);
	  });

	  response.resume();
	});

	req.on('error', function(error) {
	  // Fail the job if our request failed
	  putJobFailure(error);
	});
	
	console.log("ending the https request");
	req.end();
  };

  var dogSays = function() {
    var sayings = [
      'Be the person your dog thinks you are',
      "It's not the size of the dog in the fight, it's the size of the fight in the dog",
      "People often say that motivation doesn't last.  Well, neither does bathing - that's why we recommend it daily",
      "Outside of a dog, a book is man's best friend. Inside of a dog it's too dark to read.",
      "If you pick up a starving dog and make him prosperous he will not bite you. This is the principal difference between a dog and man.",
      'woof',
      "The better I get to know men, the more I find myself loving dogs.",
    ];

	var index = Math.floor(Math.random() * (sayings.length -1));

	return sayings[index];
  };

  postMessageToSlack(function(returnedPage) {
	try {
	  // Check if the HTTP response has a 200 status.
	  // Slack returns a JSON blob in the response which we could parse for an
	  // "ok" value, but I'll skip it for this demo.
	  assert(returnedPage.statusCode === 200);

	  // Succeed the job
	  console.log("sending putJobSuccess to CodePipeline");
	  
	  putJobSuccess("Tests passed.");
	} catch (ex) {
	  // If any of the assertions failed then fail the job
	  putJobFailure(ex);
	  console.error(ex);
	}
  });
};
