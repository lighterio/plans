var fs = require('fs');

var plans = module.exports = function () {
  // TODO: Argument-overloaded shorthand?
};

/**
 * Expose the version to module users.
 */
plans.version = require('./package.json').version;

/**
 * Allow a custom logger.
 */
var logger = console;
plans.setLogger = function (object) {
  logger = object;
};


// By default, log an error if there is one.
var basePlan = {
  error: function (e) {
    logger.error(e ? e.stack || e : e);
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
 * Execute a plan based on the error(s) and value.
 */
function finishPlan(plan, errors, result) {
  var fn;
  if (errors) {
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
  var result;
  var argCount = getArgCount(fn);
  var finish = finishPlan;
  try {
    if (argCount == 1) {
      result = fn(function (e, result) {
        finish(plan, e ? [e] : null, result);
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
    finish(plan, [e], result);
    finish = plans.ignore;
  }
};

/**
 * Execute functions in parallel, then execute the plan.
 */
plans.parallel = function(fns, plan) {
  /*
  var wait = 1;
  var errs = [];
  fns.forEach(function (fn) {
    try {
      fn();
    }
    catch (e) {
      (errs = errs || []).push(e);
    }
    if (!--wait) {
      finishPlan(plan, errs);
    }
  });
  if (!--wait) {
    finishPlan(plan, errs);
  }
  */
};

/**
 * Execute functions in series, then execute the plan.
 */
plans.series = function(fns, plan) {
  /*
  var fnIndex = 0;
  var fnCount = fns.length;
  var errs;
  var next = function () {
    var fn = fns[fnIndex];
    var argCount = getArgCount(fn);
    var callback = (++fnIndex < fnCount ? next : finish);
    var ignore = plans.ignore;
    try {
      if (argCount == 2) {
        data = fn(data, function (err, result) {
          if (err) {
            handleError(plan, err);
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
      onData(data);
    }
  };
  var finish = function () {
    finishPlan(plan, errs, data);
  };
  if (fnCount) {
    next();
  }
  else {
    finish();
  }
  */
};

/**
 * Flow data through an array of functions.
 */
plans.flow = function (data, fns, plan) {
  var fnIndex = 0;
  var fnCount = fns.length;
  var errs;
  var next = function () {
    var fn = fns[fnIndex];
    var argCount = getArgCount(fn);
    var onData = (++fnIndex < fnCount ? next : finish);
    var ignore = plans.ignore;
    try {
      if (argCount == 2) {
        data = fn(data, function (e, result) {
          if (e) {
            (errs = errs || []).push(e);
            onData();
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
    }
  };
  var finish = function () {
    finishPlan(plan, errs, data);
  };
  if (fnCount) {
    next();
  }
  else {
    finish();
  }
};

/**
 * Trick plans.flow into thinking a function takes (data, cb(err, data)) args.
 */
function seeAsHavingTwoArgs(fn) {
  Object.defineProperty(fn, '_PLANS_ARG_COUNT', {
    enumerable: false,
    value: 2
  });
}

function getArgs(fn) {
  var args = fn._PLANS_ARGS;
  if (!args) {
    var match = fn.toString().match(/function.*?\((.*?)\)/);
    args = match[1].split(',');
    Object.defineProperty(fn, '_PLANS_ARGS', {
      enumerable: false,
      value: args
    });
  }
  return args;
}

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

seeAsHavingTwoArgs(fs.readFile);
