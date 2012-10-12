var FRAME_RATE = 60;
var TIME_PER_DIGIT = 100;
var TIME_PER_COLUMN = TIME_PER_DIGIT;

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
  var left = 9 * (value + 0.85);
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
Digit.prototype.tick = function (from, progress) {
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
}

/**
 * Sets the value via an animation, swiveling the wheel.
 */
Digit.prototype.showValue = function (value, options) {
  var from = this.currentValue;
  var to = value;
  if (from == to)
    return;
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
  var time = TIME_PER_DIGIT * Math.abs(distance);
  Animator.get().animate(0, distance, time, this.tick.bind(this, from));
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
  for (var i = 0; i < count; i++) {
    var digitValue = digits[i] || 0;
    this.digits[count - i - 1].showValue(digitValue, options);
  }
};

/**
 * Shows a normal decimal number in this column.
 */
Column.prototype.showNumber = function (value, options) {
  this.value = value;
  this.showElements(value.getDigits(), options);
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

function DiffEngine(columns, paper, limit, point, round) {
  this.columns = columns;
  this.paper = paper;
  this.limit = limit;
  this.point = point;
  this.initial = [];
  this.round = round;
}

/**
 * Shows the given numbers in the columns.
 */
DiffEngine.prototype.showNumbers = function (entries, options) {
  for (var i = 0; i < this.columns.length; i++) {
    var value = entries[i] || Value.ZERO;
    this.columns[i].showNumber(value, options);
  }
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
  this.showNumbers(value, options);
  this.printValue(value[0]);
};

DiffEngine.prototype.reset = function () {
  this.paper.innerHTML = "";
  this.initialize(this.initial, {shortestPath: true});
};

DiffEngine.prototype.step = function () {
  var colCount = this.columns.length;
  var lastStepped = colCount;
  var lastValue = Value.ZERO;
  Animator.get().animate(colCount - 1, 0, colCount * TIME_PER_COLUMN, function (progress, atEnd) {
    while (progress < lastStepped) {
      var nextIndex = --lastStepped;
      var next = this.columns[nextIndex];
      var newValue = next.getValue().plus(lastValue);
      var showPromise = next.showNumber(newValue, {});
      if (nextIndex == 0) {
        this.printValue(newValue);
      }
      lastValue = newValue;
    }
  }.bind(this));
};

DiffEngine.prototype.printValue = function (value) {
  var number = value.getDisplayValue();
  if (this.round > 0) {
    var factor = Math.pow(10, this.round);
    number = Math.round(number / factor) * factor;
  }
  number = number / Math.pow(10, this.point);
  DomBuilder
    .attach(this.paper)
    .begin("tr")
      .begin("td")
        .addClass("printline")
        .appendText(String(number))
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
  var result = new DiffEngine(columns, paper, limit, point, options.round);
  if (options.init)
    result.initialize(options.init, {});
  return result;
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

function main() {
  var params = Parameters.parse();
  var options = {
    init: params.getList("init", []).map(function (str) { return Number(str); }),
    cols: Number(params.get("cols", 8)),
    digits: Number(params.get("digits", 10)),
    point: Number(params.get("point", 0)),
    round: Number(params.get("round", 0))
  };
  var builder = DomBuilder.attach(document.getElementById("root"));
  var diffEngine = DiffEngine.create(builder, options);
  document.getElementById("click").addEventListener("click", function () {
    diffEngine.step();
  });
  document.getElementById("reset").addEventListener("click", function () {
    diffEngine.reset();
  })
}

window.addEventListener("DOMContentLoaded", main);