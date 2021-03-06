'use strict';

var expect = require('chai').expect;
var plugin = require('..');
var sinon = require('sinon');
var child = require('child_process');

describe('plugin', function() {

  var getLTSVersion = 'source $NVM_DIR/nvm.sh; nvm version "lts/boron"';
  var getSystemLikeAlias = 'source $NVM_DIR/nvm.sh; nvm version "system-alias"';
  var getSystemVersion = 'source $NVM_DIR/nvm.sh; nvm run --silent system --version;';
  var listNvmVersions = 'source $NVM_DIR/nvm.sh; nvm list';

  beforeEach(function() {
    var spawn = child.spawn;

    sinon.stub(child, 'spawn', function(cmd, args) {
      var versionMatch = args[1].match(/source \$NVM_DIR\/nvm\.sh; nvm version "(v*\d+[\.\d]*)"/);

      if (args[1] === getLTSVersion) {
        // Mock return for an aliased version
        return spawn('echo', ['v6.12.0']);
      } else if (args[1] === getSystemLikeAlias) {
        return spawn('echo', ['v6.9.5']);
      } else if (args[1] === getSystemVersion) {
        return spawn('echo', ['v0.12.7']);
      } else if (versionMatch) {
        // Mock return for a normal version numver
        var version = versionMatch[1];
        version = 'v' + version.replace('v', '');
        return spawn('echo', [version]);
      } else if (args[1] === listNvmVersions) {
        // Mock the version list command
        return spawn('echo', ['v0.7.12\n0.10.26\nv0.10.28\nv0.10.29\nv0.10.101\nv0.11.13\nv6.9.5\nv6.12.0']);
      } else {
        // Assume all other commands are nvm version "<uninstalled_version>"
        return spawn('echo', ['N/A']);
      }

    });
  });
  afterEach(function() { child.spawn.restore(); });

  it('matches exact version', function(done) {
    plugin.match('0.11.13').then(function(result) {
      expect(result).to.eql({
        version: 'v0.11.13',
        command: 'nvm use v0.11.13 > /dev/null;'
      });
    })
    .done(done);
  });

  it('matches with semver syntax', function(done) {
    plugin.match('>=0.10 < 0.10.29').then(function(result) {
      expect(result).to.eql({
        version: 'v0.10.28',
        command: 'nvm use v0.10.28 > /dev/null;'
      });
    })
    .done(done);
  });

  it('chooses greatest match', function(done) {
    plugin.match('0.10').then(function(result) {
      expect(result).to.eql({
        version: 'v0.10.101',
        command: 'nvm use v0.10.101 > /dev/null;'
      });
    })
    .done(done);
  });

  it('rejects versions not installed', function(done) {
    plugin.match('0.9').then(
      function() { throw new Error('Plugin should have rejected invalid version.'); },
      function(e) { expect(e).to.match(/no version matching 0\.9/); })
    .done(done);
  });

  it('rejects when command fails', function(done) {
    child.spawn.restore();
    var spawn = child.spawn;
    sinon.stub(child, 'spawn', function(/*cmd, args*/) {
      return spawn('ls', ['/nowhere']); // intentional command failure
    });

    plugin.match('0.9').then(
      function() { throw new Error('Plugin should have rejected bad command.'); },
      function(e) { expect(e).to.match(/nvm exited with status: \d+/); })
    .done(done);
  });

  it('parses nvm@dc53a37 output', function() {
    var output = {
      stdout: new Buffer('   v0.7.12\n   v0.8.26\n   v0.9.12\n  v0.10.26\n  v0.10.28\n  v0.11.11\n  v0.11.12\n  v0.11.13\ncurrent: \tv0.10.26\n0.10 -> 0.10.26 (-> v0.10.26)\ndefault -> 0.10 (-> v0.10.26)\n')
    };
    expect(plugin._parseVersions(output)).to.eql([
      'v0.7.12',
      'v0.8.26',
      'v0.9.12',
      'v0.10.26',
      'v0.10.28',
      'v0.11.11',
      'v0.11.12',
      'v0.11.13'
    ]);
  });

  it('parses nvm@1ee708b output', function() {
    var output = {
      stdout: new Buffer('     v0.7.12\n     v0.8.26\n     v0.9.12\n->  v0.10.26\n    v0.10.28\n    v0.11.11\n    v0.11.12\n    v0.11.13\n      system\nstable -> 0.10 (-> v0.10.26) (default)\nunstable -> 0.11 (-> v0.11.13) (default)\n')
    };
    expect(plugin._parseVersions(output)).to.eql([
      'v0.7.12',
      'v0.8.26',
      'v0.9.12',
      'v0.10.26',
      'v0.10.28',
      'v0.11.11',
      'v0.11.12',
      'v0.11.13'
    ]);
  });

  it('parses output that includes iojs', function() {
    var output = {
      stdout: new Buffer('    iojs-v1.1.0\n->     v0.10.36\n        v0.12.0\n')
    };
    expect(plugin._parseVersions(output)).to.eql([
      'iojs-v1.1.0',
      'v0.10.36',
      'v0.12.0',
    ]);
  });

  it('finds versions when iojs is installed', function() {
    expect(plugin._findVersion(['iojs-v1.1.0', 'v0.12.0'], 'v0.12'))
      .to.eql('v0.12.0');
  });

  it('finds iojs versions', function() {
    expect(plugin._findVersion(['iojs-v1.1.0', 'v0.12.0'], 'iojs-v1.1'))
      .to.eql('iojs-v1.1.0');
  });

  it('finds aliased versions', function(done) {
    plugin.match('lts/boron').then(function(result) {
      expect(result).to.eql({
        version: 'v6.12.0',
        command: 'nvm use v6.12.0 > /dev/null;'
      });
    }).done(done);
  });

  it('finds system version', function(done) {
    plugin.match('system').then(function(result) {
      expect(result).to.eql({
        version: 'system: v0.12.7',
        command: 'nvm use system > /dev/null;'
      });
    }).done(done);
  });

  it('differentiates between aliases containing "system" and the system node', function (done) {
    plugin.match('system-alias').then(function(result) {
      expect(result).to.eql({
        version: 'v6.9.5',
        command: 'nvm use v6.9.5 > /dev/null;'
      });
    }).done(done);
  });

  it('returns rejected promise if system node is not present', function(done) {
    child.spawn.restore();

    var spawn = child.spawn;

    sinon.stub(child, 'spawn', function(cmd, args) {
      var versionMatch = args[1].match(/source \$NVM_DIR\/nvm\.sh; nvm version "(v*\d+[\.\d]*)"/);

      if (args[1] === getLTSVersion) {
        // Mock return for an aliased version
        return spawn('echo', ['v6.12.0']);
      } else if (args[1] === getSystemVersion) {
        return spawn(process.env.SHELL, ['1>&2', 'echo', '/Users/my_user/.nvm/nvm-exec: line 15: exec: system: not found']);
      } else if (versionMatch) {
        // Mock return for a normal version numver
        var version = versionMatch[1];
        version = 'v' + version.replace('v', '');
        return spawn('echo', [version]);
      } else if (args[1] === listNvmVersions) {
        // Mock the version list command
        return spawn('echo', ['v0.7.12\n0.10.26\nv0.10.28\nv0.10.29\nv0.10.101\nv0.11.13\nv6.12.0']);
      } else {
        // Assume all other commands are nvm version "<uninstalled_version>"
        return spawn('echo', ['N/A']);
      }
    });
    plugin.match('system').then(
      function() {
        throw new Error('Plugin should have rejected bad command.');
      },
      function(e) {expect(e).to.match(/.*Error: Could not find system version of node.*/);}
    ).done(done);
  });
});
