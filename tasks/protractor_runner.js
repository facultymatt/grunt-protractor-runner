/*
 * grunt-protractor-runner
 * https://github.com/teerapap/grunt-protractor-runner
 *
 * Copyright (c) 2013 Teerapap Changwichukarn
 * Licensed under the MIT license.
 */

'use strict';

var util = require('util');
var async = require('async');

module.exports = function(grunt) {

  grunt.registerMultiTask('protractor', 'A grunt task to run protractor.', function() {
    // Merge task-specific and/or target-specific options with these defaults.
    var opts = this.options({
      configFile: 'node_modules/protractor/referenceConf.js',
      keepAlive: true,
      noColor: false,
      debug: false,
      args: {},
      many: false
    });

    // configFile is a special property which need not to be in options{} object.
    if (!grunt.util._.isUndefined(this.data.configFile)) {
      opts.configFile = this.data.configFile;
    }

    grunt.verbose.writeln("Options: " + util.inspect(opts));

    var keepAlive = opts['keepAlive'];
    var strArgs = ["seleniumAddress", "seleniumServerJar", "seleniumPort", "baseUrl", "rootElement", "browser","chromeDriver","chromeOnly"];
    var listArgs = ["specs"];
    var boolArgs = ["includeStackTrace", "verbose"];
    
    // is this a many browser test? 
    // @todo parse actual config, looking for array of capabilities
    // instead of checking boolean
    var many = opts["many"];

    // @note this is broken unless protractor is install locally.? 
    var args = ['./node_modules/protractor/bin/protractor', opts.configFile];
    if (opts.noColor){
      args.push('--no-jasmineNodeOpts.showColors');
    }
    if (!grunt.util._.isUndefined(opts.debug) && opts.debug === true){
      args.splice(1,0,'debug');
    }

    // Iterate over all supported arguments.
    strArgs.forEach(function(a) {
      if (a in opts.args || grunt.option(a)) {
        args.push('--'+a, grunt.option(a) || opts.args[a]);
      }
    });
    listArgs.forEach(function(a) {
      if (a in opts.args || grunt.option(a)) {
        args.push('--'+a,  grunt.option(a) || opts.args[a].join(","));
      }
    });
    boolArgs.forEach(function(a) {
      if (a in opts.args || grunt.option(a)) {
        args.push('--'+a);
      }
    });

    // Convert params object to --params.key1 val1 --params.key2 val2 ....
    (function convert(prefix, obj, args) {
      for (var key in obj) {
        var val = obj[key];
        var type = typeof obj[key];
        if (type === "object") {
          if (Array.isArray(val)) {
            // Add duplicates --params.key val1 --params.key val2 ...
            for (var i=0;i<val.length;i++) {
              args.push(prefix+"."+key, val[i]);
            }
          } else {
            // Dig deeper
            convert(prefix+"."+key, val, args);
          }
        } else if (type === "undefined" || type === "function") {
          // Skip these types
        } else if (type === "boolean") {
          // Add --params.key
          args.push(prefix+"."+key);
        } else {
          // Add --params.key value
          args.push(prefix+"."+key, val);
        }
      }
    })("--params", opts.args.params, args); // initial arguments

    grunt.verbose.writeln("Spwan node with arguments: " + args.join(" "));

    // async function to call when grunt command is done
    var done = this.async();

    // array to hold our tests
    var allTests = [];

    // function that will run our test
    // given single set of arguments from grunt task config
    var runOne = function(callback) {
      grunt.util.spawn({
          cmd: 'node',
          args: args,
          opts: {
            stdio:'inherit'
          }
        },
        // callback on spawn task completion
        // accepts three params
        // @see http://gruntjs.com/api/grunt.util#grunt.util.spawn 
        function(error, result, code) {
          console.log('test is done');
          callback(null, 'one');
        }
      );

    };

    // mock data
    // @todo return actual results from grunt spawns
    var data = {
      error: false,
      result: false,
      code: 0
    };

    // done function is called when async series is done
    // @todo parse actual data from all calls
    var doneFn = function(err, theData) {
      
      var error = data.error; 
      var result = data.result; 
      var code = data.code;

      if (error) {
        grunt.log.error(String(result));
        if(code === 1 && keepAlive) {
          // Test fails but do not want to stop the grunt process.
          grunt.log.oklns("Test failed but keep the grunt process alive.");
          done();
          done = null;
        } else {
          // Test fails and want to stop the grunt process,
          // or protractor exited with other reason.
          grunt.fail.fatal('protractor exited with code: '+code, 3);
        }
      } else {
        done();
        done = null;
      }

    };

    // mock many tests
    // @todo get from browser spec
    if(!many) {
      allTests.push(runOne);
    } else {
      for (var i = 0; i < 3; i++) {
        allTests.push(runOne);
      }
    }

    // run all tests in aysnc series. 
    // @todo support parallel, although this brings up challenges
    // around logging results
    async.series(allTests, doneFn);

  });

};
