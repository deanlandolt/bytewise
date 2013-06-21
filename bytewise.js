'use strict';
require('es6-shim');
// FIXME fix iterating keys in --harmony maps and sets

var compare = function(a, b) {
  var result;
  for (var i = 0, length = Math.min(a.length, b.length); i < length; i++) {
    result = a.get(i) - b.get(i);
    if (result) return result;
  }
  return a.length - b.length;
};

var _type = {
  function: {
    parse: function() {
      throw new Error('Fallback for function reviving NYI');
    },
    serialize: function() {
      throw new Error('Fallback for function serializing NYI');
    }
  }
};

try {
  var typewise = require('typewise');
  compare = typewise.comparators.bytewise;
  _type.function = typewise.types.function;
}
catch (e) {}

// Sort tags used to preserve binary total order
// The tag is 1 byte, which gives us plenty of room to grow.
// We leave some space between the various types for possible future compatibility with extensions.

// 0x00 reserved for termination character
var NULL = 0x10;
var FALSE = 0x20;
var TRUE = 0x21;
var NEGATIVE_INFINITY = 0x40;
var NEGATIVE_NUMBER = 0x41; // packed in an inverted form to sort bitwise ascending
var POSITIVE_NUMBER = 0x42;
var POSITIVE_INFINITY = 0x43;
var DATE_PRE_EPOCH = 0x51; // packed identically to a NEGATIVE_NUMBER
var DATE_POST_EPOCH = 0x52; // packed identically to a POSITIVE_NUMBER
var BUFFER = 0x60;
var STRING = 0x70;
var SET = 0x90; // packed as array with members sorted and deduped
var ARRAY = 0xa0; // escapes nested types with bit shifting where necessary to maintain order
var OBJECT = 0xb0; // just like couchdb member order is preserved and matters for collation
var MAP = 0xc0; // just like couchdb member order is preserved and matters for collation
var REGEXP = 0xd0; // packed as tuple of two strings, the end being flags
var FUNCTION = 0xe0; // packed as array, revived by safe eval in an isolated environment (if available)
var UNDEFINED = 0xf0;
// 0xff reserved for high-key sentinal


var flatTypes = [ BUFFER, STRING ];
var structuredTypes = [ ARRAY, OBJECT, MAP, SET, FUNCTION ];
var nullaryTypes = [ NULL, FALSE, TRUE, NEGATIVE_INFINITY, POSITIVE_INFINITY, UNDEFINED ];
var fixedTypes = {};
fixedTypes[NEGATIVE_NUMBER] = 8;
fixedTypes[POSITIVE_NUMBER] = 8;
fixedTypes[DATE_PRE_EPOCH] = 8;
fixedTypes[DATE_POST_EPOCH] = 8;


function encode(source) {

  if (source === void 0) return tag(UNDEFINED);
  if (source === null) return tag(NULL);

  // Unbox possible natives
  var value = source.valueOf();
  var type;

  // NaN and Invalid Date not permitted
  if (value !== value) {
    if (source instanceof Date) throw new TypeError('Invalid Date not permitted');
    throw new TypeError('NaN not permitted');
  }

  if (value === false) return tag(FALSE);
  if (value === true) return tag(TRUE);

  if (source instanceof Date) {
    // Normalize -0 values to 0
    if (Object.is(value, -0)) value = 0;
    type = value < 0 ? DATE_PRE_EPOCH : DATE_POST_EPOCH;
    return tag(type, encodeNumber(value));
  }

  if (typeof value === 'number') {
    if (value === Number.NEGATIVE_INFINITY) return tag(NEGATIVE_INFINITY);
    if (value === Number.POSITIVE_INFINITY) return tag(POSITIVE_INFINITY);
    // Normalize -0 values to 0
    if (Object.is(value, -0)) value = 0;
    type = value < 0 ? NEGATIVE_NUMBER : POSITIVE_NUMBER;
    return tag(type, encodeNumber(value));
  }

  // TODO also handle typed array, blob, etc.
  if (value instanceof Buffer) {
    return tag(BUFFER, value);
  }

  if (typeof value === 'string') {
    return tag(STRING, new Buffer(value, 'utf8'));
  }

  // RegExp
  if (value instanceof RegExp) {
    // TODO
    throw new Error('NYI');
  }

  // Function
  if (typeof value === 'function') {
    return tag(FUNCTION, encodeList(_type['function'].serialize(value)));
  }

  // Array
  // TODO handle sparse arrays better
  if (Array.isArray(value)) return tag(ARRAY, encodeList(value));

  // Map
  if (value instanceof Map) {
    // Packs into an array, e.g. [ k1, v1, k2, v2, ... ]
    var items = [];
    getCollectionKeys(value).forEach(function(key) {
      items.push(key);
      items.push(value.get(key));
    });
    return tag(MAP, encodeList(items));
  }

  // Set
  if (value instanceof Set) {
    var set = getCollectionKeys(value);
    // encode, sort, and then decode the result array
    set = decode(set.map(encode).sort(compare));
    // TODO we should be able to build a list by concatenating buffers -- bypass this decode/encodeList dance
    return tag(SET, encodeList(set));
  }

  // Object
  if (typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
    // Packs into an array, e.g. [ k1, v1, k2, v2, ... ]
    var items = [];
    Object.keys(value).forEach(function(key) {
      items.push(key);
      items.push(value[key]);
    });
    return tag(OBJECT, encodeList(items));
  }

  // TODO RegExp and other types from Structured Clone algorithm (Blob, File, FileList)

  throw new Error('Cannot encode unknown type: ' + source);
}

function decode(buffer) {

  var type = buffer[0];

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


function tag(type, buffer) {
  type = new Buffer([ type ]);
  if (!buffer) return type;
  return Buffer.concat([ type, buffer ]);
}

function encodeNumber(value) {
  var buffer = new Buffer(8);
  if (value < 0) {
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
  for (var i = 0, length = items.length; i < length; ++i) {
    chunk = encode(items[i]);
    var type = chunk[0];
    // We need to shift the bytes of string and buffer types to prevent confusion with the end byte
    if (~flatTypes.indexOf(type)) chunk = flatEscape(chunk);
    buffers.push(chunk);
  }
  // Close the list with an end byte
  buffers.push(new Buffer([ 0 ]));
  return Buffer.concat(buffers);
}

function flatEscape(buffer) {
  var bytes = [ buffer[0] ];
  var b;
  for (var i = 1, length = buffer.length; i < length; ++i) {
    b = buffer[i];
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
  var bytes = [ buffer[0] ];
  var b;
  for (var i = 1, length = buffer.length; i < length; ++i) {
    b = buffer[i];
    // If 0xff replace with following byte
    if (b === 255) {
      bytes.push(buffer[++i]);
    }
    // Otherwise subtract 1 from byte
    else {
      bytes.push(b - 1);
    }
  }
  return new Buffer(bytes);
}


function parseHead(buffer) {
  // Parses and returns the first type on the buffer and the total bytes consumed
  var type = buffer[0];
  // Nullary
  if (~nullaryTypes.indexOf(type)) return [ decode(new Buffer([ type ])), 1 ];
  // Fixed
  var size = fixedTypes[type];
  if (size) return [ decode(buffer.slice(0, size + 1)), size + 1 ];
  // Flat
  var index;
  var length;
  if (~flatTypes.indexOf(type)) {
    // Find end byte
    for (index = 1, length = buffer.length; index < length; ++index) {
      if (buffer[index] === 0) break;
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
  while ((next = buffer[index]) !== 0) {
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
    return _type['function'].parse(list);
  }
  var i, length;
  if (type === OBJECT) {
    var object = Object.create(null);
    for (i = 0, length = list.length; i < length; ++i) {
      object[list[i]] = list[++i];
    }
    return object;
  }
  if (type === MAP) {
    var map = new Map();
    for (i = 0, length = list.length; i < length; ++i) {
      map.set(list[i], list[++i]);
    }
    return map;
  }
  if (type === SET) {
    var set = new Set();
    for (i = 0, length = list.length; i < length; ++i) {
      set.add(list[i]);
    }
    return set;
  }
  throw new Error('Unknown type: ' + type);
}


function invert(buffer) {
  var bytes = [];
  for (var i = 0, length = buffer.length; i < length; ++i) {
    bytes.push(~buffer[i]);
  }
  return new Buffer(bytes);
}


function _shittyShimIterate(iterator) {
  // FIXME update es6-shim to latest iteration spec and remove this garbage
  var items = [];
  var next;
  try {
    while (next = iterator.next()) {
      items.push(next)
    }
  }
  catch (e) {}
  return items;
}

function getCollectionKeys(collection) {
  // FIXME support --harmony collection iteration
  if (!typeof collection.keys === 'function') return [];
  return _shittyShimIterate(collection.keys());
}


exports.encode = encode;
exports.decode = decode;
exports.compare = compare;
