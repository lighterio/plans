var plans = require('../plans');
var Chain = plans.Chain;

function increment(n) { return (n || 0) + 1; }
function multiply(n) { return (n || 0) * 2; }
function asyncIncrement(n, fn) { fn((n || 0) + 1); }

describe('plans.list', function () {

  it('returns a Chain', function () {
    var chain = plans.list([1]);
    is.instanceOf(chain, Chain);
  });

  it('is not the default', function (done) {
    plans([1])
      .run(increment, function (e, result) {
        is(result, '11');
        done();
      });
  });

  it('works on arrays', function (done) {
    plans.list([1, 2])
      .run(increment, function (e, value) {
        is.same(value, [2, 3]);
        done();
      });
  });

  it('works on objects', function (done) {
    plans.list({a: 1, b: 2})
      .run(increment, function (e, value) {
        is.same(value, {a: 2, b: 3});
        done();
      });
  });

  it('chains in steps', function (done) {
    plans.list({a: 1, b: 2})
      .run(increment, function (e, value) {
        is.same(value, {a: 2, b: 3});
      })
      .run(multiply, function (e, value) {
        is.same(value, {a: 4, b: 6});
        done();
      });
  });

  it('chains in flows', function (done) {
    plans.list({a: 1, b: 2})
      .flow([increment, multiply], function (e, value) {
        is.same(value, {a: 4, b: 6});
        done();
      });
  });

  it('executes in series', function (done) {
    var s = '';
    function delay(t, fn) {
      setTimeout(function () {
        s += t;
        fn(t);
      }, t);
    }
    plans.list({a: 2, b: 1})
      .flow(delay, function (e, value) {
        is(s, '21');
        is.same(value, {a: 2, b: 1});
        done();
      });
  });

});
