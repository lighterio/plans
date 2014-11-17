# <a href="http://lighter.io/plans" style="font-size:40px;text-decoration:none;color:#000"><img src="https://cdn.rawgit.com/lighterio/lighter.io/master/public/plans.svg" style="width:90px;height:90px"> Plans</a>
[![NPM Version](https://img.shields.io/npm/v/plans.svg)](https://npmjs.org/package/plans)
[![Downloads](https://img.shields.io/npm/dm/plans.svg)](https://npmjs.org/package/plans)
[![Build Status](https://img.shields.io/travis/lighterio/plans.svg)](https://travis-ci.org/lighterio/plans)
[![Code Coverage](https://img.shields.io/coveralls/lighterio/plans/master.svg)](https://coveralls.io/r/lighterio/plans)
[![Dependencies](https://img.shields.io/david/lighterio/plans.svg)](https://david-dm.org/lighterio/plans)
[![Support](https://img.shields.io/gratipay/Lighter.io.svg)](https://gratipay.com/Lighter.io/)


## TL;DR

Plans is a high-performance JavaScript library for async operations and error
handling. It uses a promise-inspired structure called a "plan". A plan is a
plain object with optional methods including `ok`, `error` and `done` (think
  `try`, `catch` and `finally`).


### Quick Start

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
  done: function (e, value) {
    console.log('Finished.', e, value);
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
  catchSyntaxError: function (e, json) {
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


## Plan Objects

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
### Supported properties

#### .ok: function (result) {...}

Called when there is a result and no error.

#### .error: function (error) {...}

Called when an error occurred. Its argument is the first error that occurred.

#### .errors: function (arrayOfErrors) {...}

Called when one or more errors occurred. If a plan has both ```.error```
and ```.errors```, they will both be called when an error occurs, and each of
them will only be called once (per usage).

#### .done: function (error, result) {...}

Called when execution has finished. If execution failed, the error is passed
as the first argument, otherwise the result is passed as the second argument.

#### .tries: integer

Specifies the maximum number of times to attempt execution. The default is one,
and any value greater than one allows for retries. If the method fails on each
try, it will call the plan's `error` and/or `errors` methods with the
error/errors from the final attempt.

#### .retryDelay: milliseconds

Specifies the number of milliseconds to wait before retrying.

#### .timeout: milliseconds

Specifies the maximum time in milliseconds that a method should wait before
considering itself to have failed. When a timeout occurs, the plan can retry
if it has not yet exhausted its `tries`. Otherwise, the plan's `error`
and/or `errors` method will be called with a TimeoutError.

#### .base: plan

The `base` property specifies a plan to fall back on, instead of using the
global `basePlan` (see `plans.setBasePlan`).

### .response: httpResponse

The `response` property is used to respond to an HTTP request with a 500 error.
This is done using the `error` property if present.

## Thenable Objects

A Thenable has methods that can be used to start new runs after the parent
run has ended.

## API Methods

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

To revert changes, you can restore `plans.defaultBasePlan`:
```js
plans.setBasePlan(plans.defaultBasePlan);
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
