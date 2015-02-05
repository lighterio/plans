var plans = require('../plans');

function even(n, f) {
  f(n % 2 < 1);
}

describe('plans.filter', function () {

  it('is a function', function () {
    is.function(plans.filter);
  });

  it('filters data', function (done) {
    plans([3, 8, 7, 5, 2])
      .filter(even, function (e, result) {
        debug(arguments);
        is.same(result, [8, 2]);
        done();
      });
  });

});
