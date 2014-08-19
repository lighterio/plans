var plans = require('../plans');

var throwError = function () {
  throw new Error('wtf ftw');
};

describe('plans.setBasePlan', function () {

  // Trigger an error so the base plan's will log.
  it('is called internally', function (done) {
    var errorCount = 0;
    plans.setLogger({
      error: function () {
        errorCount = 1;
      }
    });
    plans.flow(0, [throwError]);
    setImmediate(function () {
      is(errorCount, 1);
      done();
    });
  });

  it('works when the error has no stack', function (done) {
    function throwStackless() {
      var e = new Error('Stackless error');
      e.s = e.stack;
      e.stack = false;
      throw e;
    }
    plans.run(throwStackless, {
      done: done
    });
  });

  it('is a function', function () {
    is.function(plans.setBasePlan);
  });

  it('sets the base plan', function () {
    plans.setBasePlan({
      ok: function () {},
      error: function () {}
    });
  });

  it('can be null', function () {
    plans.setBasePlan(null);
    plans.flow(0, [throwError]);
  });

  it('accepts a logger', function (done) {
    var okCount = 0;
    plans.setBasePlan({
      info: function () {
        okCount++;
      }
    });
    plans.flow(0, [Math.round]);
    setImmediate(function () {
      is(okCount, 1);
      done();
    });
  });

  it('handles specific error classes', function (done) {
    plans.setBasePlan({
      syntaxError: function () {
        done();
      }
    });
    plans.flow('Not JSON', [JSON.parse]);
  });

});
