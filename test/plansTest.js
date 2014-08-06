var is = require('../../exam/lib/is');
var plans = require('../../plans');

var throwMe = function () {
  throw new Error('wtf ftw');
};

require('zeriousify').test();

describe('API', function () {

  it('is a function', function () {
    is.function(plans);
    plans();
  });

  describe('setLogger', function () {

    it('is a function', function () {
      is.function(plans.setLogger);
    });

    it('sets a logger', function () {
      plans.setLogger(console);
    });

  });

  describe('setBasePlan', function () {

    // Trigger an error so the base plan's will log.
    it('is called internally', function (done) {
      var errorCount = 0;
      plans.setLogger({
        error: function () {
          errorCount = 1;
        }
      });
      plans.flow(0, [throwMe]);
      setImmediate(function () {
        is(errorCount, 1);
        done();
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
      plans.flow(0, [throwMe]);
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

  });

  describe('ignore', function () {
    it('is a function', function () {
      is.function(plans.ignore);
    });
    it('does nothing', function () {
      plans.ignore();
    });
  });

});
