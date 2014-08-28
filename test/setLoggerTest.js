var plans = require('../plans');

describe('plans.setLogger', function () {

  it('is a function', function () {
    is.function(plans.setLogger);
  });

  it('sets a logger', function () {
    plans.setLogger(console);
  });

});
