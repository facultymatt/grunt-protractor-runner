/*
 * grunt-protractor-runner
 * https://github.com/teerapap/grunt-protractor-runner
 *
 * Copyright (c) 2013 Teerapap Changwichukarn
 * Licensed under the MIT license.
 */

'use strict';

var util = require('util');
var path = require('path');
var _ = require('lodash');
var async = require('async');

module.exports = function(grunt) {

  grunt.registerMultiTask('protractor', 'A grunt task to run protractor.', function() {
    // Merge task-specific and/or target-specific options with these defaults.
    var opts = this.options({
      // @note this requires protractor is installed locally
      // which is not in current readme
      configFile: 'node_modules/protractor/referenceConf.js',
      keepAlive: true,
      noColor: false,
      debug: false,
      args: {}
    });

    // configFile is a special property which need not to be in options{} object.
    if (!grunt.util._.isUndefined(this.data.configFile)) {
      opts.configFile = this.data.configFile;
    }

    // read the config file, so we can parse the capabilities
    // option as array or object
    var readConf = require(path.relative(__dirname, opts.configFile));

    // merge parsed config file into our options
    // @todo check order against protractor to keep consistent
    // protractor priority (between config and params) should go second
    opts.args = _.merge(readConf.config, opts.args);

    // @todo spec urls are broken! 
    // opts.args.specs.forEach(function(spec, key) {
    //   opts.args.specs[key] = path.relative(process.cwd(), spec);
    // });

    // flag for many tests
    var many = false;
    var howMany = 0;
    var browserList = [];

    // check if capabilities is an object / array
    // in which case first array key will be object
    // we delete opts.args.capabilities because we don't want to pass them
    // into our params parser. If no capabilities are specified we
    // assume user is trying to use "browser" param instead of capabilities
    if (opts.args.capabilities && typeof opts.args.capabilities[0] === 'object') {
      browserList = opts.args.capabilities;
      delete opts.args.capabilities;
    } else if (opts.args.capabilities) {
      browserList[0] = opts.args.capabilities;
      delete opts.args.capabilities;
    }

    // set length based on number of browsers
    howMany = browserList.length;

    // async function to call when grunt command is done
    var done = this.async();

    // create async queue
    // with a limit of 1, this allows us to 
    var q = async.queue(function(task, callback) {

      grunt.log.oklns('starting test #' + (task.number + 1));
      console.log(task.capability);

      // @todo parse entire config file as params, 
      // because we'll need to adjust browser for each test to make
      // this setup work. Currently we just pass a filename for conf
      // and that relies on protractor to process many tests, which wont work
      // we need to run protract many times from our end. 
      // - read conf
      // - for each capability, create full set of params. But over-ride the
      //   capability with the browser using capabilities[key]
      // - spawn grunt


      grunt.verbose.writeln("Options: " + util.inspect(opts));

      // these all could be present in the 
      // grunt.options object
      // with the exception of: 
      // - configFile, which can be left blank
      // - keepAlive, which is at root level for some reason? 
      //
      // in general the use of options AND options.args is confusing
      // and I don't understand the need for it. 
      //
      var keepAlive = opts['keepAlive'];
      var strArgs = ["seleniumAddress", "seleniumServerJar", "seleniumPort", "baseUrl", "rootElement", "browser", "chromeDriver", "chromeOnly"];
      var listArgs = ["specs"];
      var boolArgs = ["includeStackTrace", "verbose"];

      // this is the browser object as sauceLabs expects it
      var capability = {
        browser: null,
        platform: null,
        version: null
      };

      var capabilityArgs = ["browser", "browserName", "platform", "version"];

      // @note this is broken unless protractor is install locally.? 
      var args = ['./node_modules/protractor/bin/protractor'];

      // crude but working implementation of building browser 
      // config on per task basis
      if (task.capability) {
        opts.args.capabilities = {};
        capabilityArgs.forEach(function(cap) {
          if (task.capability[cap]) {
            args.push('--capabilities.' + cap, task.capability[cap]);
          }
        });
      }

      if (opts.noColor) {
        args.push('--no-jasmineNodeOpts.showColors');
      }
      if (!grunt.util._.isUndefined(opts.debug) && opts.debug === true) {
        args.splice(1, 0, 'debug');
      }

      // Iterate over all supported arguments.
      strArgs.forEach(function(a) {
        if (a in opts.args || grunt.option(a)) {
          args.push('--' + a, grunt.option(a) || opts.args[a]);
        }
      });
      listArgs.forEach(function(a) {
        if (a in opts.args || grunt.option(a)) {
          args.push('--' + a, grunt.option(a) || opts.args[a].join(","));
        }
      });
      boolArgs.forEach(function(a) {
        if (a in opts.args || grunt.option(a)) {
          args.push('--' + a);
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
              for (var i = 0; i < val.length; i++) {
                args.push(prefix + "." + key, val[i]);
              }
            } else {
              // Dig deeper
              convert(prefix + "." + key, val, args);
            }
          } else if (type === "undefined" || type === "function") {
            // Skip these types
          } else if (type === "boolean") {
            // Add --params.key
            args.push(prefix + "." + key);
          } else {
            // Add --params.key value
            args.push(prefix + "." + key, val);
          }
        }
      })("--params", opts.args.params, args); // initial arguments

      console.log(args.join(" "));

      grunt.verbose.writeln("Spwan node with arguments: " + args.join(" "));

      // spawn grunt task 
      grunt.util.spawn({
          cmd: 'node',
          args: args,
          opts: {
            stdio: 'inherit'
          }
        },
        // callback on spawn task completion
        // accepts three params
        // @see http://gruntjs.com/api/grunt.util#grunt.util.spawn
        // @note we call `callback` instead of done because we 
        // want to trigger the next queued task. Calling done would 
        // complete our grunt task and prevent our other queued tasks
        // from running. 

        function(error, result, code) {

          if (error) {
            grunt.log.error(String(result));
            if (code === 1 && keepAlive) {
              // Test fails but do not want to stop the grunt process.
              grunt.log.oklns("Test failed but keep the grunt process alive.");
              //done();
              //done = null;
              callback();
            } else {
              // Test fails and want to stop the grunt process,
              // or protractor exited with other reason.
              grunt.fail.fatal('protractor exited with code: ' + code, 3);
            }
          } else {
            //done();
            //done = null;
            callback();
          }

        }
      );

    }, 1);

    // assign a callback when queue is drained
    // this will be called when each grunt task is complete
    // if a grunt task spawns many tests, this will be called when
    // all tests are complete.  
    q.drain = function() {
      grunt.log.oklns('All tests for this task have been processed');
      done();
    };

    // called when function is done being added to queue. 
    // @todo not really needed, delete this
    var doneProcessing = function(err) {
      grunt.log.oklns('Processed grunt task');
    };

    // mock many tests
    // @todo get from browser spec
    if (browserList) {
      //allTests.push(runOne);
      browserList.forEach(function(browser, key) {
        q.push({
          number: key,
          capability: browser
        }, doneProcessing);
      });
    } else {
      q.push({
        number: null
      }, doneProcessing);
    }

  });

};
