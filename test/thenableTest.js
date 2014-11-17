var plans = require('../plans');
var Thenable = plans.Thenable;

function return1() { return 1; }
function return2() { return 2; }
function return3() { return 3; }
function throwE() { throw new Error('E'); }

describe('Thenable', function () {

  it('is returned by plans methods', function () {
    var r = plans.run(function () {});
    is.instanceOf(r, Thenable);
  });

  describe('.prototype', function () {

    it('has all expected methods', function () {
      var r = new Thenable(arguments);
    });

    describe('.add', function () {

      it('adds children', function () {
        var a = arguments;
        var t = new Thenable(a);
        t.add(a);
        is(a.children[0].fn, undefined);
      });

      it('references functions', function () {
        var a = arguments;
        var t = new Thenable(a);
        t.add(a, plans.run);
        is(a.children[0].fn, plans.run);
      });

    });

    describe('.then', function () {

      it('runs a success function', function (done) {
        plans
          .run(return1)
          .then(function (result) {
            is(result, 1);
            done();
          }, is.fail);
      });

      it('runs a failure function', function (done) {
        plans
          .run(throwE)
          .then(is.fail, function (e) {
            is.error(e);
            done();
          });
      });

    });

    describe('.run', function () {

      it('runs plans.run later', function (done) {
        plans
          .run(return1)
          .run(return2, function (e, result) {
            done();
          });
      });

      it('allows chaining', function (done) {
        plans
          .run(return1)
          .run(return2)
          .run(return3, done);
      });

      it('allows chaining parallels', function (done) {
        plans
          .run(return1)
          .run(return3)
          .then(done);
      });

    });

  });

});

/*
plans.run =
plans.parallel =
plans.all(fns, [plan]) // Thenable fns in serial.
plans.one(fns, [plan]) // Thenable fns in parallel and return the first result.
plans.serial =
plans.each(fns, [plan]) // Thenable fns in parallel.
plans.pass =
plans.map(input, fns, [plan]) // Pass input through all fns and return outputs with the same keys or order.
plans.flow(input, fns, [plan]) // Flow input through fns and return the result.
plans.filter(input, fns, [plan]) // Flow input through fns and return items for which fns never returned false.
*/






//
