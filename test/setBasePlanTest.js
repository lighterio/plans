var plans = require('../plans');

var throwError = function () {
  throw new Error('wtf ftw');
};

describe('plans.setBasePlan', function () {

  // Trigger an error so the base plan will log.
  it('is called internally', function (done) {
    var errorCount = 0;
    plans.setLogger({
      error: function () {
        errorCount = 1;
      }
    });
    plans.run(throwError);
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
      done: function (e) {
        is.error(e);
        done();
      }
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

  it('must receive an object', function (done) {
    try {
      plans.setBasePlan();
    }
    catch (e1) {
      try {
        plans.setBasePlan(null);
      }
      catch (e2) {
        try {
          plans.setBasePlan('oops');
        }
        catch (e3) {
          try {
            plans.setBasePlan(plans.ignore);
          }
          catch (e4) {
            done();
          }
        }
      }
    }
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

  it('swallows errors when there is no error handler', function () {
    plans.run(throwError, {base: {}});
  });

});
