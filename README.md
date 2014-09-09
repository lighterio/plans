# Plans

[![NPM Version](https://img.shields.io/npm/v/plans.svg) ![Downloads](https://img.shields.io/npm/dm/plans.svg)](https://npmjs.org/package/plans)
[![Build Status](https://img.shields.io/travis/lighterio/plans.svg)](https://travis-ci.org/lighterio/plans)
[![Code Coverage](https://img.shields.io/coveralls/lighterio/plans/master.svg)](https://coveralls.io/r/lighterio/plans)
[![Dependencies](https://img.shields.io/david/lighterio/plans.svg)](https://david-dm.org/lighterio/plans)
[![Support](https://img.shields.io/gratipay/Lighter.io.svg)](https://gratipay.com/Lighter.io/)

Plans is a high-performance JavaScript library for async operations and error
handling. It uses a promise-inspired structure called a "plan". A plan is a
plain object with optional methods including `ok`, `error` and `done` (think
  `try`, `catch` and `finally`).

# Quick Start

Install plans as a dependency of your package.
```bash
npm i --save plans
```

Require "plans" and use its methods.

```js
var plans = require('plans');

// Execute a function that returns a value or calls an errback.
plans.run(fn, {
  ok: function (value) {
    console.info('Success! :)', value);
  },
  error: function (e) {
    console.error('Failure. :(', e);
  },
  done: function () {
    console.log('Finished. (See result above).', e);
  }
});

// Flow data through an array of functions.
plans.flow('package.json', [fs.readFile, JSON.parse], {
  ok: function (data) {
    console.info('This package is called "' + data.name + '".');
  },
  error: function (e, filename) {
    console.error('Failed to read "' + process.cwd() + '/' + filename + '".', e);
  },
  syntaxError: function (e, json) {
    console.error('Failed to parse "' + json + '" as JSON.', e);
  }
});

// Execute 3 functions sequentially.
plans.series([fn1, fn2, fn3], {
  ok: function () {
    console.info('All three functions succeeded! :)');
  },
  error: function (e) {
    console.error('An error occurred. :(', e);
  }
});

// Execute 3 functions simultaneously.
plans.parallel([fn1, fn2, fn3], {
  ok: function () {
    console.info('All three functions succeeded! :)');
  },
  error: function (e) {
    console.error('An error occurred. :(', e);
  }
});
```

<!--
// Get stats objects for an array of files (simultaneously).
plans.map(['a.js', 'b.js', 'c.js'], fs.stat, {
  ok: function (resultArray) {
    console.info('File stats:', successMap);
  },
  error: function (e) {
    console.error('Failed to stat some files:', e);
  }
});

// Get an array of files which exist.
plans.filter(['a.js', 'b.js', 'c.js'], fs.exists, {
  done: function (arrayOfFiles) {
    console.log('These files exist:', arrayOfFiles);
  }
});
-->

# Plan Objects

A plan is a simple object which specifies how you would like to handle a result,
whether it is success or error. A plan object can be saved and reused for
multiple ```plans``` method calls.

Plan objects specify their behavior by having methods such as ```ok``` and
```error``` in the following example:

```javascript
var plan = {
  ok: function () {
    console.info('All three functions succeeded! :)');
  },
  error: function (e) {
    console.error('An error occurred. :(', e);
  }
};
```
## Supported properties

### .ok: function (result) {...}

Called when there is a result and no error.

### .error: function (error) {...}

Called when an error occurred. Its argument is the first error that occurred.

### .errors: function (arrayOfErrors) {...}

Called when one or more errors occurred. If a plan has both ```.error```
and ```.errors```, they will both be called when an error occurs, and each of
them will only be called once (per usage).

### .tries: integer

Specifies the maximum number of times to attempt execution. The default is one,
and any value greater than one allows for retries. If the method fails on each
try, it will call the plan's `error` and/or `errors` methods with the
error/errors from the final attempt.

### .retryDelay: milliseconds

Specifies the number of milliseconds to wait before retrying.

### .timeout: milliseconds

Specifies the maximum time in milliseconds that a method should wait before
considering itself to have failed. When a timeout occurs, the plan can retry
if it has not yet exhausted its `tries`. Otherwise, the plan's `error`
and/or `errors` method will be called with a TimeoutError.

### .base: plan

The `base` property specifies a plan to fall back on, instead of using the
global `basePlan` (see `plans.setBasePlan`).

### .response: httpResponse

The `response` property is used to respond to an HTTP request with a 500 error.
This is done using the `error` property if present.

# API Methods

The plans module returns an object with several methods for setting defaults
and executing plans.

### .setLogger(object)

Sets the logger that plans can use to log errors. The default is `console`.

### .setBasePlan(object)

Sets the base plan whose methods will be used if the current plan has no
implementation for those methods. The default is to just log errors using the
logger from `plans.setLogger`:
```js
{
  error: function (e) {
    logger.error(e);
  }
}
```

### .run(fn, plan)

Runs the function, then executes the plan.

### .flow(data, fnArray, plan)

Runs an array of functions on data in serial by returning the result of the
previous function to the next function.

### .parallel(fnArray, plan)

Executes an array of functions in parallel, then executes the plan.

### .series(fnArray, plan)

Executes an array of functions in series, then executes the plan.

<!--
### .map(array, fn, plan)

Runs each item in the array through a function and returns an array containing
the results of each of those functions.

### .filter(array, fn, plan)

Returns the items from the array for which the function returned a truey value.
-->

### .ignore()

Empty callback, used for overriding default error logging.
