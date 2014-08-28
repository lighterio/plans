var plans = require('../plans');
var fs = require('fs');
var assert = require('assert');
var cwd = process.cwd();

function throwError(message) {
  throw new assert.AssertionError(message);
}

describe('plans.flow', function () {

  it('defaults to the base plan', function (done) {
    plans.setLogger({error: plans.ignore});
    plans.flow(-1, [Math.sqrt]);
    setImmediate(done);
  });

  it('reads and parses JSON', function (done) {
    var isOk = false;
    plans.flow(cwd + '/test/assets/ok.json', [fs.readFile, JSON.parse], {
      ok: function (data) {
        isOk = data.success;
      },
      error: function (e) {
        is.fail(e);
        done();
      },
      done: function () {
        is.true(isOk);
        done();
      }
    });
  });

  it('fails on invalid JSON', function (done) {
    plans.flow(cwd + '/test/assets/fail.json', [fs.readFile, JSON.parse], {
      ok: function (data) {
        is.fail();
        done();
      },
      error: function (e) {
        is.instanceOf(e, SyntaxError);
        done();
      }
    });
  });

  it('fails on non-existent files', function (done) {
    plans.flow(cwd + '/test/assets/incognito.json', [fs.readFile, JSON.parse], {
      ok: function (data) {
        is.fail();
        done();
      },
      error: function (e) {
        is(e.code, 'ENOENT');
        done();
      }
    });
  });

  it('supports errback fn lookalikes', function (done) {
    function lookalike(data, errback) {
      return data + '!';
    }
    plans.flow('hi', [lookalike], {
      ok: function (data) {
        is(data, 'hi!');
        done();
      },
      error: function (e) {
        is.fail(e);
        done();
      }
    });
  });

  it('supports functions with no arguments', function (done) {
    plans.flow(0, [Math.random, Math.random], {
      ok: function (data) {
        is.number(data);
        is.greaterOrEqual(data, 0);
        is.lessOrEqual(data, 1);
        done();
      }
    });
  });

  it('pushes errors', function (done) {
    plans.flow(0, [throwError, throwError], {
      error: function (error) {
        is.error(error);
      },
      errors: function (errors) {
        is.lengthOf(errors, 2);
        done();
      }
    });
  });

  it('finishes immediately if the array is empty', function (done) {
    plans.flow('a', [], {
      ok: function (data) {
        is(data, 'a');
        done();
      },
      error: function (err) {
        is.fail();
        done();
      }
    });
  });

});
