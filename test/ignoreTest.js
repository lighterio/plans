var plans = require('../plans');
describe('plans.ignore', function () {
  it('is a function', function () {
    is.function(plans.ignore);
  });
  it('does nothing', function () {
    plans.ignore();
  });
});
