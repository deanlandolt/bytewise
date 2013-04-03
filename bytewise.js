'use strict';
require('es6-shim');

// Sort tags used to preserve binary total order
// The tag is 1 byte, which gives us plenty of room to grow.
// We leave some space between the various types for possible future compatibility with extensions.

var NULL = 0x01;
var FALSE = 0x10;
var TRUE = 0x11;
var NEGATIVE_INFINITY = 0x40;
var NEGATIVE_NUMBER = 0x42; // packed in an inverted form to sort bitwise ascending
var POSITIVE_NUMBER = 0x45;
var POSITIVE_INFINITY = 0x47;
var DATE_PRE_EPOCH = 0x60; // packed identically to a NEGATIVE_NUMBER
var DATE_POST_EPOCH = 0x61; // packed identically to a POSITIVE_NUMBER

var BUFFER = 0x80;
var STRING = 0x90;
var ARRAY = 0xA0; // escapes nested types with bit shifting where necessary to maintain order
var MAP = 0xB0; // just like couchdb member order is preserved and matters for collation
var SET = 0xC0; // packed as array with members sorted and deduped
var FUNCTION = 0xD0; // packed as array, revived by safe eval in an isolated environment (TODO)
var UNDEFINED = 0xFF;


var flatTypes = [ BUFFER, STRING ];
var structuredTypes = [ ARRAY, MAP, SET, FUNCTION ];
var sequenceTypes = flatTypes.concat(structuredTypes);
var nullaryTypes = [ NULL, FALSE, TRUE, NEGATIVE_INFINITY, POSITIVE_INFINITY, UNDEFINED ];
var fixedTypes = {};
fixedTypes[NEGATIVE_NUMBER] = 8;
fixedTypes[POSITIVE_NUMBER] = 8;
fixedTypes[DATE_PRE_EPOCH] = 8;
fixedTypes[DATE_POST_EPOCH] = 8;


function encode(value) {

  if (value === void 0) return tag(UNDEFINED);
  if (value === null) return tag(NULL);
  if (value === false) return tag(FALSE);
  if (value === true) return tag(TRUE);

  // Number
  if (typeof value === 'number') {
    if (value !== value) throw new Error('NaN cannot be serialized');
    if (value === Number.NEGATIVE_INFINITY) return tag(NEGATIVE_INFINITY);
    if (value === Number.POSITIVE_INFINITY) return tag(POSITIVE_INFINITY);
    var type = isNegative(value) ? NEGATIVE_NUMBER : POSITIVE_NUMBER;
    return tag(type, encodeNumber(value));
  }

  // Date
  if (value instanceof Date) {
    var timestamp = value.valueOf();
    if (timestamp !== timestamp) throw new Error('Invalid Date cannot be serialized');
    var type = isNegative(timestamp) ? DATE_PRE_EPOCH : DATE_POST_EPOCH;
    return tag(type, encodeNumber(timestamp));
  }

  // Buffer
  // TODO also handle typed array
  if (value instanceof Buffer) {
    return tag(BUFFER, value);
  }

  // String
  if (typeof value === 'string') {
    return tag(STRING, new Buffer(value, 'utf8'));
  }

  // Arrays
  if (Array.isArray(value)) return tag(ARRAY, encodeList(value));

  // Map
  if (value instanceof Map || typeof value == 'object') {
    // Packs into an array, e.g. [ k1, v1, k2, v2, ... ]
    // Treats plain objects as string-keyed maps
    var isMap = value instanceof Map;
    var items = [];
    var keys = isMap ? value.keys() : Object.keys(value);
    keys.forEach(function(key) {
      items.push(key);
      items.push(isMap ? value.get(key) : value[key]);
    });
    return tag(MAP, encodeList(items));
  }

  // Set
  if (value instanceof Set) {
    // iterate set and encode each item
    // TODO a better way to iterate es6-shim Sets?
    var set = value['[[SetData]]'].keys();
    // encode, sort, and then decode the result array
    set = decode(set.map(encode).sort(compare));
    // TODO if we could build a list by concatenating buffers we could bypass the decode/encodeList dance
    return tag(SET, encodeList(set));
  }

  // Function
  if (typeof value === 'function') {
    // FIXME this can fail on inline comments in head
    var code = value.toString();
    var params = code.slice(code.indexOf('(') + 1, code.indexOf(')')).match(/([^\s,]+)/g);
    var body = code.slice(code.indexOf('{') + 1, code.lastIndexOf('}')).trim();
    return tag(FUNCTION, encodeList((params || []).concat(body)));
  }
}

function decode(buffer) {

  var type = buffer.get(0);

  // Nullary types
  if (~nullaryTypes.indexOf(type)) {
    if (buffer.length !== 1) throw new Error('Invalid encoding in buffer: ' + buffer);

    if (type === UNDEFINED) return;
    if (type === NULL) return null;
    if (type === FALSE) return false;
    if (type === TRUE) return true;
    if (type === NEGATIVE_INFINITY) return Number.NEGATIVE_INFINITY;
    if (type === POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  }

  // Fixed size types
  var chunk = buffer.slice(1);
  var chunkSize = fixedTypes[type];
  if (chunkSize) {
    if (chunk.length !== chunkSize) throw new Error('Invalid size for buffer: ' + buffer);

    if (type === NEGATIVE_NUMBER || type === POSITIVE_NUMBER) {
      return decodeNumber(chunk, type === NEGATIVE_NUMBER);
    }
    if (type === DATE_PRE_EPOCH || type === DATE_POST_EPOCH) {
      return new Date(decodeNumber(chunk, type === DATE_PRE_EPOCH));
    }
  }

  // Flat types
  if (type === BUFFER) return chunk;
  if (type === STRING) return chunk.toString('utf8');

  // Structured types
  if (~structuredTypes.indexOf(type)) {
    var result = parseHead(buffer);
    if (result[1] !== buffer.length) throw new Error('List deserialization fail: ' + result[1] + '!=' + buffer.length);
    return result[0];
  }

}


function isNegative(value) {
  if (value === 0) return Object.is(value, -0);
  return value < 0;
}

function tag(type, buffer) {
  type = new Buffer([ type ]);
  if (!buffer) return type;
  return Buffer.concat([ type, buffer ]);
}

// TODO is there a fast native version for Buffer bytewise compare?
function compare(a, b) {
  var len = Math.min(a.length, b.length);
  for (var i = 0; i < len; i++) {
    var diff = a.get(i) - b.get(i);
    if (diff) return diff;
  }
  return a.length - b.length;
}

function encodeNumber(value) {
  var negative = isNegative(value);
  var buffer = new Buffer(8);
  if (negative) {
    buffer.writeDoubleBE(-value, 0);
    return invert(buffer);
  }
  buffer.writeDoubleBE(value, 0);
  return buffer;
}

function decodeNumber(buffer, negative) {
  if (negative) buffer = invert(buffer);
  var value = buffer.readDoubleBE(0);
  return negative ? -value : value;
}


function encodeList(items) {
  // TODO pass around a map of references already encoded to detect cycles
  var buffers = [];
  var chunk;
  for (var i = 0; i < items.length; ++i) {
    chunk = encode(items[i]);
    var type = chunk.get(0);
    // We need to shift the bytes of string and buffer types to prevent confusion with the end byte
    if (~flatTypes.indexOf(type)) chunk = flatEscape(chunk);
    buffers.push(chunk);
  }
  // Close the list with an end byte
  buffers.push(new Buffer([ 0 ]));
  return Buffer.concat(buffers);
}

function flatEscape(buffer) {
  var bytes = [ buffer.get(0) ];
  var b;
  for (var i = 1; i < buffer.length; ++i) {
    b = buffer.get(i);
    if (b > 253) {
      bytes.push(255, b);
    }
    else {
      bytes.push(b + 1);
    }
  }
  // Add end byte
  bytes.push(0);
  return new Buffer(bytes);
}

function flatUnescape(buffer) {
  var bytes = [ buffer.get(0) ];
  var b;
  for (var i = 1; i < buffer.length; ++i) {
    b = buffer.get(i);
    // If 0xff replace with following byte
    if (b === 255) {
      bytes.push(buffer.get(++i));
    }
    // Otherwise subtract 1 from byte
    else {
      bytes.push(b - 1);
    }
  }
  return new Buffer(bytes);
}


function decodeList(buffer) {
  
}

function parseHead(buffer) {
  // Parses and returns the first type on the buffer and the total bytes consumed
  var type = buffer.get(0);
  // Nullary
  if (~nullaryTypes.indexOf(type)) return [ decode(new Buffer([ type ])), 1 ];
  // Fixed
  var size = fixedTypes[type];
  if (size) return [ decode(buffer.slice(0, size + 1)), size + 1 ];
  // Flat
  var index;
  if (~flatTypes.indexOf(type)) {
    // Find end byte
    for (index = 1; index < buffer.length; ++index) {
      if (buffer.get(index) === 0) break;
    }
    if (index >= buffer.length) throw new Error('No ending byte found for list');
    var chunk = flatUnescape(buffer.slice(0, index));
    // Add 1 to index to skip over end byte
    return [ decode(chunk), index + 1 ];
  }
  // Nested, recurse for each item
  var list = [];
  index = 1;
  var next;
  while ((next = buffer.get(index)) !== 0) {
    var result = parseHead(buffer.slice(index));
    list.push(result[0]);
    index += result[1];
    if (index >= buffer.length) throw new Error('No ending byte found for nested list');
  }
  return [ structure(type, list), index + 1 ];
}

function structure(type, list) {
  if (type === ARRAY) return list;
  if (type === FUNCTION) {
    // TODO sandbox
    return Function.apply(null, list);
  }
  var i;
  if (type === MAP) {
    var nonStringKeys;
    var map = new Map();
    for (i = 0; i < list.length; ++i) {
      var key = list[i];
      map.set(key, list[++i]);
      if (!nonStringKeys && typeof key !== 'string') nonStringKeys = true; 
    }
    if (nonStringKeys) return map;

    // If all map keys are strings coerce into a plain object
    var object = Object.create(null);
    map.keys().forEach(function(key) {
      object[key] = map.get(key);
    });
    return object;
  }
  if (type === SET) {
    var set = new Set();
    for (i = 0; i < list.length; ++i) {
      set.add(list[i]);
    }
    return set;
  }
}


function invert(buffer) {
  var bytes = [];
  for (var i = 0; i < buffer.length; ++i) {
    bytes.push(~buffer.get(i));
  }
  return new Buffer(bytes);
}

exports.encode = encode;
exports.decode = decode;
exports.compare = compare;
