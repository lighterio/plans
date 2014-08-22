var plans = require('../plans');
var fs = require('fs');
var cwd = process.cwd();

function newError(message) {
  return new Error(message || 'Error was thrown on purpose.');
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

describe('plans.parallel', function () {

  plans.setLogger({
    error: function () {}
  });

  it('runs functions in parallel', function (done) {
    var message = '';

    var one = function (done) {
      setTimeout(function () {
        message += 1;
        done();
      }, 5);
    };

    var two = function (done) {
      setImmediate(function () {
        message += 2;
        done();
      });
    };

    var three = function (done) {
      setTimeout(function () {
        message += 3;
        done();
      }, 10);
    };

    var four = function (done) {
      message += 4;
      done();
    };

    plans.parallel([one, two, three, four], {
      ok: function () {
        is.tis(message, '4213');
        done();
      },
      error: function (e) {
        is.fail(e);
      }
    });
  });

  it('calls ok and done even if the array is empty', function (done) {
    var isOk = false;
    plans.parallel([], {
      ok: function () {
        isOk = true;
      },
      error: function (e) {
        is.fail(e);
      },
      done: function () {
        is.true(isOk);
        done();
      }
    });
  });

  it('handles errors', function (done) {
    plans.parallel([throwError], {
      ok: function () {
        is.fail();
      },
      error: function (e) {
        is.error(e);
        done();
      }
    });
  });

  it('calls done even when an error occurred', function (done) {
    plans.parallel([throwError], {
      done: function () {
        done();
      }
    });
  });

  it('calls done when there is no ok method', function (done) {
    plans.parallel([returner], {
      done: function () {
        done();
      }
    });
  });

  it('supports errbacks', function (done) {
    plans.parallel([callbacker], {
      ok: function (data) {
        done();
      }
    });
  });

  it('supports async errbacks', function (done) {
    plans.parallel([asyncCallbacker], {
      ok: function () {
        done();
      }
    });
  });

  it('handles errback errors', function (done) {
    plans.parallel([errbacker], {
      error: function (e) {
        is.error(e);
        done();
      }
    });
  });

  it('supports errback lookalikes', function (done) {
    plans.parallel([errbackLookalike], {
      ok: function (data) {
        done();
      }
    });
  });

  it('pushes an error', function (done) {
    plans.parallel([throwError], {
      errors: function (errors) {
        is.lengthOf(errors, 1);
        is.error(errors[0]);
        done();
      }
    });
  });

  it('throws an error if .error === true', function (done) {
    try {
      plans.parallel([throwError], {
        error: true
      });
    }
    catch (e) {
      done();
    }
  });

});
