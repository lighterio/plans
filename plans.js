var fs = require('fs');

// The plans API is an object.
var plans = module.exports = {};

// Expose the version number, but only load package JSON if a get is performed.
Object.defineProperty(plans, 'version', {
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
  basePlan = plan;
};

/**
 * Empty callback used for preventing base plan method execution.
 */
plans.ignore = function () {};

/**
 * A Retry is a plan that is being tried again.
 */
function Retry(plan) {
  for (var key in plan) {
    this[key] = plan[key];
  }
}

/**
 * Execute a plan based on the error(s) and value.
 */
function finishPlan(plan, errors, result, method, args) {
  var fn;
  if (typeof plan == 'function') {
    var errback = plan;
    plan = {
      ok: function (data) {
        errback(null, data);
      },
      error: function (e) {
        errback(e);
      }
    };
  }
  if (errors) {
    if (plan && plan.tries) {
      if (!(plan instanceof Retry)) {
        for (var index = args.length - 1; index; index--) {
          if (args[index] == plan) {
            plan = args[index] = new Retry(plan);
            break;
          }
        }
      }
      if (--plan.tries) {
        method.apply(plans, args);
        return;
      }
    }
    handleError(plan, errors[0]);
    if (plan) {
      fn = plan.errors;
    }
    if (!fn && basePlan) {
      fn = basePlan.errors;
    }
    if (fn) {
      fn(errors);
    }
  }
  else {
    if (plan) {
      fn = plan.ok || plan.info;
    }
    if (!fn && basePlan) {
      fn = basePlan.ok || basePlan.info;
    }
    if (fn) {
      fn(result || null);
    }
  }
  if (plan && plan.done) {
    plan.done(result || null);
  }
}

/**
 * Handle an error according to the plan.
 */
function handleError(plan, error) {
  plan = plan || basePlan;
  var name = error.name;
  var key = name[0].toLowerCase() + name.substr(1);
  var handler;
  if (plan) {
    handler = plan[key] || plan.error;
  }
  if (!handler && basePlan) {
    handler = basePlan[key] || basePlan.error;
  }
  if (handler === true) {
    throw error;
  }
  else if (handler) {
    handler(error);
  }
}

/**
 * Execute a function, then a plan.
 */
plans.run = function(fn, plan) {
  var args = arguments;
  var result;
  var argCount = getArgCount(fn);
  var finish = finishPlan;
  try {
    if (argCount == 1) {
      result = fn(function (e, result) {
        finish(plan, e ? [e] : null, result, plans.run, args);
        finish = plans.ignore;
      });
      if (typeof result != 'undefined') {
        finish(plan, null, result);
        finish = plans.ignore;
      }
    }
    else {
      result = fn();
      finish(plan, null, result);
    }
  }
  catch (e) {
    finish(plan, [e], result, plans.run, args);
    finish = plans.ignore;
  }
};

/**
 * Execute functions in series, then execute the plan.
 */
plans.series = function(fns, plan) {
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
    finishPlan(plan, errs, null, plans.series, args);
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
    finishPlan(plan);
  }
};

/**
 * Flow data through an array of functions.
 */
plans.flow = function (data, fns, plan) {
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
    finishPlan(plan, errs, data, plans.flow, args);
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
