var plans = require('../plans');
var Chain = plans.Chain;

function increment(input) { return (input || 0) + 1; }
function delay(fn) { setTimeout(function () { fn(9); }, 5); }
function throwE() { throw new Error('E'); }

describe('Chain', function () {

  it('is returned by plans methods', function () {
    var r = plans.all(function () {});
    is.instanceOf(r, Chain);
  });

  describe('.prototype', function () {

    it('has all expected methods', function () {
      var r = new Chain(arguments);
    });

    describe('.increment', function () {

      it('increments children', function () {
        var a = arguments;
        var t = new Chain(a);
        t._add(a);
        is(a.children[0].fn, undefined);
      });

      it('references functions', function () {
        var a = arguments;
        var t = new Chain(a);
        t._add(a, plans.all);
        is(a.children[0].fn, plans.all);
      });

    });

    describe('.then', function () {

      it('runs a success function', function (done) {
        plans(0)
          .all(increment)
          .then(function (result) {
            is(result, 1);
            done();
          }, is.fail);
      });

      it('runs a failure function', function (done) {
        plans
          .all(throwE, {fail: plans.ignore})
          .then(is.fail, function (e) {
            is.error(e);
            done();
          });
      });

    });

    describe('.all', function () {

      it('runs plans.all later', function (done) {
        plans(0)
          .all(increment)
          .all(increment, function (e, result) {
            is(result, 2);
            done();
          });
      });

      it('allows chaining', function (done) {
        plans(0)
          .all(increment)
          .all(increment)
          .all(increment, done);
      });

      it('allows chaining parallels', function (done) {
        plans(0)
          .all(increment)
          .all([increment, increment])
          .then(function (result) {
            is.same(result, [2, 2]);
            done();
          });
      });

    });

    describe('.map', function () {

      it('mapifies data', function (done) {
        plans([1, 2]).map()
          .all(increment, function (e, result) {
            is.same(result, [2, 3]);
            done();
          });
      });

    });

    describe('.list', function () {

      it('listifies data', function (done) {
        plans([1, 2]).list()
          .all(increment, function (e, result) {
            is.same(result, [2, 3]);
            done();
          });
      });

    });

    describe('.data', function () {

      it('unmapifies data', function (done) {
        plans([1, 2]).map().use()
          .all(increment, function (e, result) {
            is(result, '1,21');
            done();
          });
      });

      it('unlistifies data', function (done) {
        plans([1, 2]).list().use()
          .all(increment, function (e, result) {
            is(result, '1,21');
            done();
          });
      });

    });

  });

});
