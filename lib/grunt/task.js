/*
 * Copyright 2015 The Closure Compiler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Grunt task definition for closure-compiler
 *
 * @author Chad Killingsworth (chadkillingsworth@gmail.com)
 */

'use strict';

module.exports = function(grunt) {
  var chalk = require('gulp-util').colors;
  var vinylfs = require('vinyl-fs');
  var fs = require('fs');
  var path = require('path');
  var gulpCompiler = require('../gulp')();
  var through = require('through2');
  var gulpCompilerOptions = {
    streamMode: 'IN',
    logger: grunt.log,
    pluginName: 'grunt-google-closure-compiler'
  };

  /**
   * @param {Array<string>}|null} files
   * @param {Object<string,string|boolean|Array<string>>|Array<string>} options
   * @return {Promise}
   */
  function compilationPromise(files, options) {
    var hadError = false;
    function logFile(cb) {
      if (!hadError) {
        if (options.js_output_file) {
          grunt.log.ok(chalk.cyan(options.js_output_file) + ' created');
        } else {
          grunt.log.ok('Compilation succeeded');
        }
      }
      cb();
    }

    var loggingStream = through.obj(function() {}, logFile);

    return new Promise(function(resolve, reject) {
      var stream;
      if (files) {
        stream = vinylfs.src(files, {base: process.cwd()})
            .pipe(gulpCompiler(options, gulpCompilerOptions))
      } else {
        stream = gulpCompiler(options, gulpCompilerOptions);
        stream.end();
      }

      stream.on('error', function(err) {
        hadError = true;
        reject(err);
      });
      stream.on('end', function(err) {
        resolve();
      });

      stream.pipe(loggingStream);
      stream.resume(); //logging stream doesn't output files, so we have to manually resume;
    });
  }

  function closureCompilerGruntTask() {
    var taskObject = this;
    var asyncDone = this.async();
    var compileTasks = [];

    function getCompilerOptions() {
      var opts = taskObject.options({
        args: undefined
      });

      var args = opts.args;

      delete opts.args;

      return {
        args: args,
        compilerOpts: opts
      }
    }

    taskObject.files.forEach(function (f) {
      var options = getCompilerOptions();

      var src = f.src.filter(function (filepath) {
        if (!grunt.file.exists(filepath)) {
          grunt.log.warn('Source file ' + chalk.cyan(filepath) + ' not found');
          return false;
        }
        return true;
      });

      // Require source files
      if (src.length === 0) {
        grunt.log.warn('Destination ' + chalk.cyan(f.dest) +
            ' not written because src files were empty');
        return;
      } else {
        options.compilerOpts.js_output_file = f.dest;
      }

      compileTasks.push(compilationPromise(src, options.args || options.compilerOpts)
          .then(function () {}, function(err) {
            throw err;
          }));
    });

    // If the task was invoked without any files provided by grunt, assume that
    // --js flags are present and we want to run the compiler anyway.
    if (taskObject.files.length === 0) {
      var options = getCompilerOptions();
      compileTasks.push(compilationPromise(null, options.args || options.compilerOpts));
    }

    Promise.all(compileTasks).then(function () {
      asyncDone();
    }, function (err) {
      grunt.fail.warn('Compilation error');
      asyncDone();
    });
  }

  return closureCompilerGruntTask;
};