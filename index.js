'use strict';

var util = require('util');
var semver = require('semver');
var child = require('child_process');
var concat = require('concat-stream');
var Promise = require('bluebird');
var name = require('./package.json').name;

var VERSION_REGEX = /(\w+)-(.+)/;

/**
* Get the system version of Node, if present.
* Otherwise, return a rejected Promise.
*/
var getSystemNode = function() {
  return new Promise(function(resolve, reject) {
    var stdout, stderr;
    var cmd = child.spawn(process.env.SHELL,
      ['-c', 'source $NVM_DIR/nvm.sh; nvm run --silent system --version;']);

    cmd.stdout.pipe(concat(function(data) {
      stdout = data;
    }));

    cmd.stderr.pipe(concat(function(data) {
      stderr = data;
    }));

    cmd.on('close', function(code) {
      if (code === 0) { resolve({ stdout: stdout, stderr: stderr }); }
      else {
        reject(new Error('Could not find system version of node.'));
      }
    });
  });
};

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
          code, String(stdout).trim() + String(stderr).trim())));
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
  var string = String(output.stdout)
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
  if (matching === 'system') {
    return matching;
  }

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
* Parse the results of the nvm version call.
*
* @param {Promise} matching
*/
var parseMatching = function(matching) {
  return String(matching.stdout).trim();
};
/**
* Use nvm to resolve a version string (which could be a version number or an
alias) to an installed version number (or N/A).
*
* @param {String} matching
*/
var resolveVersion = function(matching) {
  return Promise.resolve()
    .then(function() { return nvmCommand('version "' + matching + '"'); })
    .then(parseMatching);
};

/**
 * Get installed version matching a given version.
 *
 * @param {String} matching
 * @return {Promise}
 */
var installedVersion = function(matching) {
  return Promise.resolve()
  .then(function() {
    return Promise.all([
      resolveVersion(matching),
      listVersions(),
    ]);
  })
  .spread(function(parsedVersion, versions) {
    var parsedMatching = parsedVersion !== 'N/A' ? parsedVersion : matching;
    return findVersion(versions, parsedMatching);
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
  .then(function(useVersion) {
    return useVersion === 'system' ?
      getSystemNode()
        .then(parseMatching)
        .then(function(use) {
          return 'system: ' + use;
        }) :
      useVersion;
  })
  .then(function(useVersion) {
    var use = (useVersion && useVersion.indexOf('system') === 0) ?
      'system' : useVersion;
    var command = util.format('nvm use %s > /dev/null;', use);
    var result = { version: useVersion, command: command };
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
