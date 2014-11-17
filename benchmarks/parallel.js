var async = require('async');
var plans = require('../plans');

var finish;

module.exports = function (finish) {

  var runCount = 1e5;
  console.log('\n' + 'plans.parallel vs async.parallel');
  console.log('* 100K runs...');

  function f(done) {
    done();
  }
  var set = [f, f, f];

  var tests = {
    'plans.all': function (done) {
      plans.all(set, {
        ok: function () {
          setImmediate(done);
        }
      });
    },
    async: function (done) {
      async.parallel(set, function () {
        setImmediate(done);
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
