var plans = require('../plans');
var fs = require('fs');
var assert = require('assert');
var cwd = process.cwd();

function newError(message) {
  return new assert.AssertionError(message || 'Error was thrown on purpose.');
}

function throwError(message) {
  throw newError(message);
}

function returner() {
  return 1;
}

function callbacker(errback) {
  errback(null, 2);
}

function errbackLookalike(errback) {
  return 3;
}

function errbacker(errback) {
  errback(newError(), null);
}

describe('plans.run', function () {

  it('defaults to the base plan', function (done) {
    plans.setLogger({error: plans.ignore});
    plans.run(throwError);
    setImmediate(done);
  });

  it('runs a function', function (done) {
    var isOk = false;
    plans.run(returner, {
      ok: function (data) {
        is(data, 1);
      },
      error: function (e) {
        is.fail(e);
        done();
      },
      done: function (data) {
        is(data, 1);
        done();
      }
    });
    // Un-define arg count so we'll hit that code path later.
    returner._PLANS_ARG_COUNT = returner.undefined;
  });

  it('supports tries', function (done) {
    var count = 0;
    function tryIt() {
      if (++count < 3) {
        throwError();
      }
    }
    plans.run(tryIt, {
      tries: 5,
      ok: function () {
        is(count, 3);
        done();
      },
      error: function (e) {
        is.fail();
        done();
      }
    });
  });

  it('fails if tries are exhausted', function (done) {
    plans.run(throwError, {
      tries: 2,
      error: function (e) {
        done();
      }
    });
  });

  it('ignores extra arguments when tries is set', function (done) {
    plans.run(throwError, {
      tries: 2,
      error: function (e) {
        done();
      }
    }, true);
  });

  it('supports errbacks as plans', function (done) {
    plans.run(returner, function (e, result) {
      is(result, 1);
      done();
    });
  });

  it('supports errbacks that throw errors as plans', function (done) {
    plans.run(throwError, function (e, result) {
      is.error(e);
      done();
    });
  });

  it('handles errors', function (done) {
    plans.run(throwError, {
      ok: function (data) {
        is.fail();
        done();
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
    plans.run(returner, {
      done: function (data) {
        is(data, 1);
        done();
      }
    });
  });

  it('supports errbacks', function (done) {
    plans.run(callbacker, {
      ok: function (data) {
        is(data, 2);
        done();
      }
    });
  });

  it('handles errback errors', function (done) {
    plans.run(errbacker, {
      error: function (e) {
        is.error(e);
        done();
      }
    });
  });

  it('supports errback lookalikes', function (done) {
    plans.run(errbackLookalike, {
      ok: function (data) {
        is(data, 3);
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
