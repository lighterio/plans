var plans = require('../plans');

describe('plans', function () {

  it('is a function', function () {
    is.function(plans);
  });

  it('returns a Chain', function () {
    var o = plans(1);
    is.instanceOf(o, plans.Chain);
  });

  it('has a version', function () {
    is.string(plans.version);
  });

});
