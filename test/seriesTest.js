var plans = require('../plans');
var fs = require('fs');
var cwd = process.cwd();

function newError(message) {
  return new Error(message || 'Error was thrown on purpose.');
}

function throwError(message) {
  throw newError(message);
}

function return1() {
  return 1;
}

function call2(errback) {
  errback(null, 2);
}

function lookalike3(errback) {
  return 3;
}

function callError(errback) {
  errback(newError(), null);
}

describe('plans.run', function () {

  plans.setLogger({
    error: function () {}
  });

  it('runs a function', function (done) {
    var isOk = false;
    plans.run(return1, {
      ok: function (data) {
        is.tis(data, 1);
      },
      error: function (e) {
        is.fail(e);
      },
      done: function (data) {
        is.tis(data, 1);
        done();
      }
    });
    // Un-define arg count so we'll hit that code path later.
    return1._PLANS_ARG_COUNT = return1.undefined;
  });

  it('handles errors', function (done) {
    plans.run(throwError, {
      ok: function (data) {
        is.fail();
      },
      error: function (e) {
        is.error(e);
        done();
      }
    });
  });

  it('calls done even when an error occurred', function (done) {
    plans.run(throwError, {
      done: function () {
        done();
      }
    });
  });

  it('calls done when there is no ok method', function (done) {
    plans.run(return1, {
      done: function (data) {
        is.tis(data, 1);
        done();
      }
    });
  });

  it('supports errbacks', function (done) {
    plans.run(call2, {
      ok: function (data) {
        is.tis(data, 2);
        done();
      }
    });
  });

  it('supports errback lookalikes', function (done) {
    plans.run(lookalike3, {
      ok: function (data) {
        is.tis(data, 3);
        done();
      }
    });
  });

  it('pushes an error', function (done) {
    plans.run(throwError, {
      errors: function (errors) {
        is.lengthOf(errors, 1);
        is.error(errors[0]);
        done();
      }
    });
  });

  it('throws an error if .error === true', function (done) {
    try {
      plans.run(throwError, {
        error: true
      });
    }
    catch (e) {
      done();
    }
  });

});
