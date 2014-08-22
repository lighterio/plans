require('zeriousify').test();

var plans = require('../plans');

describe('plans', function () {

  it('is an object', function () {
    is.object(plans);
  });

  it('has a version', function () {
    is.string(plans.version);
  });

});
