var fs = require('fs');
var http = require('http');

// The plans API is an object.
var plans = module.exports = {};

// Expose the version number, but only load package JSON if a get is performed.
Object.defineProperty(plans, 'version', {
  enumerable: false,
  get: function () {
    return require('./package.json').version;
  }
});

// By default, log to console.
var logger = console;

/**
 * Allow a custom logger.
 */
plans.setLogger = function (object) {
  logger = object;
};

// By default, log an error if there is one.
var basePlan = {
  error: function (e) {
    logger.error(e && e.stack ? e.stack : e);
  }
};

/**
 * The base plan's methods get used if a plan doesn't implement some methods.
 */
plans.setBasePlan = function (plan) {
  if (plan && (typeof plan === 'object')) {
    basePlan = plan;
  }
  else {
    throw new Error('The base plan must be an object.');
  }
};

/**
 * An HTTP response's error method can send a 500 and log the error.
 */
var res = http.ServerResponse.prototype;
res.error = res.error || function (e) {
  this.writeHead(500, {'content-type': 'text/html'});
  this.end('<h1>Internal Server Error</h1>');
  logger.error(e.stack || e);
};

/**
 * Empty callback used for preventing base plan method execution.
 */
plans.ignore = function () {};

/**
 * A Retry is a plan clone, on which .tries can be decremented.
 */
function Retry(plan, tries) {
  for (var key in plan) {
    this[key] = plan[key];
  }
  plan.tries = tries;
}

/**
 * Start a plan by doing any necessary pre-work.
 */
function startPlan(plan, args) {
  var base = plan ? plan.base || basePlan : basePlan;
  plan = plan || base;
  var timeout = plan.timeout || base.timeout;
  if (timeout) {
    delete args.timeoutError;
    args.timeout = setTimeout(function () {
      var error = new TimeoutError('Time exceeded ' + timeout + 'ms.');
      finishPlan(plan, [error], null, args);
      args.timeoutError = error;
    }, timeout);
  }
}

function TimeoutError(message) {
  this.message = message;
  this.stack = (new Error()).stack;
}
TimeoutError.prototype = new Error();
TimeoutError.prototype.name = 'TimeoutError';

/**
 * Execute a plan based on the error(s) and value.
 */
function finishPlan(plan, errors, result, args) {
  var fn;
  var base = plan ? plan.base || basePlan : basePlan;
  plan = plan || base;

  clearTimeout(args.timeout);
  if (args.timeoutError) {
    return;
  }

  args.finished = true;
  if (typeof plan == 'function') {
    var errback = plan;
    plan = {
      ok: function (data) {
        errback(null, data);
      },
      error: errback
    };
  }

  if (errors) {
    var tries = plan.tries || base.tries;
    var delay = plan.retryDelay || base.retryDelay;
    if (tries) {
      if (!(plan instanceof Retry)) {
        for (var index = args.length - 1; index; index--) {
          if (args[index] == plan) {
            plan = args[index] = new Retry(plan, tries);
            break;
          }
        }
      }
      if (--plan.tries) {
        if (delay) {
          setTimeout(function () {
            args.callee.apply(plans, args);
          }, delay);
        }
        else {
          args.callee.apply(plans, args);
        }
        return;
      }
    }

    // Handle a single error.
    var error = errors[0];
    var name = error.name;
    var key = name ? name[0].toLowerCase() + name.substr(1) : 'error';
    fn = plan[key] || plan.error || base[key] || base.error;
    if (typeof fn == 'function') {
      fn(error);
    }
    else if (fn instanceof http.ServerResponse) {
      fn.error(error);
    }
    else if (fn) {
      throw error;
    }

    // Handle multiple errors.
    fn = plan.errors || base.errors;
    if (typeof fn == 'function') {
      fn(errors);
    }

  }
  else {
    fn = plan.ok || plan.info || base.ok || base.info;
    if (typeof fn == 'function') {
      fn(result || null);
    }
  }

  if (plan.done) {
    plan.done(result || null);
  }
}

/**
 * Execute a function, then a plan.
 */
plans.run = function(fn, plan) {
  startPlan(plan, arguments);
  var args = arguments;
  var result;
  var argCount = getArgCount(fn);
  var finish = finishPlan;
  try {
    if (argCount == 1) {
      result = fn(function (e, result) {
        if (e instanceof Error) {
          finish(plan, [e], result, args);
        }
        else {
          finish(plan, null, e || result, args);
        }
        finish = plans.ignore;
      });
      if (typeof result != 'undefined') {
        finish(plan, null, result, args);
        finish = plans.ignore;
      }
    }
    else {
      result = fn();
      finish(plan, null, result, args);
    }
  }
  catch (e) {
    finish(plan, [e], result, args);
    finish = plans.ignore;
  }
};

/**
 * Execute functions in series, then execute the plan.
 */
plans.series = function(fns, plan) {
  startPlan(plan, arguments);
  var args = arguments;
  var fnIndex = 0;
  var fnCount = fns.length;
  var errs;
  var next = function () {
    var fn = fns[fnIndex];
    var argCount = getArgCount(fn);
    var onDone = (++fnIndex < fnCount ? next : finish);
    var ignore = plans.ignore;
    var value;
    try {
      if (argCount > 0) {
        value = fn(function (e) {
          if (e instanceof Error) {
            (errs = errs || []).push(e);
            onDone();
            onDone = ignore;
          }
          else {
            onDone();
            onDone = ignore;
          }
        });
        if (typeof value != 'undefined') {
          onDone();
          onDone = ignore;
        }
      }
      else {
        fn();
        onDone();
        onDone = ignore;
      }
    }
    catch (e) {
      (errs = errs || []).push(e);
      onDone();
      onDone = ignore;
    }
  };
  var finish = function () {
    finishPlan(plan, errs, null, args);
  };
  if (fnCount) {
    next();
  }
  else {
    finish();
  }
};

/**
 * Execute functions in parallel, then execute the plan.
 */
plans.parallel = function(fns, plan) {
  startPlan(plan, arguments);
  var args = arguments;
  var waitCount = fns.length;
  var errs;
  if (waitCount) {
    var finish = function() {
      if (!--waitCount) {
        finishPlan(plan, errs, null, plans.parallel, args);
      }
    };
    fns.forEach(function (fn) {
      var argCount = getArgCount(fn);
      var onDone = finish;
      var ignore = plans.ignore;
      var value;
      try {
        if (argCount > 0) {
          value = fn(function (e, value) {
            if (e instanceof Error) {
              (errs = errs || []).push(e);
              onDone();
              onDone = ignore;
            }
            else {
              onDone();
              onDone = ignore;
            }
          });
          if (typeof value != 'undefined') {
            onDone();
            onDone = ignore;
          }
        }
        else {
          fn();
          onDone();
          onDone = ignore;
        }
      }
      catch (e) {
        (errs = errs || []).push(e);
        onDone();
        onDone = ignore;
      }
    });
  }
  else {
    finishPlan(plan, null, null, args);
  }
};

/**
 * Flow data through an array of functions.
 */
plans.flow = function (data, fns, plan) {
  startPlan(plan, arguments);
  var args = arguments;
  var fnIndex = 0;
  var fnCount = fns.length;
  var errs;
  var next = function () {
    var fn = fns[fnIndex];
    var argCount = getArgCount(fn);
    var onData = (++fnIndex < fnCount ? next : finish);
    var ignore = plans.ignore;
    try {
      if (argCount > 1) {
        data = fn(data, function (e, result) {
          if (e) {
            (errs = errs || []).push(e);
            onData();
            onDone = ignore;
          }
          else {
            data = result;
            onData();
            onData = ignore;
          }
        });
        if (typeof data != 'undefined') {
          onData();
          onData = ignore;
        }
      }
      else {
        data = fn(data);
        onData();
        onData = ignore;
      }
    }
    catch (e) {
      (errs = errs || []).push(e);
      onData();
      onDone = ignore;
    }
  };
  var finish = function () {
    finishPlan(plan, errs, data, args);
  };
  if (fnCount) {
    next();
  }
  else {
    finish();
  }
};

/**
 * Trick plans into thinking a function takes a specified number of arguments.
 */
function defineArgCount(fn, count) {
  Object.defineProperty(fn, '_PLANS_ARG_COUNT', {
    enumerable: false,
    value: count
  });
}

/**
 * Get an array of names of arguments that a function takes.
 */
function getArgs(fn) {
  var match = fn.toString().match(/function.*?\((.*?)\)/);
  var args = match[1] ? match[1].split(',') : [];
  return args;
}

/**
 * Get the number of arguments that a function takes.
 */
function getArgCount(fn) {
  var count = fn._PLANS_ARG_COUNT;
  if (typeof count != 'number') {
    var args = getArgs(fn);
    count = args.length;
    Object.defineProperty(fn, '_PLANS_ARG_COUNT', {
      enumerable: false,
      value: count
    });
  }
  return count;
}

// Trick plans.flow into thinking fs.readFile takes (path, callback) arguments.
defineArgCount(fs.readFile, 2);
