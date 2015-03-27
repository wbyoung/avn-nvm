var fs = require('fs');
var path = require('path');
var util = require('util');
var semver = require('semver');
var child_process = require('child_process');
var concat = require('concat-stream');
var BPromise = require('bluebird');

var name = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8')).name;

var VERSION_REGEX = /(\w+)-(.+)/;

var nvmCommand = function(command) {
  var resolve, reject, promise = new BPromise(function() {
    resolve = arguments[0];
    reject = arguments[1];
  });

  var stdout, stderr;
  var cmd = child_process.spawn('bash',
    ['-c', 'source $NVM_DIR/nvm.sh; nvm ' + command]);

  cmd.stdout.pipe(concat(function(data) {
    stdout = data;
  }));

  cmd.stderr.pipe(concat(function(data) {
    stderr = data;
  }));

  cmd.on('close', function(code) {
    if (code === 0) { resolve({ stdout: stdout, stderr: stderr }); }
    else { reject('nvm exited with status: ' + code); }
  });

  return promise;
};

var parseVersions = function(output) {
  var string = output.stdout.toString()
    .replace(/\x1b[^m]*m/g, '')
    .replace(/^->/gm, '');
  return string.split('\n')
  .map(function(line) { return line.trim(); })
  .filter(function(line) { return line && !line.match(/current|system|->/); });
};

var listVersions = function() {
  // find all of the versions of node installed by nvm.
  return BPromise.resolve()
  .then(function() { return nvmCommand('list'); })
  .then(parseVersions);
};

// extract a name from a version (to support iojs)
var versionName = function(version) {
  var match = version.match(VERSION_REGEX);
  return match ? match[1] : null;
};

// extract just the version number from a version
var versionNumber = function(version) {
  var match = version.match(VERSION_REGEX);
  return match ? match[2] : version;
};

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

var installedVersion = function(matching) {
  return BPromise.resolve()
  .then(function() { return listVersions(); })
  .then(function(versions) {
    return findVersion(versions, matching);
  });
};

var match = function(version) {
  return BPromise.resolve()
  .then(function() { return installedVersion(version); })
  .then(function(use) {
    var command = util.format('nvm use %s > /dev/null;', use);
    var result = { version: use, command: command };
    return use ? result : BPromise.reject('no version matching ' + version);
  });
};

module.exports = {
  name: name,
  match: match,
  _parseVersions: parseVersions,
  _findVersion: findVersion
};
