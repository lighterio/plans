var plans = require('../plans');
var fs = require('fs');
var assert = require('assert');
var cwd = process.cwd();

function throwError(message) {
  throw new assert.AssertionError(message);
}

describe('plans.flow', function () {

  it('reads and parses JSON', function (done) {
    var isOk = false;
    plans(cwd + '/test/assets/ok.json')
      .flow([fs.readFile, JSON.parse], {
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
    plans(cwd + '/test/assets/fail.json')
      .flow([fs.readFile, JSON.parse], {
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
    plans(cwd + '/test/assets/incognito.json')
      .flow([fs.readFile, JSON.parse], {
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
    plans('hi')
      .flow([lookalike], {
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
    plans(0)
      .flow([Math.random, Math.random], {
        ok: function (data) {
          is.number(data);
          is.greaterOrEqual(data, 0);
          is.lessOrEqual(data, 1);
          done();
        }
      });
  });

  it('pushes errors', function (done) {
    plans(0)
      .flow([throwError, throwError], {
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
    plans('a')
      .flow([], {
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
