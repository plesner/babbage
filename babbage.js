var FRAME_RATE = 60;
var TIME_PER_DIGIT = 100;
var TIME_PER_COLUMN = TIME_PER_DIGIT;

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
  var left = 0.7 * (value + 0.80);
  this.span.style.left = "-" + left + "em";
};

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
  this.setValue(value);
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
  var elms = [];
  while (value > 0) {
    elms.push(value % 10);
    value = (value / 10) << 0;
  }
  this.showElements(elms, options);
}

Column.create = function (builder, options) {
  var digitCount = options.digits || 10;
  var header;
  builder
    .begin("div")
      .addClass("column")
      .begin("div")
        .addClass("columnHeader")
        .begin("span")
          .addClass("columnHeaderSpan")
          .withCurrentNode(function (node) { header = node; })
        .end("span")
      .end("div")
  var digits = [];
  for (var i = 0; i < digitCount; i++) {
    digits.push(Digit.create(builder));
  }
  builder
    .end("div");
  var result = new Column(header, digits);
  result.showNumber(0, {animate: false});
  return result;
};

function DiffEngine(columns) {
  this.columns = columns;
}

/**
 * Shows the given numbers in the columns.
 */
DiffEngine.prototype.showNumbers = function (entries, options) {
  for (var i = 0; i < this.columns.length; i++) {
    var value = entries[i] || 0;
    this.columns[i].showNumber(value, options);
  }
};

/**
 * Initializes the difference engine with the given entries
 * in the columns.
 */
DiffEngine.prototype.initialize = function (entries) {
  this.showNumbers(entries, {});
};

DiffEngine.prototype.step = function () {
  var lastStepped = 7;
  var lastValue = 0;
  Animator.get().animate(6, 0, 7 * TIME_PER_COLUMN, function (progress) {
    while (progress < lastStepped) {
      var nextIndex = --lastStepped;
      var next = this.columns[nextIndex];
      var newValue = next.getValue() + lastValue;
      next.showNumber(newValue, {});
      lastValue = newValue;
    }
  }.bind(this));
};

/**
 * Creates a new difference engine widget.
 */
DiffEngine.create = function (builder, optionsOpt) {
  var options = optionsOpt || {};
  var columnCount = options.columns || 7;
  var columns = [];
  for (var i = 0; i < columnCount; i++) {
    var column = Column.create(builder, options);
    if (i == 0) {
      column.setHeader("T");
    } else {
      column.setHeader("D<sup>" + i + "</sup>");
    }
    columns.push(column);
  }
  return new DiffEngine(columns);
}

function main() {
  var builder = DomBuilder.attach(document.getElementById("root"));
  var diffEngine = DiffEngine.create(builder);
  diffEngine.initialize([9, 5, 2]);
  document.getElementById("click").addEventListener("click", function () {
    diffEngine.step();
  });
}
