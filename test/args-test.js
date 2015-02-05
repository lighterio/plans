var plans = require('../plans');
var Chain = plans.Chain;

function add(a, b) { return a + b; }

describe('plans.args', function () {

  it('uses data as arguments', function (done) {
    plans.args([1, 2]).run(add, function (e, result) {
      is(result, 3);
      done();
    });
  });

});
