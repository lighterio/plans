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

describe('plans.each', function () {

  before(function () {
    mock(plans.base, {
      fail: mock.concat()
    });
  });

  after(function () {
    unmock();
  });

  it('runs functions in series', function (done) {
    var n = 0;
    var message = '';

    function appender(done) {
      return message += ++n;
    }

    plans.each([appender, appender, appender], {
      ok: function () {
        is(message, '123');
        done();
      },
      fail: function (e) {
        is.fail(e);
        done();
      }
    });
  });

  it('calls ok and done even if the each is empty', function (done) {
    var isOk = false;
    plans.each([], {
      ok: function () {
        isOk = true;
      },
      fail: function (e) {
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
    plans.each([throwError], {
      ok: function () {
        is.fail();
        done();
      },
      fail: function (e) {
        is.error(e);
        done();
      }
    });
  });

  it('calls done even when an error occurred', function (done) {
    plans.each([throwError], {
      done: function () {
        done();
      }
    });
  });

  it('calls done when there is no ok method', function (done) {
    plans.each([returner], {
      done: function () {
        done();
      }
    });
  });

  it('supports errbacks', function (done) {
    plans.each([callbacker], {
      ok: function () {
        done();
      }
    });
  });

  it('supports async errbacks', function (done) {
    plans.each([asyncCallbacker], {
      ok: function () {
        done();
      }
    });
  });

  it('handles errback errors', function (done) {
    plans.each([errbacker], {
      fail: function (e) {
        is.error(e);
        done();
      }
    });
  });

  it('supports errback lookalikes', function (done) {
    plans.each([errbackLookalike], {
      ok: function (data) {
        done();
      }
    });
  });

  it('pushes an error', function (done) {
    plans.each([throwError], {
      fails: function (errors) {
        is.lengthOf(errors, 1);
        is.error(errors[0]);
        done();
      }
    });
  });

  it('throws an error if .error === true', function (done) {
    try {
      plans.each([throwError], {
        fail: true
      });
    }
    catch (e) {
      done();
    }
  });

});
