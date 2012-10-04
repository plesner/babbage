(function (namespace) {
  
if (namespace.promise)
  return;

var promise = {};
namespace.promise = promise;

/**
 * Standard prototype inheritance.
 */
function inherit(Sub, Base) {
  function Inheriter() { }
  Inheriter.prototype = Base.prototype;
  Sub.prototype = new Inheriter();
}

function Promise(parentOpt) {
  this.state_ = Promise.State.UNRESOLVED;
  this.data_ = undefined;
  this.listeners_ = [];
  this.traceSegment_ = (promise.trace && promise.trace.captureTraces)
      ? new promise.trace.PromiseTraceSegment()
      : null;
};

promise.Promise = Promise;

Promise.State = {
  UNRESOLVED: 'unresolved',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed'
};

/**
 * Returns a pre-fulfilled promise with the given value.
 */
Promise.of = function (value) {
  var result = new Promise();
  result.fulfill(value);
  return result;
};

/**
 * Returns a pre-failed promise with the given error.
 */
Promise.error = function (error) {
  var result = new Promise();
  result.fail(error);
  return result;
};

/**
 * Returns a promise that resolves as soon as one of the given argument
 * promises resolves.
 */
Promise.select = function (arrayOrVarArgs) {
  var others = Array.isArray(arrayOrVarArgs) ? arrayOrVarArgs : arguments;
  var result = new Promise();
  for (var i = 0; i < others.length; i++) {
    others[i].forwardTo(result);
  }
  return result;
};

/**
 * Returns a promise that is fulfilles as soon as all the given promises are
 * fulfilled with a value that is the list of the values of the promises in
 * the same order as they appear in the input list. If any input promise fails
 * the first failure is propagated through the result.
 */
Promise.join = function (arrayOrVarArgs) {
  var others = Array.isArray(arrayOrVarArgs) ? arrayOrVarArgs : arguments;
  var result = new Promise();
  var remaining = others.length;
  var values = [];
  values.length = remaining;
  function propagateFulfilled(index) {
    return function (value) {
      values[index] = value;
      remaining--;
      if (remaining == 0)
        result.fulfill(values);
    };
  }
  for (var i = 0; i < others.length; i++) {
    others[i].onResolved({
      onFulfilled: propagateFulfilled(i),
      onFailed: result.fail.bind(result)
    })
  }
  return result;
};

/**
 * Error that signals that a timeout was triggered.
 */
function TimeoutError(message) {
  this.message_ = message;
  if (Error.captureStackTrace)
    Error.captureStackTrace(this, TimeoutError);
}

inherit(TimeoutError, Error);

TimeoutError.prototype.toString = function () {
  return this.message_;
};

/**
 * Returns a new promise with the same value as 'other' but which will fail
 * if 'other' hasn't been fulfilled within the given timeout.
 */
Promise.withTimeout = function (other, timeout) {
  var trigger = new Promise();
  defer(function () {
    trigger.fail(new TimeoutError("Operation timed out"));
  }, timeout);
  return Promise.select(other, trigger);
};

/**
 * Returns a new promise that will resolve to the time it took from now
 * until the given promise was resolved, successfully or otherwise.
 */
Promise.time = function (other) {
  var result = new Promise();
  var start = Date.now();
  function handleResolved() {
    result.fulfill(Date.now() - start);
  }
  other.onResolved({
    onFulfilled: handleResolved,
    onFailed: handleResolved
  });
  return result;
};

/**
 * Given a time interval and a function that returns a promise, will return
 * a promise that repeatedly fetches promises from the function as long as
 * they keep failing and will succeed the first time a promise succeeds. If
 * the promise becomes resolved (for instance by someone explicitly failing
 * it) we'll stop trying.
 */
Promise.keepTrying = function (thunk, interval, onErrorOpt) {
  var result = new Promise();
  function tryAgain() {
    if (result.isResolved())
      return;
    var nextTry = thunk();
    nextTry.onFulfilled(function (value) {
      result.fulfill(value);
    }).onFailed(function (error, trace) {
      if (onErrorOpt)
        onErrorOpt(error, trace);
      window.setTimeout(tryAgain, interval);
    });
  }
  tryAgain();
  return result;
};

/**
 * Returns a promise that will resolve the same way as the result of calling
 * the given function, which will be called in a future turn.
 */
Promise.deferLazy = function (thunk) {
  var result = new Promise();
  defer(function () {
    var child;
    try {
      child = thunk();
    } catch (e) {
      result.fail(e);
      return;
    }
    child.forwardTo(result);
  });
  return result;
};

/**
 * Returns a promise that resolves to the result of calling the given function
 * in a future turn.
 */
Promise.defer = function (thunk, timeoutOpt) {
  var result = new Promise();
  defer(function () {
    try {
      result.fulfill(thunk());
    } catch (e) {
      result.fail(e);
      return;
    }
  }, timeoutOpt);
  return result;
};

/**
 * Returns a promise that resolves to the given value in a future turn.
 */
Promise.deferValue = function (value, timeoutOpt) {
  var result = new Promise();
  defer(function () {
    try {
      result.fulfill(value);
    } catch (e) {
      result.fail(e);
      return;
    }
  }, timeoutOpt);
  return result;
};

/**
 * Returns a promise that is fulfilled with the given value after the given
 * timeout.
 */
Promise.fulfillAfter = function (value, timeout) {
  var result = new Promise();
  defer(result.fulfill.bind(result, value), timeout);
  return result;
};

/**
 * Returns a promise that fails with the given error after the given
 * timeout.
 */
Promise.failAfter = function (error, timeout) {
  var result = new Promise();
  defer(result.fail.bind(result, error), timeout);
  return result;
};

/**
 * Calls the first argument with the remaining arguments and, as the last
 * argument, a callback that fulfills the promise that is returned from
 * this call. For instance, to convert this method call into a promise:
 *
 *   foo.bar(a, b, callback);
 *
 * you would do
 *
 *   Promise.fromCallbackMethod(foo, "bar", a, b);
 */
Promise.fromCallbackMethod = function (holder, methodName, varArgs) {
  var args = Array.prototype.slice.call(arguments, 2);
  var result = new Promise();
  args.push(result.fulfill.bind(result));
  try {
    holder[methodName].apply(holder, args);
  } catch (e) {
    result.fail(e);
  }
  return result;
}

/**
 * Returns the value of this promise if it has been fulfilled, if it has
 * failed the error will be thrown and if it is still unresolved null will
 * be returned.
 */
Promise.prototype.get = function () {
  if (this.isResolved()) {
    if (this.isFailed()) {
      throw this.data_;
    } else {
      return this.data_;
    }
  } else {
    return null;
  }
}

/**
 * Returns a new promise that represents the result of calling the given
 * function with result of this promise as an argument. If the function
 * call throws an exception the promise will fail with the given exception
 * object as its value.
 */
Promise.prototype.then = function (fun) {
  var result = new Promise();
  function propagateValue(value) {
    var newValue;
    try {
      newValue = fun(value);
    } catch (e) {
      result.fail(e);
      return;
    }
    result.fulfill(newValue);
  }
  this.onResolved({
    onFulfilled: propagateValue,
    onFailed: result.fail.bind(result)
  });
  return result;
};

/**
 * Works the same as .then except that the given function returns a promise
 * which, when resolved, becomes the value of the returned promise.
 */
Promise.prototype.lazyThen = function (fun) {
  var result = new Promise();
  this.then(function (value) {
    var next;
    try {
      next = fun(value)
    } catch (e) {
      result.fail(e);
      return;
    }
    next.forwardTo(result);
  }).forwardFailureTo(result);
  return result;
};

/**
 * Returns a new promise that represents the result of applying the given
 * function to the list of results of this promise. If the function call
 * throws an exception the promise will fail with the given exception object
 * as its value.
 */
Promise.prototype.thenApply = function (fun) {
  return this.then(function (values) {
    return fun.apply(fun, values);
  });
};

/**
 * Adds handles such that when this promise is resolved the given argument
 * will be resolved in the same way.
 */
Promise.prototype.forwardTo = function (other) {
  this.onResolved({
    onFulfilled: other.fulfill.bind(other),
    onFailed: other.fail.bind(other)
  });
};

/**
 * Adds handles such that if this promise fails resolved the given argument
 * will fail in the same way.
 */
Promise.prototype.forwardFailureTo = function (other) {
  this.onFailed(other.fail.bind(other));
};

/**
 * Adds handles such that if this promise succeeds the given argument
 * will succeed in the same way.
 */
Promise.prototype.forwardFulfilledTo = function (other) {
  this.onFulfilled(other.fulfill.bind(other));
};

/**
 * Has this promise been resolved?
 */
Promise.prototype.isResolved = function () {
  return this.state_ != Promise.State.UNRESOLVED;
};

/**
 * Has this promise been resolved with a failure?
 */
Promise.prototype.hasFailed = function () {
  return this.state_ == Promise.State.FAILED;
};

Promise.prototype.fail = function (error, parentTraceOpt) {
  if (this.isResolved())
    return;
  this.state_ = Promise.State.FAILED;
  this.data_ = error;
  this.fireAndClearListeners_(parentTraceOpt);
};

/**
 * Sets the successful value of this promise, causing any handlers to be
 * scheduled to be invoked.
 */
Promise.prototype.fulfill = function (value) {
  if (this.isResolved())
    return;
  this.state_ = Promise.State.SUCCEEDED;
  this.data_ = value;
  this.fireAndClearListeners_();
};

/**
 * Adds a handler object to the set to be notified when this promise is
 * resolved. Returns this promise.
 */
Promise.prototype.onResolved = function (listener) {
  if (this.isResolved()) {
    this.scheduleFireListener_(listener);
  } else {
    this.listeners_.push(listener);
  }
  return this;
};

/**
 * Adds the given thunk to the list to be notified if this promise is
 * resolved successfully. Returns this promise.
 */
Promise.prototype.onFulfilled = function (thunk) {
  return this.onResolved({onFulfilled: thunk});
};

/**
 * Adds the given thunk to the list to be notified if this promise
 * fails. Returns the promise.
 */
Promise.prototype.onFailed = function (thunk) {
  return this.onResolved({onFailed: thunk});
};

Promise.prototype.fireAndClearListeners_ = function (parentTraceOpt) {
  var listeners = this.listeners_;
  this.listeners_ = null;
  for (var i = 0; i < listeners.length; i++) {
    this.scheduleFireListener_(listeners[i], parentTraceOpt);
  }
};

function defer(thunk, timeoutOpt) {
  window.setTimeout(thunk, timeoutOpt ? timeoutOpt : 0);
}

Promise.prototype.scheduleFireListener_ = function (listener, parentTraceOpt) {
  if (this.hasFailed()) {
    var handler = listener.onFailed;
    if (handler) {
      var ownTrace = new promise.trace.PromiseTrace(this.data_,
          this.traceSegment_, parentTraceOpt);
      defer(handler.bind(handler, this.data_, ownTrace));
    }
  } else {
    var handler = listener.onFulfilled;
    if (handler) {
      defer(handler.bind(handler, this.data_));
    }
  }
};

Promise.prototype.getTrace = function () {
  return this.trace_;
};

})(this);
