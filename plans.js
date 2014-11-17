var fs = require('fs');
var http = require('http');
var Type = require(__dirname + '/common/object/type');

// The plans API is an object.
var plans = module.exports = {};

// Promise-like states.
var PENDING = 0;
var RESOLVED = 1;
var REJECTED = 2;

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
var basePlan = plans.defaultBasePlan = {
  fail: function (e) {
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
 * An HTTP response's error method can send a 500 and log the error.
 */
var response = http.ServerResponse.prototype;
response.error = response.error || function (e) {
  this.writeHead(500, {'content-type': 'text/html'});
  this.end('<h1>Internal Server Error</h1>');
  logger.error(e.stack || e);
};

/**
 * Empty callback used for halting.
 */
var ignore = plans.ignore = function () {};

/**
 * Track a new run.
 */
var newRun;

/**
 * Start a run, based on arguments passed to a plans method.
 */
function startRun(run, plan) {
  // Retain decorations that function.apply would lose.
  run = newRun || run;
  newRun = undefined;
  run.state = PENDING;
  run.plan = plan = plan || 0;
  run.base = plan.base || basePlan || 0;
  return run;
}

/**
 * End a run with an error or result.
 */
function endRun(run, error, result) {
  var plan = run.plan;
  var base = run.base;
  var fn;

  // Don't end twice.
  if (run.state > PENDING) {
    return;
  }
  clearTimeout(run.timer);

  // Support errbacks as plans.
  if (typeof plan == 'function') {
    plan.done = plan;
  }

  if (error) {

    // Retry if we can.
    var tries = plan.tries || base.tries || 0;
    if (tries) {
      if (!(plan instanceof Retry)) {
        plan = new Retry(plan, tries);
        run[getArgCount(run.callee) - 1] = plan;
      }
      plan.tries--;
      var delay = run.retryDelay || plan.retryDelay || 0;
      setTimeout(function () {
        Thenable.current = run;
        run.fn.apply(plans, run.run);
      }, delay);
      run.retryDelay = delay * (plan.retryBackoff || 1);
      return;
    }

    // Handle an error.
    run.state = REJECTED;
    var key = 'catch' + error.name;
    fn = plan[key] || plan.fail || plan.error || base[key] || base.fail || base.error;
    if (typeof fn == 'function') {
      fn.call(plan, error, error.input);
    }
    else if (fn && (typeof fn.error == 'function')) {
      fn.error(error);
    }
    else if (fn) {
      throw error;
    }

    // Handle multiple errors.
    fn = plan.fails || plan.errors || base.fails || base.errors;
    if (typeof fn == 'function') {
      var errors = [error];
      var errorN = error.next;
      while (errorN && (errors.length < 100)) {
        errors.push(errorN);
        errorN = errorN.next;
      }
      fn.call(plan, errors);
    }

  }

  // If there was no error, handle success.
  else {
    run.state = RESOLVED;
    fn = plan.ok || plan.info || base.ok || base.info;
    if (typeof fn == 'function') {
      fn.call(plan, result);
    }
  }

  // Handle completion (whether successful or not) with an errback.
  fn = plan.done || base.done;
  if (typeof fn == 'function') {
    fn.call(plan, error, result);
  }

  // Save the error or result, and spawn child runs.
  run.value = error || result;
  var children = run.children;
  if (children) {
    for (var i = 0; i < children.length; i++) {
      spawnChild(children[i], run);
    }
    delete run.children;
  }
};

/**
 * Spawn a run as a child of another.
 */
function spawnChild(child, parent) {
  var fn = child.fn;
  newRun = child;

  // Apply the function as a plans method.
  if (fn) {
    fn.apply(plans, child);
  }

  // Or pass a value to a success or failure function.
  else {
    // 1: Resolved
    // 2: Rejected
    fn = child[parent.state - 1];
    plans.pass(parent.value, fn);
  }
}

/**
 * Retry by cloning a plan so we can decrement tries.
 */
function Retry(plan, tries) {
  for (var property in plan) {
    this[property] = plan[property];
  }
  this.tries = tries;
}

/**
 * A Thenable exposes methods to schedule a run after another run.
 */
var Thenable = plans.Thenable = function Thenable(parent) {
  this.parent = parent;

  // If we didn't end the run before returning a Thenable, we might time out.
  if ((parent.state == PENDING) && !parent.timer) {
    var plan = parent.plan;
    var base = parent.base;
    var timeout = plan.timeout || base.timeout;
    if (timeout) {
      parent.timer = setTimeout(function () {
        var error = new Error('Thenable timed out after ' + timeout + 'ms.');
        error.name = 'TimeoutError';
        endRun(parent, plan, error);
      }, timeout);
    }
  }
};

var proto = Thenable.prototype = {

  /**
   * Add a run to be processed after the parent.
   */
  add: function (run, fn) {
    var self = this;
    var parent = self.parent;
    run.fn = fn;
    // If the parent is no longer pending, spawn.
    if (parent.state) {
      spawnChild(run, parent);
    }
    // Otherwise, queue.
    else {
      (parent.children = parent.children || []).push(run);
    }
    return new Thenable(run);
  },

  then: function () { return this.add(arguments); },
  all: function () { return this.add(arguments, plans.all); },
  each: function () { return this.add(arguments, plans.each); },
  flow: function () { return this.add(arguments, plans.flow); }

};

/**
 * Execute functions in parallel, then execute the plan.
 */
plans.all = function (fns, plan) {
  var args = arguments;
  var run = startRun(args, plan);
  var many = typeof fns != 'function';
  var wait = many ? fns.length : 1;
  if (wait) {
    var e0, eN, values;
    if (many) {
      values = new Array(wait);
      fns.forEach(go, done);
    }
    else {
      go.call(done, fns);
    }
    function done(value, key) {
      if (value instanceof Error) {
        eN = (e0 ? (eN.next = value) : (e0 = value));
      }
      if (key != undefined) {
        values[key] = value;
      }
      else if (!e0) {
        values = value;
      }
      if (!--wait) {
        endRun(run, e0, values);
      }
    }
  }
  else {
    endRun(run);
  }
  return new Thenable(run);
};

/**
 * Execute functions in series, then execute the plan.
 */
plans.each = function (fns, plan) {
  var args = arguments;
  var run = startRun(args, plan);
  var many = typeof fns != 'function';
  var size = many ? fns.length : 1;
  var i = 0;
  var e0, eN, values;
  if (many) {
    if (size) {
      values = new Array(size);
      go.call(next, fns[i], i);
    }
    else {
      endRun(run);
    }
  }
  else {
    go.call(next, fns);
  }
  function next(value) {
    if (value instanceof Error) {
      eN = (e0 ? (eN.next = value) : (e0 = value));
    }
    if (many) {
      values[i] = value;
    }
    else if (!e0) {
      values = value;
    }
    if (++i < size) {
      go.call(next, fns[i], i);
    }
    else {
      endRun(run, e0, values);
    }
  }
  return new Thenable(run);
};

/**
 * Flow data through an array of functions.
 */
plans.flow = function (input, fns, plan) {
  var args = arguments;
  var run = startRun(args, plan);
  var many = typeof fns != 'function';
  var size = many ? fns.length : 1;
  var i = 0;
  var e0, eN;
  if (many) {
    if (size) {
      give.call(next, input, fns[i], i);
    }
    else {
      endRun(run, undefined, input);
    }
  }
  else {
    give.call(next, input, fns);
  }
  function next(value) {
    if (value instanceof Error) {
      eN = (e0 ? (eN.next = value) : (e0 = value));
      eN.input = input;
    }
    if (++i < size) {
      input = value
      give.call(next, input, fns[i], i);
    }
    else {
      endRun(run, e0, value);
    }
  }
  return new Thenable(run);
};

/**
 * Go run a function, then report output by key.
 */
function go(fn, key) {
  var then = this;
  var value;
  try {
    if (getArgCount(fn) > 0) {
      value = fn(function (e, value) {
        then(e || value, key);
        then = ignore;
      });
      if (value !== undefined) {
        then(value, key);
        then = ignore;
      }
    }
    else {
      value = fn();
      then(value, key);
      then = ignore;
    }
  }
  catch (e) {
    then(e, key);
    then = ignore;
  }
}

/**
 * Give a function some input, then report output by key.
 */
function give(input, fn, key) {
  var then = this;
  var value;
  try {
    if (getArgCount(fn) > 1) {
      value = fn(input, function (e, value) {
        then(e || value, key);
        then = ignore;
      });
      if (value !== undefined) {
        then(value, key);
        then = ignore;
      }
    }
    else {
      value = fn(input);
      then(value, key);
      then = ignore;
    }
  }
  catch (e) {
    then(e, key);
    then = ignore;
  }
}

/**
 * Get the number of arguments that a function takes.
 */
function getArgCount(fn) {
  var count = isNaN(fn._PLANS_LENGTH) ? fn.length : fn._PLANS_LENGTH;
  return count;
}

// Trick plans.flow into thinking fs.readFile takes (path, callback) arguments.
fs.readFile._PLANS_LENGTH = 2;
JSON.parse._PLANS_LENGTH = 1;

// Create alias for plans and Thenable methods.
var aliases = {
  run: 'each',
  parallel: 'all',
  series: 'each',
  pass: 'flow'
};

var proto = Thenable.prototype;

for (var alias in aliases) {
  proto[alias] = proto[aliases[alias]];
  plans[alias] = plans[aliases[alias]];
}
