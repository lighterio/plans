var plans = require('../plans');
var mock = require('exam/lib/mock');
var fs = require('fs');
var http = require('http');
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
      done: function (e, data) {
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

  it('supports tries with retryDelay', function (done) {
    var count = 0;
    var delayed = false;
    function tryIt() {
      if (++count < 2) {
        throwError();
      }
    }
    setTimeout(function () {
      delayed = true;
    }, 5);
    plans.run(tryIt, {
      tries: 2,
      retryDelay: 10,
      ok: function () {
        is(count, 2);
        is.true(delayed);
        done();
      },
      error: function (e) {
        is.fail();
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

  it('catches specific errors by name', function (done) {
    plans.run(throwError, {
      ok: function (data) {
        is.fail();
        done();
      },
      error: function (e) {
        done(e);
      },
      catchAssertionError: function (e) {
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
      done: function (e, data) {
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

  it('handles nameless and stackless errors', function (done) {
    plans.run(
      function (fn) {
        var e = new Error();
        e.name = null;
        e.stack = null;
        fn(e);
      },
      {
        error: function (e) {
          is.error(e);
          done();
        }
      }
    );
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

  it('supports timeouts with no side effects', function (done) {
    var plan = {
      timeout: 10,
      ok: function (ok) {
        is(ok, 'ok');
        done();
      }
    };
    plans.run(function () {
      return 'ok';
    }, plan);
  });

  it('fails if the timeout is exceeded', function (done) {
    var plan = {
      timeout: 10,
      ok: function () {
        is.fail('Should have timed out!');
      },
      error: function (e) {
        is.error(e);
        done();
      }
    };
    plans.run(function (ok) {
      setTimeout(function () {
        ok('ok');
      }, 20);
    }, plan);
  });

  it('supports http responses', function (done) {
    var response = new http.ServerResponse('GET');
    mock(response, {
      writeHead: mock.concat(),
      end: mock.concat()
    });
    var mockLog = {
      error: mock.concat()
    };
    plans.setLogger(mockLog);
    var die = function () {
      throw new Error('oops');
    };
    plans.run(die, {
      error: response,
      done: function () {
        is(response.writeHead.value, '500');
        is(response.end.value, '<h1>Internal Server Error</h1>');
        is.in(mockLog.error.value, 'oops');
        done();
      }
    });
  });

  it('supports http responses with error messages', function (done) {
    var response = new http.ServerResponse('GET');
    mock(response, {
      writeHead: mock.concat(),
      end: mock.concat()
    });
    var mockLog = {
      error: mock.concat()
    };
    plans.setLogger(mockLog);
    var die = function (errback) {
      errback(new Error('uh oh'));
    };
    plans.run(die, {
      error: response,
      done: function () {
        is(response.writeHead.value, '500');
        is(response.end.value, '<h1>Internal Server Error</h1>');
        is.in(mockLog.error.value, 'uh oh');
        done();
      }
    });
  });

  it('supports http responses with stackless error messages', function (done) {
    var response = new http.ServerResponse('GET');
    mock(response, {
      writeHead: mock.concat(),
      end: mock.concat()
    });
    var mockLog = {
      error: mock.concat()
    };
    plans.setLogger(mockLog);
    var die = function (errback) {
      var e = new Error('stackless');
      e.stack = null;
      errback(e);
    };
    plans.run(die, {
      error: response,
      done: function () {
        is(response.writeHead.value, '500');
        is(response.end.value, '<h1>Internal Server Error</h1>');
        is.in(mockLog.error.value, 'stackless');
        done();
      }
    });
  });

});
