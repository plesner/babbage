/**
 * Really quick and dirty dom construction framework.
 */
function DomBuilder(parent) {
  this.stack = [parent];
  this.current = parent;
}

/**
 * Returns a new dom builder that attaches to the given parent.
 */
DomBuilder.attach = function (parent) {
  return new DomBuilder(parent);
}

/**
 * Begins a new element with the given tag name, attaching it to the current
 * element.
 */
DomBuilder.prototype.begin = function (tagName) {
  var elm = document.createElement(tagName);
  this.current.appendChild(elm);
  this.stack.push(elm);
  this.current = elm;
  return this;
};

/**
 * Removes all children under the current element.
 */
DomBuilder.prototype.clearChildren = function () {
  while (this.current.hasChildNodes())
    this.current.removeChild(this.current.firstChild);
  return this;
}

/**
 * Appends a string to the current element.
 */
DomBuilder.prototype.appendText = function (str) {
  this.current.appendChild(document.createTextNode(str));
  return this;
};

/**
 * Sets an attribute of the current element.
 */
DomBuilder.prototype.setAttribute = function (name, value) {
  this.current[name] = value;
  return this;
};

/**
 * Sets a style attribute on the current node.
 */
DomBuilder.prototype.setStyle = function (name, value) {
  this.current.style[name] = value;
  return this;
}

/**
 * Adds a CSS class name to the current element.
 */
DomBuilder.prototype.addClass = function(name) {
  if (this.current.className) {
    this.current.className += " " + name;
  } else {
    this.current.className = name;
  }
  return this;
};

DomBuilder.prototype.removeClass = function (name) {
  if (this.current.className) {
    var parts = this.current.className.split(" ");
    var newParts = [];
    parts.forEach(function (part) {
      if (part != name)
        newParts.push(part);
    });
    this.current.className = newParts.join(" ");
  }
  return this;
};

/**
 * Invokes the given thunk with the current node.
 */
DomBuilder.prototype.withCurrentNode = function (thunk) {
  thunk(this.current);
  return this;
};

/**
 * Returns the current node.
 */
DomBuilder.prototype.getCurrentNode = function () {
  return this.current;
};

/**
 * Invokes the given thunk with this builder and the current node.
 */
DomBuilder.prototype.delegate = function (thunk) {
  thunk(this, this.current);
  return this;
};

/**
 * Invokes the given thunk for each element in the collection, passing the
 * element, this builder, and the index of the element. Useful for building
 * subtrees of variable length.
 */
DomBuilder.prototype.forEach = function (elms, thunk) {
  elms.forEach(function (elm, index) {
    thunk(elm, this, index);
  }.bind(this));
  return this;
};

/**
 * Adds a listener for the given event type to the current element.
 */
DomBuilder.prototype.addEventListener = function (event, handler) {
  this.current.addEventListener(event, handler);
  return this;
}

/**
 * Ends the current element and replaces it as the current with its parent.
 */
DomBuilder.prototype.end = function () {
  this.stack.pop();
  this.current = this.stack[this.stack.length-1];
  return this;
};
