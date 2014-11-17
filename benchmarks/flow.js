var Promise = require('bluebird');
var plans = require('../plans');
var fs = require('fs');
var cwd = process.cwd();
var is = require('exam/lib/is');

var path = 'assets/ok.json';
var finish;

module.exports = function (finish) {

  var runCount = 5e4;
  console.log('\n' + 'plans.flow vs bluebird fs.readFileAsync().then(JSON.parse)');
  console.log('* 50K runs...');

  var tests = {
    'plans.flow': function (done) {
      plans.flow(path, [fs.readFile, JSON.parse], {
        ok: function (data) {
          is.true(data.success);
          setImmediate(done);
        },
        error: function (e) {
          console.error(e);
        },
        catchSyntaxError: function (e) {
          console.error(e);
        }
      });
    },
    bluebird: function (done) {
      fs.readFileAsync(path).then(JSON.parse).then(function (data) {
        is.true(data.success);
        setImmediate(done);
      })
      .catch(function (e) {
        console.error(e);
      })
      .catch(SyntaxError, function (e) {
        console.error(e);
      });
    },
  };

  var names = [];
  for (var name in tests) {
    names.push(name);
  }

  var testIndex = 0;

  function test() {
    var name = names[testIndex];
    if (name == 'bluebird') {
      fs = Promise.promisifyAll(fs);
    }
    var fn = tests[name];
    var remaining = runCount;
    var start = new Date();
    function next() {
      if (remaining) {
        --remaining;
        fn(next);
      }
      else {
        done();
      }
    }
    function done() {
      var elapsed = new Date() - start;
      console.log('* ' + name + ' - ' + elapsed + 'ms elapsed');
      if (++testIndex < names.length) {
        test();
      }
      else {
        setImmediate(finish);
      }
    }
    next();
  }
  test();

};
