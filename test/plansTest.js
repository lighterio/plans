require('zeriousify').test();

describe('plans', function () {
  it('is a function', function () {
    var plans = require('../plans');
    is.function(plans);
    plans();
  });
});
