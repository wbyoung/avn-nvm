'use strict';

var util = require('util');
var semver = require('semver');
var child = require('child_process');
var concat = require('concat-stream');
var Promise = require('bluebird');
var name = require('./package.json').name;

var VERSION_REGEX = /(\w+)-(.+)/;

/**
 * Run an nvm command.
 *
 * @private
 * @function
 * @param {String} command
 * @return {Promise}
 */
var nvmCommand = function(command) {
  return new Promise(function(resolve, reject) {
    var stdout, stderr;
    var cmd = child.spawn(process.env.SHELL,
      ['-c', 'source $NVM_DIR/nvm.sh; nvm ' + command]);

    cmd.stdout.pipe(concat(function(data) {
      stdout = data;
    }));

    cmd.stderr.pipe(concat(function(data) {
      stderr = data;
    }));

    cmd.on('close', function(code) {
      if (code === 0) { resolve({ stdout: stdout, stderr: stderr }); }
      else {
        reject(new Error(util.format('nvm exited with status: %d\n%s',
          code, stdout.toString().trim() + stderr.toString().trim())));
      }
    });
  });
};

/**
 * Prase versions
 *
 * @private
 * @function
 * @param {String} output
 * @return {Array.<String>}
 */
var parseVersions = function(output) {
  var string = output.stdout.toString()
    .replace(/\x1b[^m]*m/g, '')
    .replace(/^->/gm, '');
  return string.split('\n')
  .map(function(line) { return line.trim(); })
  .filter(function(line) { return line && !line.match(/current|system|->/); });
};

/**
 * List versions.
 *
 * @private
 * @function
 * @return {Promise}
 */
var listVersions = function() {
  // find all of the versions of node installed by nvm.
  return Promise.resolve()
  .then(function() { return nvmCommand('list'); })
  .then(parseVersions);
};

/**
 * Extract a name from a version (to support iojs)
 *
 * @private
 * @function
 * @return {Promise}
 */
var versionName = function(version) {
  var match = version.match(VERSION_REGEX);
  return match ? match[1] : null;
};

/**
 * Extract just the version number from a version.
 *
 * @private
 * @function
 * @param {String} version
 * @return {String}
 */
var versionNumber = function(version) {
  var match = version.match(VERSION_REGEX);
  return match ? match[2] : version;
};

/**
 * Find a version.
 *
 * @param {Array.<String>} versions
 * @param {String} matching
 * @return {String}
 */
var findVersion = function(versions, matching) {
  var highestMatch = null;

  var mName = versionName(matching);
  var mNumber = versionNumber(matching);

  versions.forEach(function(v) {
    var vName = versionName(v);
    var vNumber = versionNumber(v);

    if (vName === mName && semver.satisfies(vNumber, mNumber)) {
      if (!highestMatch) { highestMatch = v; }
      else if (semver.gt(vNumber, versionNumber(highestMatch))) {
        highestMatch = v;
      }
    }
  });
  return highestMatch;
};

/**
 * Get installed version matching a given version.
 *
 * @param {String} matching
 * @return {Promise}
 */
var installedVersion = function(matching) {
  return Promise.resolve()
  .then(function() { return listVersions(); })
  .then(function(versions) {
    return findVersion(versions, matching);
  });
};

/**
 * Match a specific version.
 *
 * @param {String} version
 * @return {Promise}
 */
var match = function(version) {
  return Promise.resolve()
  .then(function() { return installedVersion(version); })
  .then(function(use) {
    var command = util.format('nvm use %s > /dev/null;', use);
    var result = { version: use, command: command };
    return use ? result :
      Promise.reject(new Error('no version matching ' + version));
  });
};

module.exports = {
  name: name,
  match: match,
  _parseVersions: parseVersions,
  _findVersion: findVersion,
};
