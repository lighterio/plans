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

// By default, log an error when we fail
var baseRun = plans.defaultBaseRun = {
  fail: function (e) {
    logger.error(e && e.stack ? e.stack : e);
  }
};

/**
 * The base plan's methods get used if a plan doesn't implement some methods.
 */
plans.setBaseRun = function (plan) {
  baseRun = plan;
};

/**
 * An HTTP response's error method can send a 500 and log the error.
 */
var response = http.ServerResponse.prototype;
response.error = response.error || function (e) {
  this.writeHead(500, {'content-type': 'text/html'});
  this.end('<h1>Internal Server Error</h1>');
  logger.error(e.stack || e);
};

/**
 * Empty callback used for preventing base plan method execution.
 */
plans.ignore = function () {};

/**
 * Add a function to be run before an existing plan method.
 */
plans.before = function (plan, key, fn) {
  plan = plan || {};
  var existing = plan[key];
  plan[key] = existing ? function () {
    fn.apply(this, arguments);
    existing.apply(this, arguments);
  } : fn;
  return plan;
};

/**
 * Add a function to be run after an existing plan method.
 */
plans.after = function (plan, key, fn) {
  plan = plan || {};
  var existing = plan[key];
  plan[key] = existing ? function () {
    existing.apply(this, arguments);
    fn.apply(this, arguments);
  } : fn;
  return plan;
};

/**
 * Start a plan by doing any necessary pre-work.
 */
function startRun(plan, args) {
  var base = plan ? plan.base || baseRun : baseRun;
  plan = plan || base;

  // If there's a current child set it instead of creating a new one.
  if (Run.child) {
    debug(Run.child);
    args.child = Run.child;
    delete Run.child;
  }

  // Allow a plan to time out after a specified number of milliseconds.
  var timeout = plan.timeout || base.timeout;
  if (timeout) {
    delete args.timeoutError;
    args.timeout = setTimeout(function () {
      var e = new Error('Runs execution time exceeded ' + timeout + 'ms.');
      e.name = 'TimeoutError';
      finishRun(plan, e, null, args);
      args.timeoutError = e;
    }, timeout);
  }
  return args;
}

/**
 * Execute a plan based on the error and result.
 */
function finishRun(plan, error, result, args) {
  var fn;
  var base = (plan ? plan.base || baseRun : baseRun) || 0;
  plan = plan || base;

  clearTimeout(args.timeout);
  if (args.timeoutError) {
    return;
  }

  // If a function is passed in, use it as a `done` errback.
  if (typeof plan == 'function' && !plan.done) {
    plan.done = plan;
  }

  // If there's an error, retry or handle it.
  if (error) {
    var tries = plan.tries || base.tries;
    if (tries) {
      // Create a new Run so we can decrement `tries` with no side effects.
      if (!plan.isRetry) {
        for (var index = 0; index < args.length; index++) {
          if (plan == args[index]) break;
        }
        args[index] = plan = Run.create(plan);
        plan.isRetry = true;
      }
      plan.tries = --tries;
      if (tries) {
        var delay = plan.retryDelay || base.retryDelay || 0;
        setTimeout(function () {
          args.callee.apply(plans, args);
        }, delay);
        return;
      }
    }

    // Handle a single error.
    var key = 'catch' + error.name;
    fn = plan[key] || plan.fail || plan.error || base[key] || base.fail || base.error;
    if (typeof fn == 'function') {
      fn.call(plan, error, error.input);
    }
    else if (fn instanceof http.ServerResponse) {
      fn.error(error);
    }
    else if (fn) {
      throw error;
    }

    // Convert a linked list of errors to an array.
    fn = plan.errors || base.errors;
    if (typeof fn == 'function') {
      var errors = [error];
      var errorN = error._NEXT;
      while (errorN && (errors.length < 100)) {
        errors.push(errorN);
        errorN = errorN._NEXT;
      }
      fn.call(plan, errors);
    }

  }
  else {
    // Handle success.
    fn = plan.ok || plan.info || base.ok || base.info;
    if (typeof fn == 'function') {
      fn.call(plan, result);
    }
  }

  // Handle completion with an errback.
  fn = plan.done || base.done;
  if (typeof fn == 'function') {
    fn.call(plan, error, result);
  }

  // Run items that were queued by a Run.
  args.error = error;
  args.result = result;
  Run.finish(args);
}

/**
 * Execute a function, then a plan.
 */
plans.run = function (fn, plan) {
  var run = startRun(plan, arguments);
  var args = arguments;
  var result;
  var argCount = getArgCount(fn);
  var done = finishRun;
  try {
    if (argCount == 1) {
      result = fn(function (e, result) {
        if (e instanceof Error) {
          done(plan, e, result, args);
        }
        else {
          done(plan, null, e || result, args);
        }
        done = plans.ignore;
      });
      if (result !== undefined) {
        done(plan, null, result, args);
        done = plans.ignore;
      }
    }
    else {
      result = fn();
      done(plan, null, result, args);
    }
  }
  catch (e) {
    done(plan, e, result, args);
    done = plans.ignore;
  }
  return args.child || new Run(args);
};

/**
 * Execute functions in series, then execute the plan.
 */
plans.series = function (fns, plan) {
  startRun(plan, arguments);
  var args = arguments;
  var fnIndex = 0;
  var e0, eN;
  var next = function () {
    var fn = fns[fnIndex];
    var argCount = getArgCount(fn);
    var then = (++fnIndex < fns.length ? next : done);
    var ignore = plans.ignore;
    var value;
    try {
      if (argCount > 0) {
        value = fn(function (e) {
          if (e instanceof Error) {
            eN = (e0 ? (eN._NEXT = e) : (e0 = e));
            then();
            then = ignore;
          }
          else {
            then();
            then = ignore;
          }
        });
        if (value !== undefined) {
          then();
          then = ignore;
        }
      }
      else {
        fn();
        then();
        then = ignore;
      }
    }
    catch (e) {
      eN = (e0 ? (eN._NEXT = e) : (e0 = e));
      then();
      then = ignore;
    }
  };
  var done = function () {
    finishRun(plan, e0, null, args);
  };
  if (fns.length) {
    next();
  }
  else {
    done();
  }
  return args.child || new Run(args);
};

/**
 * Execute functions in parallel, then execute the plan.
 */
plans.parallel = function (fns, plan) {
  startRun(plan, arguments);
  var args = arguments;
  var waitCount = fns.length;
  var e0, eN;
  if (waitCount) {
    fns.push = function (fn) {
      fns[fns.length] = fn;
      waitCount++;
      run(fn);
    };
    var done = function () {
      if (!--waitCount) {
        finishRun(plan, e0, null, args);
      }
    };
    var run = function (fn) {
      var argCount = getArgCount(fn);
      var then = done;
      var ignore = plans.ignore;
      var value;
      try {
        if (argCount > 0) {
          value = fn(function (e, value) {
            if (e instanceof Error) {
              eN = (e0 ? (eN._NEXT = e) : (e0 = e));
              then();
              then = ignore;
            }
            else {
              then();
              then = ignore;
            }
          });
          if (value !== undefined) {
            then();
            then = ignore;
          }
        }
        else {
          fn();
          then();
          then = ignore;
        }
      }
      catch (e) {
        eN = (e0 ? (eN._NEXT = e) : (e0 = e));
        then();
        then = ignore;
      }
    };
    fns.forEach(run);
  }
  else {
    finishRun(plan, null, null, args);
  }
  return args.child || new Run(args);
};

/**
 * Pass data to a function, then execute the plan.
 */
plans.pass = function (data, fn, plan) {
  startRun(plan, arguments);
  var args = arguments;
  var result;
  var argCount = getArgCount(fn);
  var done = finishRun;
  try {
    if (argCount > 1) {
      result = fn(data, function (e, result) {
        if (e instanceof Error) {
          done(plan, e, result, args);
        }
        else {
          done(plan, null, e || result, args);
        }
        done = plans.ignore;
      });
      if (result !== undefined) {
        done(plan, null, result, args);
        done = plans.ignore;
      }
    }
    else {
      result = fn(data);
      done(plan, null, result, args);
    }
  }
  catch (e) {
    done(plan, e, result, args);
    done = plans.ignore;
  }
  return args.child || new Run(args);
};

/**
 * Flow data through an array of functions.
 */
plans.flow = function (data, fns, plan) {
  startRun(plan, arguments);
  var args = arguments;
  var fnIndex = 0;
  var e0, eN;
  var next = function () {
    var fn = fns[fnIndex];
    var argCount = getArgCount(fn);
    var onData = (++fnIndex < fns.length ? next : done);
    var ignore = plans.ignore;
    try {
      if (argCount > 1) {
        data = fn(data, function (e, result) {
          if (e) {
            e.input = data;
            eN = (e0 ? (eN._NEXT = e) : (e0 = e));
            onData();
            then = ignore;
          }
          else {
            data = result;
            onData();
            onData = ignore;
          }
        });
        if (data !== undefined) {
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
      e.input = data;
      eN = (e0 ? (eN._NEXT = e) : (e0 = e));
      onData();
      then = ignore;
    }
  };
  var done = function () {
    finishRun(plan, e0, data, args);
  };
  if (fns.length) {
    next();
  }
  else {
    done();
  }
  return args.child || new Run(args);
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

/**
 * Create a Run using the arguments to a plans method.
 */
var Run = plans.Run = function Run(args) {
  var self = this;
  self.args = args;
};

/**
 * The Run prototype exposes methods to build a queue for execution.
 */
Run.prototype = {

  /**
   * Queue arguments to be processed after the parent.
   */
  queue: function (args, fn) {
    var self = this;
    var parent = self.parent;

    // When args are queued, return a Run to support chaining.
    var child = args.child = new Run(args);

    args.fn = fn;
    if (self.parent.finished) {
      Run.start.call(parent, args);
    }
    else {
      (parent._queue = parent._queue || []).push(args);
    }
    return child;
  },

  then: function () { return this.queue(arguments); },
  run: function () { return this.queue(arguments, plans.run); },
  flow: function () { return this.queue(arguments, plans.flow); },
  series: function () { return this.queue(arguments, plans.series); },
  parallel: function () { return this.queue(arguments, plans.parallel); }

};

/**
 * Create a new plan from an existing object.
 */
Run.create = function (object) {
  var plan = new Run();
  for (var property in object) {
    plan[property] = object[property];
  }
  return plan;
};

/**
 * Start a plan method execution with queued arguments.
 * The `this` context is set to the parent that owns the queue.
 */
Run.start = function (args) {
  var parent = this;
  var fn = args.fn;

  // Temporarily set a child plan to execute afterward.
  Run.child = args.child;

  // If a function has been set, call it on plans.
  if (fn) {
    fn.apply(plans, args);
  }

  // Otherwise, pass a value to a success or failure function.
  else {
    fn = args[parent.error ? 1 : 0];
    plans.pass(parent.error || parent.result, fn);
  }
};

/**
 * Finish a parent by triggering its children.
 */
Run.finish = function (parent) {
  parent.finished = true;
  if (parent._queue) {
    parent._queue.forEach(Run.start, parent);
  }
};
