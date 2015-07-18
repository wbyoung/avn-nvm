'use strict';

var expect = require('chai').expect;
var plugin = require('..');
var sinon = require('sinon');
var child = require('child_process');

describe('plugin', function() {

  beforeEach(function() {
    var spawn = child.spawn;
    sinon.stub(child, 'spawn', function(/*cmd, args*/) {
      return spawn('echo', ['v0.7.12\n0.10.26\nv0.10.28\nv0.10.29\nv0.10.101\nv0.11.13']);
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
});
