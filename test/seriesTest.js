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

function asyncCallbacker(errback) {
  setImmediate(function () {
    errback(3);
  });
}

function errbackLookalike(errback) {
  return 3;
}

function errbacker(errback) {
  errback(newError(), null);
}

describe('plans.series', function () {

  it('defaults to the base plan', function (done) {
    plans.setLogger({error: plans.ignore});
    plans.series([throwError]);
    setImmediate(done);
  });

  it('runs functions in a series', function (done) {
    var n = 0;
    var message = '';

    function appender(done) {
      return message += ++n;
    }

    plans.series([appender, appender, appender], {
      ok: function () {
        is.tis(message, '123');
        done();
      },
      error: function (e) {
        is.fail(e);
        done();
      }
    });
  });

  it('calls ok and done even if the series is empty', function (done) {
    var isOk = false;
    plans.series([], {
      ok: function () {
        isOk = true;
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

  it('handles errors', function (done) {
    plans.series([throwError], {
      ok: function () {
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
    plans.series([throwError], {
      done: function () {
        done();
      }
    });
  });

  it('calls done when there is no ok method', function (done) {
    plans.series([returner], {
      done: function () {
        done();
      }
    });
  });

  it('supports errbacks', function (done) {
    plans.series([callbacker], {
      ok: function () {
        done();
      }
    });
  });

  it('supports async errbacks', function (done) {
    plans.series([asyncCallbacker], {
      ok: function () {
        done();
      }
    });
  });

  it('handles errback errors', function (done) {
    plans.series([errbacker], {
      error: function (e) {
        is.error(e);
        done();
      }
    });
  });

  it('supports errback lookalikes', function (done) {
    plans.series([errbackLookalike], {
      ok: function (data) {
        done();
      }
    });
  });

  it('pushes an error', function (done) {
    plans.series([throwError], {
      errors: function (errors) {
        is.lengthOf(errors, 1);
        is.error(errors[0]);
        done();
      }
    });
  });

  it('throws an error if .error === true', function (done) {
    try {
      plans.series([throwError], {
        error: true
      });
    }
    catch (e) {
      done();
    }
  });

});
