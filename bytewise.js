'use strict';

var bops = require('bops')

var compare = function(a, b) {
  var result;
  for (var i = 0, end = Math.min(a.length, b.length); i < end; i++) {
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

// Attempt to use utilities from optional `typewise` dependency
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
var ARRAY = 0xa0; // escapes nested types with bit shifting where necessary to maintain order
var OBJECT = 0xb0; // just like couchdb member order is preserved and matters for collation
var REGEXP = 0xd0; // packed as tuple of two strings, the end being flags
var FUNCTION = 0xe0; // packed as array, revived by safe eval in an isolated environment (if available)
var UNDEFINED = 0xf0;
// 0xff reserved for high-key sentinal


var flatTypes = [ BUFFER, STRING ];
var structuredTypes = [ ARRAY, OBJECT, FUNCTION, REGEXP ];
var nullaryTypes = [ NULL, FALSE, TRUE, NEGATIVE_INFINITY, POSITIVE_INFINITY, UNDEFINED ];
var fixedSizeTypes = {};
fixedSizeTypes[NEGATIVE_NUMBER] = 8;
fixedSizeTypes[POSITIVE_NUMBER] = 8;
fixedSizeTypes[DATE_PRE_EPOCH] = 8;
fixedSizeTypes[DATE_POST_EPOCH] = 8;


function encode(source) {

  if (source === void 0) return tag(UNDEFINED);
  if (source === null) return tag(NULL);

  // Unbox possible natives

  var value = source != null && source.valueOf ? source.valueOf() : source;
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

  if (bops.is(value)) {
    return tag(BUFFER, value);
  }

  if (typeof value === 'string') {
    return tag(STRING, bops.from(value, 'utf8'));
  }

  // RegExp
  if (value instanceof RegExp) {
    // TODO
    throw new Error('Not Implemented Yet');
  }

  // Function
  if (typeof value === 'function') {
    return tag(FUNCTION, encodeList(_type['function'].serialize(value)));
  }

  // Array
  // TODO better handling for sparse arrays
  if (Array.isArray(value)) {
    return tag(ARRAY, encodeList(value));
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

  var type = bops.readUInt8(buffer, 0);

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
  var chunk = bops.subarray(buffer, 1);
  var chunkSize = fixedSizeTypes[type];
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
  if (type === STRING) return bops.to(chunk, 'utf8');

  // Structured types
  if (~structuredTypes.indexOf(type)) {
    var result = parseHead(buffer);
    if (result[1] !== buffer.length) {
      throw new Error('List deserialization fail: ' + bops.readUInt8(result, 1) + '!=' + bops.length(buffer));
    }
    return result[0];
  }

}


function tag(type, buffer) {
  // Just return tag byte for nullary types (no buffer provided)
  type = bops.from([ type ]);
  if (!buffer) return type;
  // Prepend a type tag byte to buffer
  return bops.join([ type, buffer ]);
}

function encodeNumber(value) {
  var buffer = bops.create(8);
  if (value < 0) {
    bops.writeDoubleBE(buffer, -value, 0);
    return invert(buffer);
  }
  bops.writeDoubleBE(buffer, value, 0);
  return buffer;
}

function decodeNumber(buffer, negative) {
  if (negative) buffer = invert(buffer);
  var value = bops.readDoubleBE(buffer, 0);
  return negative ? -value : value;
}


function encodeList(items) {
  // TODO pass around a map of references already encoded to detect cycles
  var buffers = [];
  var chunk;
  for (var i = 0, end = items.length; i < end; ++i) {
    chunk = encode(items[i]);
    var type = bops.readUInt8(chunk, 0);
    // We need to escape a few bytes in string and buffer types to prevent confusion with the end byte
    if (~flatTypes.indexOf(type)) chunk = flatEscape(chunk);
    buffers.push(chunk);
  }
  // Close the list with an end byte
  buffers.push(bops.create([ 0 ]));
  return bops.join(buffers);
}

// TODO expose in public API
function flatEscape(buffer) {
  // Escape high and low bytes 0x00 and 0xff (and by necessity, 0x01 and 0xfe)
  var b, bytes = [];
  for (var i = 0, end = buffer.length; i < end; ++i) {
    b = buffer[i];
    // Escape low bytes with 0x01 and by adding 1
    if (b === 0x01 || b === 0x00) bytes.push(0x01, b + 1);
    // Escape high bytes with 0xfe and by subtracting 1
    else if (b === 0xfe || b === 0xff) bytes.push(0xfe, b - 1);
    // Otherwise no escapement needed
    else bytes.push(b);
  }
  // Add end byte
  bytes.push(0);
  return bops.from(bytes);
}

// TODO expose in public API
function flatUnescape(buffer) {
  var b, bytes = [];
  // Don't escape last byte
  for (var i = 0, end = buffer.length; i < end; ++i) {
    b = bops.readUInt8(buffer, i);
    // If low-byte escape tag use the following byte minus 1
    if (b === 0x01) bytes.push(bops.readUInt8(buffer, ++i) - 1);
    // If high-byte escape tag use the following byte plus 1
    else if (b === 0xfe) bytes.push(bops.readUInt8(buffer, ++i) + 1);
    // Otherwise no unescapement needed
    else bytes.push(b);
  }
  return bops.from(bytes);
}


function parseHead(buffer) {
  // Parses and returns the first type on the buffer and the total bytes consumed
  var type = bops.readUInt8(buffer, 0);
  // Nullary
  if (~nullaryTypes.indexOf(type)) return [ decode(bops.from([ type ])), 1 ];
  // Fixed
  var size = fixedSizeTypes[type];
  if (size++) return [ decode(bops.subarray(buffer, 0, size)), size ];
  // Flat
  var index;
  var end;
  if (~flatTypes.indexOf(type)) {
    // Find end byte
    for (index = 1, end = buffer.length; index < end; ++index) {
      if (bops.readUInt8(buffer, index) === 0x00) break;
    }
    if (index >= buffer.length) throw new Error('No ending byte found for list');
    var chunk = flatUnescape(bops.subarray(buffer, 0, index));
    // Add 1 to index to skip over end byte
    return [ decode(chunk), index + 1 ];
  }
  
  // Nested, recurse for each item
  var list = [];
  index = 1;
  var next;
  while ((next = bops.readUInt8(buffer, index)) !== 0) {
    var result = parseHead(bops.subarray(buffer, index));
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
  var i, end;
  if (type === OBJECT) {
    var object = Object.create(null);
    for (i = 0, end = list.length; i < end; ++i) {
      object[list[i]] = list[++i];
    }
    return object;
  }
  throw new Error('Unknown type: ' + type);
}


function invert(buffer) {
  var bytes = [];
  for (var i = 0, end = buffer.length; i < end; ++i) {
    bytes.push(~bops.readUInt8(buffer, i));
  }
  return bops.from(bytes);
}

exports.encode = encode;
exports.decode = decode;
exports.compare = compare;
exports.buffer = true;
exports.type = 'bytewise';
