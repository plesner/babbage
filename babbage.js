var FRAME_RATE = 60;
var TIME_PER_DIGIT = 200;

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
 * Advances this animation, returning true iff the animation should be
 * scheduled again.
 */
Animation.prototype.tick = function (now) {
  var elapsed = now - this.start;
  if (elapsed >= this.duration) {
    (this.thunk)(this.to);
    return false;
  } else {
    var fraction = elapsed / this.duration;
    var value = this.from + fraction * (this.to - this.from);
    (this.thunk)(value);
    return true;
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
  var nextAnimations = [];
  var now = Date.now();
  this.animations.forEach(function (animation) {
    if (animation.tick(now))
      nextAnimations.push(animation);
  });
  this.animations = nextAnimations;
  if (this.animations.length > 0) {
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
  var width = this.span.clientWidth;
  var letterWidth = width / 12;
  var letterOffset = letterWidth * value;
  var digitCenter = (letterWidth / 2) + 1;
  this.span.style.left = "-" + (letterOffset + digitCenter) + "px";
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
      .begin("span")
        .addClass("numbers")
        .appendText("901234567890")
        .withCurrentNode(function (node) { span = node; })
      .end("span")
    .end("div");
  return new Digit(span);
}

function Column(digits) {
  this.digits = digits;
}

Column.prototype.setElements = function (digits) {
  for (var i = 0; i < this.digits.length; i++) {
    var digitValue = digits[i];
    if (!digitValue)
      digitValue = 0;
    this.digits[i].setValue(digitValue);
  }
};

/**
 * Shows the given array of elements in this column.
 */
Column.prototype.showElements = function (digits, options) {
  for (var i = 0; i < this.digits.length; i++) {
    var digitValue = digits[i];
    if (!digitValue)
      digitValue = 0;
    this.digits[i].showValue(digitValue, options);
  }
};

/**
 * Shows a normal decimal number in this column.
 */
Column.prototype.showNumber = function (value, options) {
  var elms = [];
  while (value > 0) {
    elms.push(value % 10);
    value = (value / 10) << 0;
  }
  this.showElements(elms, options);
}

Column.create = function (builder) {
  builder
    .begin("div")
    .addClass("column");
  var digits = [];
  for (var i = 0; i < 10; i++) {
    digits.push(Digit.create(builder));
  }
  builder.end("div");
  var result = new Column(digits);
  result.setElements([]);
  return result;
};

function main() {
  var builder = DomBuilder.attach(document.getElementById("root"));
  var column = Column.create(builder);
  var i = 65536 * 65536;
  window.setInterval(function () {
    column.showNumber(i++, {
      shortestPath: true
    });
  }, 2000);
}
