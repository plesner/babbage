(function (namespace) {
  
if (!namespace.promise || namespace.promise.trace)
  return;

var trace = {
  // All the internal stuff is put here to the tests can access it.
  internal: {}
};

namespace.promise.trace = trace;

trace.captureTraces = true;

/**
 * Abstract supertype of promise traces.
 */
function PromiseTrace(error, segment, parent) {
  this.segment_ = segment;
  this.parent_ = parent;
  this.error_ = error;
}

/**
 * Does the VM support the V8 stack trace api?
 */
var HAS_V8_API = !!Error.captureStackTrace;

/**
 * Do stack traces display error messages on the first line?
 */
PromiseTrace.STACK_TRACE_INCLUDES_MESSAGE = HAS_V8_API;

/**
 * Appends the given string to the given list of strings, taking care to indent
 * the string to the same level as the rest of the strings.
 */
trace.internal.appendIndented = appendIndented;
function appendIndented(lines, message) {
  var indent = "";
  if (lines.length > 0) {
    // We just use the same indent as the last line.
    var line = lines[lines.length - 1];
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (/\s/.test(c))
        indent += c;
      else
        break;
    }
  }
  lines.push(indent + message);
  return lines;
};

/**
 * Returns a set of lines that matches 'current' except that if there the
 * is a matching sequence of elements at the end of 'upper' and 'current' all
 * but the first will be replaced in the result with a single occurrence of
 * the replacement string. The one equal element that is left is to mark where
 * the traces start being equal.
 */
trace.internal.replaceCommonTrailingElements = replaceCommonTrailingElements;
function replaceCommonTrailingElements(upper, current, replacement) {
  var minLength = Math.min(upper.length, current.length);
  // No elements = nothing to do.
  if (minLength == 0)
    return current;
  for (var i = 1; i <= minLength; i++) {
    var lastCurrent = current[current.length - i];
    var lastUpper = upper[upper.length - i];
    if (lastCurrent != lastUpper) {
      if (i == 1) {
        return current;
      } else {
        var result = current.slice(0, current.length - i + 2);
        return appendIndented(result, replacement);
      }
    }
  }
  var result = current.slice(0, current.length - minLength + 1);
  return appendIndented(result, replacement);
};

/**
 * Strips empty leading and trailing strings from a list of strings.
 */
trace.internal.stripEmptyLines = stripEmptyLines;
function stripEmptyLines(lines) {
  if (lines.length == 0)
    return lines;
  var startOffset = 0;
  var endOffset = lines.length - 1;
  while (startOffset < endOffset && lines[startOffset] == "")
    startOffset++;
  while (endOffset >= startOffset && lines[endOffset] == "")
    endOffset--;
  return lines.slice(startOffset, endOffset + 1);
}

/**
 * Trims a raw stack trace and returns it as a list of lines.
 */
function parseStackTraceLines(stack) {
  if (!stack) {
    return ["(... no stack trace available ...)"];
  } else {
    var currentLines = stack.split("\n");
    return stripEmptyLines(currentLines);
  }
}

/**
 * Adds this trace's segments to the given list in order of failure sequence,
 * that is, first failure at the head of the list and last failure at the end.
 */
PromiseTrace.prototype.addSegments = function (list) {
  if (this.parent_)
    this.parent_.addSegments(list);
  list.push(this);
  return list;
}

/**
 * Converts this promise trace to a string. The optional error value can be
 * either an error, in which case its stack trace is shown as the first
 * in the promise trace, or something else which is used as the message.
 */
PromiseTrace.prototype.toString = function () {
  var errorOpt = this.error_;
  var segmentList = this.addSegments([]);
  var result = [];
  var prevLines;
  if (errorOpt instanceof Error) {
    var errLines = [];
    if (errorOpt.stack) {
      if (!PromiseTrace.STACK_TRACE_INCLUDES_MESSAGE)
        errLines.push(String(errorOpt));
      errLines = errLines.concat(parseStackTraceLines(errorOpt.stack));
    } else {
      errLines.push(String(errorOpt));
    }
    prevLines = errLines;
    if (errLines.length > 0)
      result.push(errLines.join("\n"));
  } else if (errorOpt) {
    result.push(String(errorOpt));
    prevLines = [];
  } else {
    prevLines = [];
  }
  for (var i = 0; i < segmentList.length; i++) {
    var currentTrace = segmentList[i];
    var stack = currentTrace.getTraceHead_();
    var currentLines = parseStackTraceLines(stack);
    if (PromiseTrace.STACK_TRACE_INCLUDES_MESSAGE)
      currentLines = currentLines.slice(1);
    // If this is a subsequent trace we insert a separator.
    if (result.length > 0)
      result.push("--- triggering the failure of ---");
    var strippedLines = replaceCommonTrailingElements(prevLines, currentLines,
        "(... rest of trace same as previous ...)");
    prevLines = currentLines;
    result.push(strippedLines.join("\n"));
  }
  return result.join("\n");
};

/**
 * Returns the stack trace string for the top segment of this promise trace.
 */
PromiseTrace.prototype.getTraceHead_ = function () {
  return this.segment_.getStack();
};

/**
 * Select the type to export based on the level of support.
 */
trace.PromiseTrace = PromiseTrace;

/**
 * A stack trace segment that uses the V8 stack trace api to strip off the top
 * frames which are just clutter.
 */
function V8ApiTraceSegment() {
  Error.captureStackTrace(this, promise.Promise);
}

V8ApiTraceSegment.prototype.getStack = function () {
  return this.stack;
};

/**
 * Stack trace segment that works in all browsers, including those that don't
 * support .stack, but which give more cluttered stack traces.
 */
function GenericTraceSegment() {
  this.error_ = new Error();
}

GenericTraceSegment.prototype.getStack = function () {
  return this.error_.stack;
};

trace.PromiseTraceSegment = HAS_V8_API ? V8ApiTraceSegment : GenericTraceSegment;

})(this);
