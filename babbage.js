var FRAME_RATE = 60;
var TIME_PER_DIGIT = 100;
var TIME_PER_DIGIT_TURBO = 20;

/**
 * A tens complement value.
 */
function Value(value, limit) {
  while (value < 0) {
    value += limit + 1;
  }
  while (value > limit) {
    value -= limit + 1;
  }
  this.value = value;
  this.limit = limit;
}

Value.ZERO = new Value(0, 0);

/**
 * Adds one value to another.
 */
Value.prototype.plus = function (that) {
  return new Value(this.value + that.value, this.limit);
};

/**
 * Returns an array of the base 10 digits of this value.
 */
Value.prototype.getDigits = function () {
  var result = [];
  var current = this.value;
  while (current != 0) {
    result.push(current % 10);
    current = Math.floor(current / 10);
  }
  return result;
};

/**
 * Returns the value to display for this number.
 */
Value.prototype.getDisplayValue = function () {
  return (this.value >= (this.limit / 2))
    ? this.value - (this.limit + 1)
    : this.value;
};

/**
 * The state associated with a single animation.
 */
function Animation(from, to, duration, thunk) {
  this.start = Date.now();
  this.from = from;
  this.to = to;
  this.duration = duration;
  this.thunk = thunk;
}

/**
 * Advances this animation, returning true iff the animation is complete.
 */
Animation.prototype.tick = function (now) {
  var elapsed = now - this.start;
  if (elapsed >= this.duration) {
    (this.thunk)(this.to, true);
    return true;
  } else {
    var fraction = elapsed / this.duration;
    var value = this.from + fraction * (this.to - this.from);
    (this.thunk)(value, false);
    return false;
  }
};

/**
 * A singleton object used for keeping track of animations. This is simpler
 * and more efficient than having each individual graphical element animating
 * itself.
 */
function Animator() {
  this.isRunning = false;
  this.animations = [];
}

/**
 * The singleton animator instance.
 */
Animator.INSTANCE = new Animator();

/**
 * Ensures that this animator is scheduling ticks.
 */
Animator.prototype.ensureRunning = function () {
  if (this.isRunning)
    return;
  this.isRunning = true;
  window.setTimeout(this.tick.bind(this), 1000 / FRAME_RATE);
};

/**
 * Executes a single animator tick.
 */
Animator.prototype.tick = function () {
  // Store the current state of the animation list.
  var lastAnimations = this.animations;
  var nextAnimations = this.animations = [];
  var now = Date.now();
  lastAnimations.forEach(function (animation) {
    if (!animation.tick(now))
      nextAnimations.push(animation);
  });
  if (nextAnimations.length > 0) {
    window.setTimeout(this.tick.bind(this), 1000 / FRAME_RATE);
  } else {
    this.isRunning = false;
  }
};

/**
 * Accessor for the animator instance.
 */
Animator.get = function () {
  return Animator.INSTANCE;
};

/**
 * Schedule a thunk to be called back at the default rate, passing the
 * current amount that has passed between 'from' and 'to'.
 */
Animator.prototype.animate = function (from, to, duration, thunk) {
  this.animations.push(new Animation(from, to, duration, thunk));
  this.ensureRunning();
};

/**
 * The state associated with a single digit.
 */
function Digit(span) {
  this.span = span;
  this.currentValue = 0;
  this.setValue(0);
}

/**
 * Sets the absolute raw value of this digit immediately.
 */
Digit.prototype.setValue = function (value) {
  this.currentValue = value;
  var left = 9 * value;
  this.span.style.left = "-" + left + "pt";
};

/**
 * Applies a function that turns the curve f(x)=x from a straight line into
 * a curve that starts off increasing slowly, then quickly, the slowly again.
 * The d argument controls how quickly. D=1 makes this the identity.
 */
function curveGradient(v, d) {
  return Math.pow(v, d) / (1 - d * v + d * v * v);
}

/**
 * Moves this digit a single tick. For simplicity we accept progress values
 * outside the "meaningful" interval between 0 and 10 as a way to express
 * wrapping around between 9 and 0.
 */
Digit.prototype.tick = function (promise, from, progress, atEnd) {
  var value = from + progress;
  if (value >= 10) {
    value -= 10;
  } else if (value < 0) {
    value += 10;
  }
  var integer = (value >> 0);
  var fraction = value - integer;
  // Curve the fractional part to make the transitions look more stepwise,
  // like on a curta.
  var stepwise = integer + curveGradient(fraction, 2);
  this.setValue(stepwise);
  if (atEnd)
    promise.fulfill(stepwise);
}

/**
 * Sets the value via an animation, swiveling the wheel.
 */
Digit.prototype.showValue = function (value, options) {
  var from = this.currentValue;
  var to = value;
  if (from == to)
    return promise.Promise.of(to);
  var animate = ("animate" in options) ? options.animate : true;
  if (!animate) {
    this.setValue(value);
    return;
  }
  var distance;
  if (to < from) {
    distance = (10 + to) - from;
  } else {
    distance = to - from;
  }
  if (options.shortestPath && (distance > 5)) {
    // If we allow the shortest path then swivel backwards if the distance
    // is shorter the other way.
    distance -= 10;
  }
  var timePerDigit = options.timePerDigit || TIME_PER_DIGIT;
  var time = timePerDigit * Math.abs(distance);
  var result = new promise.Promise();
  Animator.get().animate(0, distance, time, this.tick.bind(this, result, from));
  return result;
};

/**
 * Adds the given value to the current value, ignoring carry.
 */
Digit.prototype.addValueNoCarry = function (value, options) {
  return this.showValue(this.currentValue + value, options);
};

Digit.create = function (builder) {
  var span;
  builder
    .begin("div")
      .addClass("wheel")
      .begin("div")
        .addClass("shadeLeft")
      .end("div")
      .begin("div")
        .addClass("shadeRight")
      .end("div")
      .begin("div")
        .addClass("numbers");
  for (var i = 0; i <= 11; i++) {
    var label = (9 + i) % 10;
    builder
      .begin("div")
        .addClass("number")
        .addClass("number-" + label)
        .appendText(label)
      .end("div");
  }
  builder
        .withCurrentNode(function (node) { span = node; })
      .end("div")
    .end("div");
  return new Digit(span);
}

function Column(header, digits) {
  this.header = header;
  this.digits = digits;
  this.value = 0;
}

Column.prototype.setHeader = function (html) {
  this.header.innerHTML = html;
};

Column.prototype.getValue = function () {
  return this.value;
};

/**
 * Shows the given array of elements in this column.
 */
Column.prototype.showElements = function (digits, options) {
  var count = this.digits.length;
  var animate = 'animate' in options ? options.animate : true;
  if (!animate) {
    for (var i = 0; i < count; i++)
      this.digits[count - i - 1].showValue(digits[i] || 0, options);
    return promise.Promise.of(null);
  }
  var count = this.digits.length;
  var result = new promise.Promise();
  var digitsProgress = [];
  stepUp(0, count, options.timePerDigit || TIME_PER_DIGIT, function (index) {
    var digitValue = digits[index] || 0;
    var wheel = this.digits[count - index - 1];
    digitsProgress.push(wheel.showValue(digitValue, options));
    if (index == count - 1) {
      var digitsDonePromise = promise.Promise.join(digitsProgress);
      digitsDonePromise.forwardTo(result);
    }    
  }.bind(this));
  return result;
};

/**
 * Add a number to this column. We first add the digits to the column,
 * ignoring carry, to get the effect of a full revolution when adding
 * negative numbers even if the digit will return to its previous value,
 * and then we add the carry simply by setting the correct result. This
 * has the added benefit that the final result is sure to reflect the
 * desired value, independent of the digit adding and carrying logic which
 * is just for show.
 */
Column.prototype.addNumber = function (delta, options) {
  var newValue = this.value.plus(delta);
  this.value = newValue;
  var count = this.digits.length;
  var deltaDigits = delta.getDigits();
  var newDigits = newValue.getDigits();
  var result = new promise.Promise();
  var digitsProgress = [];
  stepUp(0, count, options.timePerDigit || TIME_PER_DIGIT, function (index) {
    var digitValue = deltaDigits[index] || 0;
    var wheel = this.digits[count - index - 1];
    var noCarry = wheel.addValueNoCarry(digitValue, options);
    var withCarry = noCarry.lazyThen(function () {
      var newDigitValue = newDigits[index] || 0;
      return wheel.showValue(newDigitValue, options);
    });
    digitsProgress.push(withCarry);
    if (index == count - 1) {
      var digitsDonePromise = promise.Promise.join(digitsProgress);
      digitsDonePromise.forwardTo(result);
    }
  }.bind(this));
  return result;
};

/**
 * Shows a normal decimal number in this column.
 */
Column.prototype.showNumber = function (value, options) {
  this.value = value;
  return this.showElements(value.getDigits(), options);
}

Column.create = function (rows, digitCount) {
  var digits = [];
  for (var i = 0; i < digitCount; i++) {
    var cell = rows[i].insertCell(-1);
    digits.push(Digit.create(DomBuilder.attach(cell)));
  }
  var result = new Column(null, digits);
  result.showNumber(Value.ZERO, {animate: false});
  return result;
};

function DiffEngine(columns, paper, limit, point, round, precision) {
  this.columns = columns;
  this.paper = paper;
  this.limit = limit;
  this.point = point;
  this.initial = [];
  this.round = round;
  this.actionChain = promise.Promise.of(null);
  this.turbo = false;
  this.precision = precision;
}

DiffEngine.prototype.pushAction = function (thunk) {
  var oldChain = this.actionChain;
  this.actionChain = new promise.Promise();
  oldChain.lazyThen(thunk).forwardTo(this.actionChain);
};

/**
 * Shows the given numbers in the columns.
 */
DiffEngine.prototype.showNumbers = function (entries, options) {
  var colShows = [];
  for (var i = 0; i < this.columns.length; i++) {
    var value = entries[i] || Value.ZERO;
    colShows.push(this.columns[i].showNumber(value, options));
  }
  return promise.Promise.join(colShows);
};

/**
 * Initializes the difference engine with the given entries
 * in the columns.
 */
DiffEngine.prototype.initialize = function (entries, options) {
  this.initial = entries;
  var limit = this.limit;
  function toTensComplement(value) {
    return new Value(value, limit);
  }
  var value = entries.map(toTensComplement);
  var result = this.showNumbers(value, options);
  this.printValue(value[0]);
  return result;
};

DiffEngine.prototype.reset = function () {
  this.paper.innerHTML = "";
  var options = {shortestPath: true};
  options.timePerDigit = (this.turbo ? TIME_PER_DIGIT_TURBO : TIME_PER_DIGIT);
  return this.initialize(this.initial, options);
};

/**
 * Invokes the given thunk once for each step through the integers from from
 * to to, waiting the given delay between each call.
 */
function stepUp(from, to, delay, thunk) {
  var length = to - from;
  var lastStepped = 0;
  Animator.get().animate(from, to, length * delay, function (progress, atEnd) {
    while (progress > lastStepped) {
      var nextIndex = lastStepped++;
      thunk(nextIndex);
    }
  });
}

DiffEngine.prototype.step = function () {
  var lastValue = Value.ZERO;
  var length = this.columns.length;
  var allColumns = [];
  var result = new promise.Promise();
  var options = {timePerDigit: (this.turbo ? TIME_PER_DIGIT_TURBO : TIME_PER_DIGIT)};
  stepUp(0, length, options.timePerDigit, function (nextIndex) {
    var next = this.columns[length - nextIndex - 1];
    var newValue = next.getValue().plus(lastValue);
    allColumns.push(next.addNumber(lastValue, options));
    lastValue = newValue;
    if (nextIndex == length - 1) {
      promise.Promise.join(allColumns).forwardTo(result).onFulfilled(function () {
        this.printValue(newValue);          
      }.bind(this));
    }
  }.bind(this));
  return result;
};

DiffEngine.prototype.printValue = function (value) {
  var number = value.getDisplayValue();
  if (this.round > 0) {
    var factor = Math.pow(10, this.round);
    number = Math.round(number / factor) * factor;
  }
  number = number / Math.pow(10, this.point);
  var fixed = this.point - this.round - 1;
  var str = (fixed > 0) ? number.toFixed(fixed) : String(number);
  DomBuilder
    .attach(this.paper)
    .begin("tr")
      .begin("td")
        .addClass("printline")
        .appendText(str)
      .end("td")
    .end("tr");
  this.paper.parentNode.scrollTop = this.paper.parentNode.scrollHeight
};

/**
 * Creates a new difference engine widget.
 */
DiffEngine.create = function (builder, optionsOpt) {
  var options = optionsOpt || {};
  var digitCount = options.digits || 10;
  var columnCount = options.cols || 7;
  var point = options.point || 0;
  var rows = [];
  var table;
  var paper;
  // Gave up and used tables.
  builder
    .begin("div")
      .addClass("tableHolder")
      .begin("table")
        .addClass("columns")
        .withCurrentNode(function (n) { table = n; })
      .end("table")
    .end("div")
    .begin("div")
      .addClass("printout")
      .begin("div")
        .addClass("paper")
        .begin("table")
          .addClass("papertable")
          .withCurrentNode(function (n) { paper = n; })
        .end("table")
      .end("div")
    .end("div");
  for (var i = digitCount; i > 0; i--) {
    if (i > 0 && i == point) {
      DomBuilder
          .attach(table.insertRow(-1))          
          .begin("td")
            .withCurrentNode(function (n) { n.setAttribute("colspan", columnCount); })
            .addClass("pointrow")
          .end("td");
    }
    rows.push(table.insertRow(-1));
  }
  var columns = [];
  for (var i = 0; i < columnCount; i++)
    columns.push(Column.create(rows, digitCount));
  var limit = Math.pow(10, digitCount) - 1;
  var result = new DiffEngine(columns, paper, limit, point, options.round, digitCount);
  if (options.init)
    result.initialize(options.init, {animate: false});
  return result;
}

function AnaEngine() {
  
}

AnaEngine.create = function (builder, options) {
  builder
    .begin("div")
      .begin("div")
        .addClass("opstream")
      .end("div")
      .begin("div")
        .addClass("varstream")
      .end("div")
    .end("div")
}

function Program(ops, ins, vars) {
  this.ops = ops;
  this.ins = ins;
  this.vars = vars;
  console.log(this);
}

function Times(n) {
  this.n = n;
}

function Minus(n) {
  this.n = n;
}

function Divide(n) {
  this.n = n;
}

function ReadAndRestore(n) {
  this.n = n;
}

function ReadAndZero(n) {
  this.n = n;
}

Program.parse = function (str) {
  var parts = str.split(".");
  var opStr = parts[0];
  var inStr = parts[1];
  var varStr = parts[2];
  var ops = [];
  for (var i = 0; i < opStr.length; i += 4) {
    var count = Number(opStr.substring(i+1, i+4));
    var op;
    switch (opStr.charAt(i)) {
      case "x":
        op = new Times(count);
        break;
      case "s":
        op = new Minus(count);
        break;
      case "d":
        op = new Divide(count);
        break;
    }
    ops.push(op);
  }
  var ins = [];
  for (var i = 0; i < inStr.length; i += 2)
    ins.push(Number(inStr.substring(i, i + 2)));
  var vars = [];
  for (var i = 0; i < varStr.length; i += 3) {
    var value = Number(varStr.substring(i + 1, i + 3));
    var v;
    switch (varStr.charAt(i)) {
      case "r":
        v = new ReadAndRestore(value);
        break;
      case "z":
        v = new ReadAndZero(value);
        break;
    }
    vars.push(v);
  }
  return new Program(ops, ins, vars);
}

/**
 * A wrapper around the query parameters to this page.
 */
function Parameters(params) {
  this.params = params;
}

/**
 * Returns the value of a list parameter.
 */
Parameters.prototype.getList = function (name, defaultOpt) {
  if (this.params.hasOwnProperty(name)) {
    return this.params[name].split(",");
  } else {
    return defaultOpt;
  }
};

/**
 * Returns the raw value of a parameter.
 */
Parameters.prototype.get = function (name, defaultOpt) {
  if (this.params.hasOwnProperty(name)) {
    return this.params[name];
  } else {
    return defaultOpt;
  }
};

/**
 * Parses the query parameters to this page.
 */
Parameters.parse = function () {
  var allParts = window.location.search.split(/[?&]/);
  var parts = allParts.filter(function (elm) { return elm.length > 0; });
  var result = {};
  parts.forEach(function (part) {
    var pair = part.split("=");
    result[pair[0]] = pair[1];
  });
  return new Parameters(result);
};

function createDiffEngine(builder, options) {
  var diffEngine = DiffEngine.create(builder, options);
  document.getElementById("click").addEventListener("click", function () {
    diffEngine.pushAction(diffEngine.step.bind(diffEngine));
  });
  document.getElementById("turbodiv").style.visibility = options.showTurbo ? "default" : "hidden";
  document.getElementById("turbo").addEventListener("change", function () {
    diffEngine.turbo = turbo.checked;
  });
  document.getElementById("reset").addEventListener("click", function () {
    diffEngine.pushAction(diffEngine.reset.bind(diffEngine));
  });
}

function createAnaEngine(builder, options) {
  var program = Program.parse(options.program);
  var anaEngine = AnaEngine.create(builder, options);
}

function main() {
  var params = Parameters.parse();
  var options = {
    init: params.getList("init", []).map(function (str) { return Number(str); }),
    cols: Number(params.get("cols", 8)),
    digits: Number(params.get("digits", 10)),
    point: Number(params.get("point", 0)),
    round: Number(params.get("round", 0)),
    showTurbo: !!params.get("turbo", false),
    type: params.get("type", "differential"),
    program: params.get("program", "")
  };
  var builder = DomBuilder.attach(document.getElementById("root"));
  if (options.type == "analytical") {
    createAnaEngine(builder, options);
  } else {
    createDiffEngine(builder, options);
  }
}

window.addEventListener("DOMContentLoaded", main);