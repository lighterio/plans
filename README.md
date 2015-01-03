# <a href="http://lighter.io/plans" style="font-size:40px;text-decoration:none;color:#000"><img src="https://cdn.rawgit.com/lighterio/lighter.io/master/public/plans.svg" style="width:90px;height:90px"> Plans</a>
[![NPM Version](https://img.shields.io/npm/v/plans.svg)](https://npmjs.org/package/plans)
[![Downloads](https://img.shields.io/npm/dm/plans.svg)](https://npmjs.org/package/plans)
[![Build Status](https://img.shields.io/travis/lighterio/plans.svg)](https://travis-ci.org/lighterio/plans)
[![Code Coverage](https://img.shields.io/coveralls/lighterio/plans/master.svg)](https://coveralls.io/r/lighterio/plans)
[![Dependencies](https://img.shields.io/david/lighterio/plans.svg)](https://david-dm.org/lighterio/plans)
[![Support](https://img.shields.io/gratipay/Lighter.io.svg)](https://gratipay.com/Lighter.io/)


**Plans** is a fast, powerful flow control library which combines the
syntactic sugar and chaining of promises with the speed of simple callbacks.
It accepts synchronous and asynchronous functions, and runs them in series
or parallel in limitless combinations. **Plans** handles errors and accepts
reusable plan objects that can specify things like:
* Success, failure and completion functions
* Timeouts
* Retries with delays and backoffs
* HTTP responses
* Reusable base plans for fallback

**Plans** helps you do more, faster, with less code and greater reliability.


### Quick Start

Install `plans` in your project:
```bash
npm install --save plans
```

Require `plans` in a script:
```js
var plans = require('plans');
```

Use plans:
```js
// Flow values through an array of functions.
var file = 'package.json';
plans.flow(file, [fs.readFile, JSON.parse])
  .then(function (data) {
    console.info('This package is called "' + data.name + '".');
  },
  function (e, filename) {
    console.error('Failed to read "' + file + '".', e);
  });
```

A plan can have a success or failure function:
```js
plans.run(fn, {
  ok: function (value) {
    console.info("Success!", value);
  },
  fail: function (error) {
    console.error("Failure.", error);
  }
});
```

Or an "errback", if that's your thing:
```js
plans.run(fn, {
  done: function (error, value) {
    if (error) {
      console.info("Success!", value);
    } else {
      console.error("Failure.", error);
    }
  }
});
```

Anything can be a plan, assuming it exposes methods like `ok`, `info`,
`fail`, `error` or `done`. Since the console object has `info` and `error` methods, it can be used to show the value or the error that a function generates:
```js
plans.run(fn, console);
```

Plans can chain:
```js
plans("package.json").run(fs.readFile)
  .then(function (json) {
    console.info("Package JSON:\n" + json);
  },
  function (error) {
    console.error("These aren't the droids you're looking for...", error);
  });
```

Or run all functions in parallel:
```js
plans.all([fn1, fn2, fn3], console);
```

Or run each function in series:
```js
plans.each([fn1, fn2, fn3], console);
```

And much more:
```js
var path = "package.json";
var version = "1.0.0";
plans(path).flow([fs.readFile, JSON.parse], {
  ok: function (pkg) {
    console.info("Package name: " + pkg.name + ".");
  },
  fail: function (e) {
    console.error("Failed to read " + process.cwd() + "/" + e.input + ".", e);
  },
  SyntaxError: function (e) {
    console.error("Failed to parse JSON:", e.input, e);
  }
})
.andRun(function (pkg) {
  pkg.version = version; // U-P-G-R-A-Y-E-D-D?
  return pkg;
})
.run(JSON.stringify)
.args(function (json) {
  return [path, json];
})
.run(fs.writeFile, {
  ok: function () {
    console.info("We're at v" + version + "!");
  }
});

```

## Glossary

This documentation uses internally-standardized terms to describe abstract
concepts. Hopefully, this mapping will help.

* **args** - an array or an arguments object (i.e. anything with a zero-indexed
    set of properties an integer property called `length`).
* **base** - a plan whose properties are used in place of any properties that
    do not exist on a run's plan.
* **chain** - an instance of `Plans.chain`, which links a run to its
    children and exposes chaining methods like `then`.
* **collection** - an input which is either array-flavored or object-flavored.
    The former uses indexes as keys, and the latter uses properties as keys.
* **fns** - a function or array of functions, which can operate synchronously
    by returning a value other than `undefined`, or asynchronously by passing
    a value to a callback.
* **input** - a value that belongs to a chain and comes in one of 3 flavors:
    ***data***, ***map*** or ***list***. The latter 2 flavors can send output
    through multiple chains.
* **keys** - numbers or strings used to map inputs to outputs.
* **run** - an object created from arguments to a `plans` method, used to store
    the input, state and value.
* **state** - a phase of chain processing. `0` means waiting. `1` means
    succeeded. `2` means failed. `3` means the chain was created just to
    provide input to child runs.
* **value** - an instance of `Error` if a run failed, or a non-error value if a
    run succeeded.


## API

The `plans` API consists of methods for running and chaining functions, and
`plans` itself is a function that returns new chains.

So you can create a chain with "Hi!" as input, and log it:
```js
plans('Hi!').then(console.log);
```

### use(data)

Creates a chain with data-flavored input to use in one call.

### map(collection)

Creates a chain with map-flavored input to use in parallel.

### list(collection)

Creates a chain with list-flavored input to use in series.

### args([object], array)

Creates a chain with args-flavored input to be applied to functions,
optionally using `object` as the `this` context when arguments are applied.

### run(fn, [plan])

Run a single function, according to a plan.

### all(fns, [plan])

Run all functions in parallel, according to a plan.

### each(fns, [plan])

Run each function in series, according to a plan.

### flow(fns, [plan])

Run functions in serial, passing each value as input to the next function.

### filter(fns, [plan])

Run all functions on the input, generating a value composed of input items
which resulted in truthy, non-error results from every function.

### ignore()

No-op function, used to replace callbacks where necessary.


## Plan Objects

A plan is an object or function which specifies how you would like to handle a
result or an error, and all `plans` methods accept a `plan` argument. A plan
can be saved and reused for multiple `plans` method calls, making it easy to
do things like building retry/backoff/timeout/failure handling into all of your
application's external service calls, while conserving resources and code.

Plan objects specify their behavior by having methods such as `ok` and `error`:

```js
var plan = {
  ok: function (result) {
    console.info('Success! :)', result);
  },
  error: function (error) {
    console.error('An error occurred. :(', error);
  },
  done: function (error, result) {
    console.error('Finished.');
  }
};
```

If a function is used as a plan, it gets called with the arguments that an
"errback" expects.

### Base Plans

The `plans.base` object is used as a plan whenever an optional `plan` argument
is omitted from a run. In addition, `plans.base` is used as the base for any
plan that does not have its own `base` property.

By default, `plans.base` just handles failures by logging errors to the
console. But if you'd rather fail silently, you can:
```js
plans.base = null;
```

Or you can make your own base plan do whatever you need it to do:
```js
plans.base = {

  retries: 2, // 3rd time's the charm.

  delay: 1e3, // Wait a sec.

  backoff: 2, // Then wait 2 secs.

  timeout: 1e4, // 10 seconds without a result is no good.

  // Handle success.
  ok: function (value) {
    console.log('OK: ', value);
  },

  // Handle failure.
  error: function (error) {
    console.log('Uh-ok: ', error);
  }
};
```

### Plan Properties

A plan can have many properties to control its behavior and handle results.
Every property is optional, and the base is used for any property whose value
is undefined.

#### ok: function (value) {...}

Called when there is no error. Its argument is the return value of the run.

Note: For `console` support, `info` works in place of `ok`.

#### fail: function (error) {...}

Called when an error occurred. Its argument is the first error that occurred.

Note: For `console` support, `error` works in place of `fail`.

#### fails: function (array) {...}

Called when one or more errors occurred. If a plan has both `.error`
and `.errors`, they will both be called when an error occurs, and each of
them will only be called once (per usage).

#### done: function (error, result) {...}

Called when execution has finished. If execution failed, the error is passed
as the first argument, otherwise the result is passed as the second argument.

#### retries: integer

The number of times to re-run before failing. If all retries fail, the plan's
failure methods will be called. Note: The initial run is not counted in this
number, so for example, setting retries to 2 would result in 3 tries total
before failing.

#### delay: milliseconds

The number of milliseconds to wait before retrying (default: 0). If `backoff`
is set to a number other than 1, then delay will be modified after the first
retry.

#### backoff: number

A multiplier to be applied to `delay` after each retry, enabling exponential
backoff.

#### timeout: milliseconds

The maximum time in milliseconds that to wait before retrying or failing.
When a run times out with no retries remaining, the plan fails with a
TimeoutError.

#### base: plan

A plan to fall back on, instead of using `plans.base`.

#### response: http.ServerResponse

The `response` property is used to respond to an HTTP request with a 500 error.
This is done using the `error` property if present.

## Chain Objects

Instances of `plans.Chain` can be used to start child runs after the parent run
has ended, or to preload a run with an input.


## Acknowledgements

We would like to thank all of the amazing people who use, support,
promote, enhance, document, patch, and submit comments & issues.
Plans couldn't exist without you.

Additionally, huge thanks go to [TUNE](http://www.tune.com) for employing
and supporting [Plans](http://lighter.io/plans) project maintainers,
and for being an epically awesome place to work (and play).


## MIT License

Copyright (c) 2014 Sam Eubank

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## How to Contribute

We welcome contributions from the community and are happy to have them.
Please follow this guide when logging issues or making code changes.

### Logging Issues

All issues should be created using the
[new issue form](https://github.com/lighterio/plans/issues/new).
Please describe the issue including steps to reproduce. Also, make sure
to indicate the version that has the issue.

### Changing Code

Code changes are welcome and encouraged! Please follow our process:

1. Fork the repository on GitHub.
2. Fix the issue ensuring that your code follows the
   [style guide](http://lighter.io/style-guide).
3. Add tests for your new code, ensuring that you have 100% code coverage.
   (If necessary, we can help you reach 100% prior to merging.)
   * Run `npm test` to run tests quickly, without testing coverage.
   * Run `npm run cover` to test coverage and generate a report.
   * Run `npm run report` to open the coverage report you generated.
4. [Pull requests](http://help.github.com/send-pull-requests/) should be made
   to the [master branch](https://github.com/lighterio/plans/tree/master).

### Contributor Code of Conduct

As contributors and maintainers of Plans, we pledge to respect all
people who contribute through reporting issues, posting feature requests,
updating documentation, submitting pull requests or patches, and other
activities.

If any participant in this project has issues or takes exception with a
contribution, they are obligated to provide constructive feedback and never
resort to personal attacks, trolling, public or private harassment, insults, or
other unprofessional conduct.

Project maintainers have the right and responsibility to remove, edit, or
reject comments, commits, code, edits, issues, and other contributions
that are not aligned with this Code of Conduct. Project maintainers who do
not follow the Code of Conduct may be removed from the project team.

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported by opening an issue or contacting one or more of the project
maintainers.

We promise to extend courtesy and respect to everyone involved in this project
regardless of gender, gender identity, sexual orientation, ability or
disability, ethnicity, religion, age, location, native language, or level of
experience.
