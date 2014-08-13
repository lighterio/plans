var Promise = require('bluebird');
var plans = require('../plans');
var fs = require('fs');
var cwd = process.cwd();

var path = 'assets/ok.json';

var tests = {
  plans: function (done) {
    plans.flow(path, [fs.readFile, JSON.parse], {
      ok: function (data) {
        is.true(data.success);
        setImmediate(done);
      },
      error: function (err) {
        console.error('fail:' + err.stack);
      },
      syntaxError: function (err) {
        console.error('SyntaxError: ' + err);
      }
    });
  },
  bluebird: function (done) {
    fs.readFileAsync(path).then(JSON.parse).then(function (data) {
      is.true(data.success);
      setImmediate(done);
    })
    .catch(SyntaxError, function (err) {
      console.error(err);
    })
    .catch(function (err) {
      console.error(err);
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
  var remaining = 1e5;
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
    console.log(name + ': ' + elapsed);
    if (++testIndex < names.length) {
      test();
    }
  }
  next();
}
test();
