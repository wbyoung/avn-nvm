var q = require('q');
var fs = require('fs');
var path = require('path');
var util = require('util');
var semver = require('semver');
var child_process = require('child_process');
var concat = require('concat-stream');

exports.name = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8')).name;

var nvmCommand = function(command) {
  var deferred = q.defer();
  var stdout, stderr;
  var cmd = child_process.spawn('bash',
    ['-c', 'source ~/.nvm/nvm.sh; nvm ' + command]);

  cmd.stdout.pipe(concat(function(data) {
    stdout = data;
  }));

  cmd.stderr.pipe(concat(function(data) {
    stderr = data;
  }));

  cmd.on('close', function(code) {
    if (code === 0) { deferred.resolve({ stdout: stdout, stderr: stderr }); }
    else { deferred.reject('nvm exited with status: ' + code); }
  });

  return deferred.promise;
};

var listVersions = function() {
  // find all of the versions of node installed by nvm.
  return q()
  .then(function() { return nvmCommand('list'); })
  .then(function(result) {
    var str = result.stdout.toString().replace(/\x1b[^m]*m/g, '');
    return str.split('\n')
    .map(function(line) { return line.trim(); })
    .filter(function(line) { return line && !line.match(/current|->/); });
  });
};

var installedVersion = function(matching) {
  return q()
  .then(function() { return listVersions(); })
  .then(function(versions) {
    var version = null;
    versions.forEach(function(v) {
      if (semver.satisfies(v, matching)) {
        if (!version || semver.gt(version, v)) {
          version = v;
        }
      }
    });
    return version;
  });
};

exports.match = function(version) {
  return q()
  .then(function() { return installedVersion(version); })
  .then(function(use) {
    var command = util.format('nvm use %s > /dev/null;', use);
    var result = { version: use, command: command };
    return use ? result : q.reject('no version matching ' + version);
  });
};
