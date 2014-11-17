var fs = require('fs');
var http = require('http');
var Type = require(__dirname + '/common/object/type');

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

var startingRun;

function Retry(plan) {
  for (var property in plan) {
    this[property] = plan[property];
  }
}

/**
 * A Run is empty until started or chained onto.
 */
var Run = plans.Run = function Run(fn, args, plan) {
  if (fn) {
    var self = this;
    startingRun = null;

    // Remember the function and arguments in case of retry.
    self.fn = fn;
    self.args = args;

    // If it's an errback, use it in the end.
    if (typeof plan == 'function') {
      plan.done = plan;
    }
    // If it's nothing, make it keyable.
    else if (!plan) {
      plan = basePlan;
    }
    self.plan = plan;

    // Allow a Run to time out after a specified number of milliseconds.
    if (plan.timeout) {
      self.timer = setTimeout(function () {
        var error = new Error('Run timed out after ' + plan.timeout + 'ms.');
        error.name = 'TimeoutError';
        self.end(error);
      }, plan.timeout);
    }
  }
};

Run.prototype = {

  /**
   * End a Run with an error or result.
   */
  end: function (error, result) {
    var self = this;
    var plan = self.plan || 0;
    var base = plan.base || basePlan || 0;
    var fn;

    // Ensure that we only end once.
    if (self.ended) {
      return;
    }
    clearTimeout(self.timer);

    if (error) {

      // Retry if we can.
      var tries = plan.tries || base.tries || 0;
      if (tries) {
        if (!(plan instanceof Retry)) {
          plan = new Retry(plan);
          self.args[getArgCount(self.fn) - 1] = plan;
        }
        plan.tries--;
        var delay = self.retryDelay || plan.retryDelay || 0;
        setTimeout(function () {
          Run.current = self;
          self.fn.apply(plans, self.args);
        }, delay);
        self.retryDelay = delay * (plan.retryBackoff || 1);
        return;
      }

      // Handle an error.
      fn = plan['catch' + error.name] || plan.fail || plan.error;
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
      fn = plan.fails || plan.errors;
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
      fn = plan.ok || plan.info;
      if (typeof fn == 'function') {
        fn.call(plan, result);
      }
    }

    // Handle completion (whether successful or not) with an errback.
    fn = plan.done;
    if (typeof fn == 'function') {
      fn.call(plan, error, result);
    }

    // Save the error or result, and spawn child runs.
    self.ended = true;
    self.error = error;
    self.result = result;
    if (self.children) {
      for (var i = 0, l = self.children.length; i < l; i++) {
        var args = self.children[i];
        self.spawn(args);
      }
      delete self.children;
    }
  },

  /**
   * Add a run to be processed after the parent.
   */
  add: function (fn, args) {
    var self = this;
    var child = new Run();
    child.fn = fn;
    child.args = args;
    if (self.ended) {
      self.spawn(child);
    }
    else {
      (self.children = self.children || []).push(child);
    }
    return child;
  },

  /**
   * Spawn a child Run.
   */
  spawn: function (child) {
    var self = this;
    var fn = child.fn;
    var args = child.args;
    Run.current = child;

    // If a function has been set, call it on plans.
    if (fn) {
      fn.apply(plans, args);
    }

    // Otherwise, pass a value to a success or failure function.
    else {
      fn = args[self.error ? 1 : 0];
      plans.pass(self.error || self.result, fn);
    }
  },

  then: function () { return this.add(null, arguments); },
  run: function () { return this.add(plans.run, arguments); },
  flow: function () { return this.add(plans.flow, arguments); },
  series: function () { return this.add(plans.series, arguments); },
  parallel: function () { return this.add(plans.parallel, arguments); }

};

/**
 * Execute a function, then a plan.
 */
plans.run = function (fn, plan) {
  var run = startingRun ?
    Run.call(startingRun, plans.run, arguments, plan) :
    new Run(plans.run, arguments, plan);
  var result;
  var argCount = getArgCount(fn);
  try {
    if (argCount == 1) {
      result = fn(function (e, result) {
        if (e instanceof Error) {
          run.end(e, result);
        }
        else {
          run.end(null, e || result);
        }
      });
      if (result !== undefined) {
        run.end(null, result);
      }
    }
    else {
      result = fn();
      run.end(null, result);
    }
  }
  catch (e) {
    run.end(e, result);
  }
  return run;
};

/**
 * Execute functions in series, then execute the plan.
 */
plans.series = function (fns, plan) {
  var run = startingRun ?
    Run.call(startingRun, plans.series, arguments, plan) :
    new Run(plans.series, arguments, plan);
  var fnIndex = 0;
  var e0, eN;
  var next = function () {
    var fn = fns[fnIndex];
    var argCount = getArgCount(fn);
    var then = (++fnIndex < fns.length ? next : done);
    var value;
    try {
      if (argCount > 0) {
        value = fn(function (e) {
          if (e instanceof Error) {
            eN = (e0 ? (eN.next = e) : (e0 = e));
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
      eN = (e0 ? (eN.next = e) : (e0 = e));
      then();
      then = ignore;
    }
  };
  var done = function () {
    run.end(e0, null);
  };
  if (fns.length) {
    next();
  }
  else {
    done();
  }
  return run;
};

/**
 * Execute functions in parallel, then execute the plan.
 */
plans.parallel = function (fns, plan) {
  var run = startingRun ?
    Run.call(startingRun, plans.parallel, arguments, plan) :
    new Run(plans.parallel, arguments, plan);
  var wait = fns.length;
  if (wait) {
    var e0, eN;
    var done = function () {
      if (!--wait) {
        run.end(e0);
      }
    };
    var one = function (fn) {
      var then = done;
      var value;
      try {
        if (getArgCount(fn) > 0) {
          value = fn(function (e, value) {
            if (e instanceof Error) {
              eN = (e0 ? (eN.next = e) : (e0 = e));
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
        eN = (e0 ? (eN.next = e) : (e0 = e));
        then();
        then = ignore;
      }
    }
    fns.forEach(one);
  }
  else {
    run.end(null, null);
  }
  return run;
};

/**
 * Pass data to a function, then execute the plan.
 */
plans.pass = function (data, fn, plan) {
  var run = startingRun ?
    Run.call(startingRun, plans.pass, arguments, plan) :
    new Run(plans.pass, arguments, plan);
  var result;
  var argCount = getArgCount(fn);
  var done = Run.end;
  try {
    if (argCount > 1) {
      result = fn(data, function (e, result) {
        if (e instanceof Error) {
          run.end(e, result);
        }
        else {
          run.end(null, e || result);
        }
      });
      if (result !== undefined) {
        run.end(null, result);
      }
    }
    else {
      result = fn(data);
      run.end(null, result);
    }
  }
  catch (e) {
    run.end(e, result);
  }
  return run;
};

/**
 * Flow data through an array of functions.
 */
plans.flow = function (data, fns, plan) {
  var run = startingRun ?
    Run.call(startingRun, plans.flow, arguments, plan) :
    new Run(plans.flow, arguments, plan);
  var fnIndex = 0;
  var e0, eN;
  var next = function () {
    var fn = fns[fnIndex];
    var argCount = getArgCount(fn);
    var then = (++fnIndex < fns.length ? next : done);
    try {
      if (argCount > 1) {
        data = fn(data, function (e, result) {
          if (e) {
            e.input = data;
            eN = (e0 ? (eN.next = e) : (e0 = e));
            then();
            then = ignore;
          }
          else {
            data = result;
            then();
            then = ignore;
          }
        });
        if (data !== undefined) {
          then();
          then = ignore;
        }
      }
      else {
        data = fn(data);
        then();
        then = ignore;
      }
    }
    catch (e) {
      e.input = data;
      eN = (e0 ? (eN.next = e) : (e0 = e));
      then();
      then = ignore;
    }
  };
  var done = function () {
    run.end(e0, data);
  };
  if (fns.length) {
    next();
  }
  else {
    done();
  }
  return run;
};

/**
 * Get the number of arguments that a function takes.
 */
function getArgCount(fn) {
  var count = isNaN(fn._PLANS_ARG_COUNT) ? fn.length : fn._PLANS_ARG_COUNT;
  return count;
}

// Trick plans.flow into thinking fs.readFile takes (path, callback) arguments.
fs.readFile._PLANS_ARG_COUNT = 2;
JSON.parse._PLANS_ARG_COUNT = 1;