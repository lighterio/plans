var fs = require('fs');
var http = require('http');

// Run state constants.
var INPUT = -1;
var WAITING = 0;
var SUCCEEDED = 1;
var FAILED = 2;

// Zero is falsy, but doesn't throw upon checking properties.
var NOTHING = 0;

// Multi inputs trigger a run on each item.
var MAP = 1;
var LIST = 2;

/**
 * Create a Chain on which plans methods can be called.
 */
var plans = module.exports = function (data) {
  return new Chain({
    state: INPUT,
    value: data
  });
};

/**
 * Alias the plans function with a slightly more descriptive name.
 */
plans.use = plans;

/**
 * Create a Chain for operating on a collection's items in parallel.
 */
plans.map = function (collection) {
  return new Chain({
    state: INPUT,
    value: collection,
    multi: startMap
  });
};

/**
 * Create a Chain for iterating over a collection's items in series.
 */
plans.list = function (collection) {
  return new Chain({
    state: INPUT,
    value: collection,
    multi: startList
  });
};

/**
 * Create a Chain for applying arguments.
 */
plans.args = function (that, array) {
  if (arguments.length < 2) {
    array = that;
    that = plans;
  }
  return new Chain({
    state: INPUT,
    value: array,
    that: that
  });
};

// Expose the version number, but only load package JSON on get.
Object.defineProperty(plans, 'version', {
  enumerable: false,
  get: function () {
    return require('./package.json').version;
  }
});

/**
 * Expose a simple plan for fallback.
 */
var basePlan = {
  fail: function (error) {
    console.error(error.stack || error);
  }
};

// Set the basePlan to the specified value or NOTHING so we can access properties.
Object.defineProperty(plans, 'base', {
  enumerable: true,
  get: function () {
    return basePlan;
  },
  set: function (base) {
    basePlan = base || NOTHING;
  }
});

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
 * No-op function used for replacing callbacks.
 */
var ignore = plans.ignore = function () {};

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
 * Track child runs, for the purpose of retaining argument decorations.
 */
var currentRun = NOTHING;

/**
 * Start a run, based on arguments passed to a plans method.
 */
function startRun(run, plan) {
  // Use currentRun to retain properties that function.apply loses.
  run = currentRun || run;
  currentRun = NOTHING;
  run.state = WAITING;
  run.plan = plan = plan || NOTHING;
  run.base = plan.base || basePlan;
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
  if (run.state > WAITING) {
    return;
  }
  clearTimeout(run.timer);

  if (error) {

    // Retry if we can.
    var retries = plan.retries || base.retries || 0;
    if (retries) {
      if (!(plan instanceof Retry)) {
        if (typeof plan == 'function') {
          plan = {done: plan};
        }
        plan = new Retry(plan, retries);
        run[getArgCount(run.callee) - 1] = plan;
      }
      plan.retries = retries - 1;
      var delay = plan.delay || base.delay || 0;
      setTimeout(function () {
        currentRun = run;
        run.callee.apply(plans, run);
      }, delay);
      plan.delay = delay * (plan.backoff || base.backoff  || 1);
      return;
    }

    // Handle an error.
    run.state = FAILED;
    var key = error.name || 'fail';
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
    run.state = SUCCEEDED;
    fn = plan.ok || plan.info || base.ok || base.info;
    if (typeof fn == 'function') {
      fn.call(plan, result);
    }
  }

  // Handle completion (whether successful or not) with an errback.
  fn = (typeof plan == 'function' ? plan : (plan.done ||
    (typeof base == 'function' ? base : base.done)));
  if (typeof fn == 'function') {
    fn.call(plan, error, result);
  }

  // Save the error or result, and start child runs.
  run.value = error || result;
  var children = run.children;
  if (children) {
    for (var i = 0; i < children.length; i++) {
      runChild(children[i], run);
    }
    delete run.children;
  }
}

/**
 * Run a child of a parent that just ended.
 */
function runChild(child, parent) {
  var fn = child.fn;
  var when = child.fn;
  child.input = parent.value;
  child.multi = parent.multi;
  child.that = parent.that;
  currentRun = child;

  // Add child arguments to a plans method, with `this` as the parent value.
  if (fn) {
    fn.apply(plans, child);
  }

  // Or pass a value to a success or failure function.
  else {
    // State is 1 if resolved, or 2 if rejected.
    fn = child[parent.state - 1];
    plans.flow.call(plans, fn);
  }
}

/**
 * Start a map run by starting many runs in parallel.
 */
function startMap(run, plan) {
  var input = run.input;
  var fn = run.fn;
  var fns = run[0];
  var wait, values;
  var e0, eN;
  run.plan = plan;
  run.base = plan.base || basePlan;
  if (input instanceof Array) {
    wait = input.length;
    values = new Array(wait);
    for (var i = 0, l = wait; i < l; i++) {
      send(input[i], i);
    }
  }
  else {
    wait = 1;
    values = {};
    for (var p in input) {
      if (input.hasOwnProperty(p)) {
        values[p] = 0; // Preserve key order.
        wait++;
        send(input[p], p);
      }
    }
    if (!--wait) {
      endRun(run, e0, values);
    }
  }
  function send(input, key) {
    function done(e, result) {
      if (e) {
        eN = (e0 ? (eN.next = e) : (e0 = e));
        e.input = input;
      }
      values[key] = e || result;
      if (!--wait) {
        endRun(run, e0, values);
      }
    }
    currentRun = {
      0: fns,
      1: done,
      length: 2,
      input: input,
      chainless: true
    };
    fn.apply(plans, currentRun);
  }
  return new Chain(run);
}

/**
 * Start a list run by starting many runs in series.
 */
function startList(run, plan) {
  var input = run.input;
  var fn = run.fn;
  var fns = run[0];
  var wait, values, keys, map;
  var e0, eN;
  run.plan = plan;
  run.base = plan.base || basePlan;
  if (!(input instanceof Array)) {
    map = input;
    input = [];
    keys = [];
    for (var p in map) {
      if (map.hasOwnProperty(p)) {
        keys.push(p);
        input.push(map[p]);
      }
    }
  }
  var i = 0;
  var l = input.length;
  values = new Array(l);
  next();
  function next() {
    function done(e, result) {
      if (e) {
        eN = (e0 ? (eN.next = e) : (e0 = e));
        e.input = input;
      }
      values[i] = e || result;
      if (++i < l) {
        next();
      }
      else {
        if (map) {
          map = {};
          for (i = 0; i < l; i++) {
            map[keys[i]] = values[i];
          }
          values = map;
        }
        endRun(run, e0, values);
      }
    }
    currentRun = {
      0: fns,
      1: done,
      length: 2,
      input: input[i],
      chainless: true
    };
    fn.apply(plans, currentRun);
  }
  return new Chain(run);
}

/**
 * Retry by cloning a plan so we can decrement retries.
 */
function Retry(plan, retries) {
  for (var property in plan) {
    this[property] = plan[property];
  }
  plan.retries = retries;
}

/**
 * A Chain exposes methods to schedule a run after another run.
 */
var Chain = plans.Chain = function Chain(parent) {
  this.parent = parent;

  // If we didn't end the run before returning a Chain, we could time out.
  if ((parent.state == WAITING) && !parent.timer) {
    var plan = parent.plan;
    var base = parent.base;
    var timeout = plan.timeout || base.timeout;
    if (timeout) {
      parent.timer = setTimeout(function () {
        var error = new Error('Chain timed out after ' + timeout + 'ms.');
        error.name = 'TimeoutError';
        endRun(parent, plan, error);
      }, timeout);
    }
  }
};

var proto = Chain.prototype = {

  /**
   * Add a run to be processed after the parent.
   */
  _add: function (run, fn, when) {
    var parent = this.parent;
    var state = parent.state;
    run.fn = fn;
    run.when = when;
    // When the parent is at a matching state, run the child.
    if (state) {
      if ((when || state) == state) {
        runChild(run, parent);
      }
    }
    // Otherwise, queue.
    else {
      (parent.children = parent.children || []).push(run);
    }
    return new Chain(run);
  },

  then: function then() { return this._add(arguments); },
  all: function all() { return this._add(arguments, plans.all); },
  each: function each() { return this._add(arguments, plans.each); },
  flow: function flow() { return this._add(arguments, plans.flow); },
  filter: function filter() { return this._add(arguments, plans.filter); },
  fail: function fail() { return this._add(arguments, plans.each, FAILED); },
  andAll: function andAll() { return this._add(arguments, plans.all, SUCCEEDED); },
  andEach: function andEach() { return this._add(arguments, plans.each, SUCCEEDED); },
  andFlow: function andFlow() { return this._add(arguments, plans.flow, SUCCEEDED); },
  andFilter: function andFilter() { return this._add(arguments, plans.filter, SUCCEEDED); },
  orAll: function orAll() { return this._add(arguments, plans.all, FAILED); },
  orEach: function orEach() { return this._add(arguments, plans.each, FAILED); },
  orFlow: function orFlow() { return this._add(arguments, plans.flow, FAILED); },
  orFilter: function orFilter() { return this._add(arguments, plans.filter, FAILED); },

  /**
   * Treat the input as simple data.
   */
  use: function () {
    delete this.parent.multi;
    delete this.parent.that;
    return this;
  },

  /**
   * Treat the input as a map.
   */
  map: function (collection) {
    return plans.map(collection || this.parent.value);
  },

  /**
   * Treat the input as a list.
   */
  list: function (collection) {
    return plans.list(collection || this.parent.value);
  },

  /**
   * Treat the input as arguments.
   */
  args: function (that, array) {
    var parent = this.parent;
    var args = that ? arguments : [parent.that || plans, parent.value];
    return plans.args.apply(plans, args);
  },

  /**
   * Reduce the input to a single property of the input.
   */
  get: function (property) {
    return plans(this.parent.input[property]);
  }

};

var chain = Chain.prototype;
chain.run = chain.all;
chain.andRun = chain.andAll;
chain.orRun = chain.orAll;

/**
 * Run all functions in parallel, according to plan.
 */
plans.run = // Alias to "run" for running a single function.
plans.all = function all(fns, plan) {

  // If the current run is a map or list, let it multiply calls to plans.flow.
  var multi = currentRun.multi;
  if (multi) {
    return multi(currentRun, plan);
  }

  var args = arguments;
  var run = startRun(args, plan);
  var input = run.input;
  var many = fns instanceof Array;
  var wait = many ? fns.length : 1;
  var f = input && (input.that = run.that) ? apply : call;
  if (wait) {
    var e0, eN, values;
    if (many) {
      values = new Array(wait);
      for (var i = 0, l = fns.length; i < l; i++) {
        f.call(done, input, fns[i], i);
      }
    }
    else {
      f.call(done, input, fns);
    }
  }
  else {
    endRun(run);
  }
  function done(value, key) {
    if (value instanceof Error) {
      eN = (e0 ? (eN.next = value) : (e0 = value));
    }
    if (key !== undefined) {
      values[key] = value;
    }
    else if (!e0) {
      values = value;
    }
    if (!--wait) {
      endRun(run, e0, values);
    }
  }
  return run.chainless || new Chain(run);
};

/**
 * Run each function in series, according to plan.
 */
plans.each = function each(fns, plan) {

  // If the current run is a map or list, let it multiply calls to plans.flow.
  var multi = currentRun.multi;
  if (multi) {
    return multi(currentRun, plan);
  }

  var args = arguments;
  var run = startRun(args, plan);
  var input = run.input;
  var many = fns instanceof Array;
  var l = many && fns ? fns.length : 1;
  var i = 0;
  var e0, eN, values;
  var f = input && (input.that = run.that) ? apply : call;
  if (many) {
    if (l) {
      values = new Array(l);
      f.call(next, input, fns[i], i);
    }
    else {
      endRun(run);
    }
  }
  else {
    f.call(next, input, fns);
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
    if (++i < l) {
      f.call(next, input, fns[i], i);
    }
    else {
      endRun(run, e0, values);
    }
  }
  return run.chainless || new Chain(run);
};

/**
 * Flow data through functions, according to plan.
 */
plans.flow = function flow(fns, plan) {

  // If the current run is a map or list, let it multiply calls to plans.flow.
  var multi = currentRun.multi;
  if (multi) {
    return multi(currentRun, plan);
  }

  var args = arguments;
  var run = startRun(args, plan);
  var input = run.input;
  var many = fns instanceof Array;
  var l = many ? fns.length : 1;
  var i = 0;
  var e0, eN;
  var f = input && (input.that = run.that) ? apply : call;
  if (many) {
    if (l) {
      f.call(next, input, fns[i], i);
    }
    else {
      endRun(run, e0, input);
    }
  }
  else {
    f.call(next, input, fns);
  }
  function next(value) {
    if (value instanceof Error) {
      eN = (e0 ? (eN.next = value) : (e0 = value));
      eN.input = input;
    }
    if (++i < l) {
      input = value;
      f.call(next, input, fns[i], i);
    }
    else {
      endRun(run, e0, value);
    }
  }
  return run.chainless || new Chain(run);
};

/**
 * Filter out inputs which generate falsy values or errors, according to plan.
 */
plans.filter = function filter(fns, plan) {
  var run = startRun(arguments, plan);
  var input = run.input;
  run.fn = plans.all;
  run.multi = startMap;
  run.state = WAITING;
  currentRun = run;
  return plans.all(fns, function (e, result) {
    var values, item;
    if (input instanceof Array) {
      values = [];
      for (var i = 0, l = input.length; i < l; i++) {
        if (result[i]) {
          values.push(input[i]);
        }
      }
      run.state = WAITING;
      run.plan = plan;
      endRun(run, e, values);
    }
  });
};

/**
 * Run a function, then report output by key.
 */
function call(input, fn, key) {
  var then = this;
  var value;
  try {
    if (getArgCount(fn) > 1 && input !== undefined) {
      value = fn(input, function (e, value) {
        then(e || value, key);
        then = ignore;
      });
      if (value !== undefined) {
        then(value, key);
        then = ignore;
      }
    }
    else if (input === undefined) {
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
 * Apply arguments to a function, then report output by key.
 */
function apply(input, fn, key) {
  var then = this;
  var that = input.that;
  var count = getArgCount(fn);
  var args = {};
  var value;
  for (var i = 0, l = input.length; i < l; i++) {
    args[i] = input[i];
  }
  if (l < count) {
    args[count - 1] = function (e, value) {
      then(e || value, key);
      then = ignore;
    };
    args.length = count;
  }
  else {
    args.length = l;
  }
  try {
    value = fn.apply(that, args);
    if (value !== undefined) {
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

// Treat several functions as having a different number of arguments.
fs.readFile._PLANS_LENGTH = 2;
JSON.stringify._PLANS_LENGTH = 1;
JSON.parse._PLANS_LENGTH = 1;
