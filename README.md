bytewise
========

A binary serialization which sorts bytewise for arbitrarily complex data structures, respecting [typewise](https://github.com/deanlandolt/typewise) structured sorting efficiently.

[![build status](https://secure.travis-ci.org/deanlandolt/bytewise.png)](http://travis-ci.org/deanlandolt/bytewise)
[![testling badge](https://ci.testling.com/deanlandolt/bytewise.png)](https://ci.testling.com/deanlandolt/bytewise)

This library defines a total order of possible data structures allowed in a keyspace and a binary encoding which sorts bytewise in this order. The ordering is a superset of both the sorting algorithm defined by [IndexedDB](http://www.w3.org/TR/IndexedDB/#key-construct) and the one defined by [CouchDB](http://wiki.apache.org/couchdb/View_collation). This serialization makes it easy to take advantage of the benefits of structural indexing on systems with fast but naïve binary indexing.


## Order of Supported Structures

This is the top level order of the various structures that may be encoded:

* `null`
* `false`
* `true`
* `Number` (numeric)
* `Date` (numeric, epoch offset)
* `Buffer` (bitwise)
* `String` (lexicographic)
* `Set` (componentwise with elements sorted)
* `Array` (componentwise)
* `Object` (componentwise string-keyed key/value pairs)
* `Map` (componentwise key/value pairs)
* `RegExp` (stringified lexicographic)
* `Function` (stringified lexicographic)
* `undefined`


These specific structures can be used to serialize the vast majority of javascript values in a way that can be sorted in an efficient, complete and sensible manner. Each value is prefixed with a type tag, and we do some bit munging to encode our values in such a way as to carefully preserve the desired sort behavior, even in the precense of structural nested.

For example, negative numbers are stored as a different *type* from positive numbers, with its sign bit stripped and its bytes inverted to ensure numbers with a larger magnitude come first. `Infinity` and `-Infinity` can also be encoded -- they are *nullary* types, encoded using just their type tag. The same can be said of `null` and `undefined`, and the boolean values `false`, `true`. `Date` instances are stored just like `Number` instances -- but as in IndexedDB -- `Date` sorts after `Number` (including `Infinity`). `Buffer` data can be stored in the raw, and is sorted before `String` data. Then come the collection types -- `Array` and `Object`, along with the additional types defined by es6: `Map` and `Set`. We can even serialize `Function` values and (with the optional `typewise` dependency) revive them in an isolated [Secure ECMAScript](https://code.google.com/p/es-lab/wiki/SecureEcmaScript) context where they are powerless to do anything but calculate.


## Unsupported Structures

This serialization accomodates a wide range of javascript structures, but it is not exhaustive. Objects or arrays with reference cycles cannot be serialized. `NaN` is also illegal anywhere in a serialized value -- its presense very likely indicates of an error, but more importantly sorting on `NaN` is nonsensical by definition. (Similarly we may want to reject objects which are instances of `Error`.) Invalid `Date` objects are also illegal. Since `WeakMap` and `WeakSet` objects cannot be enumerated they are impossible to serialize. Attempts to serialize any values which include these structures should throw a `TypeError`.


## Usage

`encode` serializes any supported type and returns a buffer, or throws if an unsupported structure is passed:
  
  ``` js
  var bytewise = require('bytewise');
  var assert = require('assert');
  // Helper to encode and then toString the buffer, defaults to binary but we'll use hex to show non-string values
  function encode(value, encoding) { return bytewise.encode(value).toString(encoding || 'binary') }

  // Many types can be respresented using only their type tag, a single byte
  // WARNING type tags are subject to change for the time being!
  assert.equal(encode(null), '\x10');
  assert.equal(encode(false), '\x20');
  assert.equal(encode(true), '\x21');
  assert.equal(encode(undefined), '\xf0');

  // Numbers are stored in 9 bytes -- 1 byte for the type tag and an 8 byte float
  assert.equal(encode(12345, 'hex'), '4240c81c8000000000');
  // Negative numbers are stored as positive numbers, but with a lower type tag and their bits inverted
  assert.equal(encode(-12345, 'hex'), '41bf37e37fffffffff');

  // All numbers, integer or floating point, are stored as IEEE 754 doubles
  assert.equal(encode(1.2345, 'hex'), '423ff3c083126e978d');
  assert.equal(encode(-1.2345, 'hex'), '41c00c3f7ced916872');

  // Serialization does not preserve the sign bit, so 0 is indistinguishable from -0
  assert.equal(encode(-0, 'hex'), '420000000000000000');
  assert.equal(encode(0, 'hex'), '420000000000000000');

  // We can even serialize Infinity and -Infinity, though we just use their type tag
  assert.equal(encode(-Infinity, 'hex'), '40');
  assert.equal(encode(Infinity, 'hex'), '43');

  // Dates are stored just like numbers, but with different (and higher) type tags
  assert.equal(encode(new Date(-12345), 'hex'), '51bf37e37fffffffff');
  assert.equal(encode(new Date(12345), 'hex'), '5240c81c8000000000');

  // Strings are encoded as utf8, prefixed with their type tag (0x70, or the "p" character)
  assert.equal(encode('foo'), 'pfoo');
  assert.equal(encode('föo'), 'pfÃ¶o');

  // Buffers are also left alone, other than being prefixed with their type tag (0x60)
  assert.equal(encode(new Buffer('ff00fe01', 'hex'), 'hex'), '60ff00fe01');

  // Arrays are just a series of values terminated with a null byte
  assert.equal(encode([ true, -1.2345 ], 'hex'), 'a02141c00c3f7ced91687200');

  // Strings are also legible when embedded in complex structures like arrays
  // Items in arrays are deliminted by null bytes, and a final end byte marks the end of the array
  assert.equal(encode([ 'foo' ]), '\xa0pfoo\x00\x00');

  // The 0x01 and 0xfe bytes are used to escape high and low bytes while preserving the correct collation
  assert.equal(encode([ new Buffer('ff00fe01', 'hex') ], 'hex'), 'a060fefe0101fefd01020000');

  // Complex types like arrays can be arbitrarily nested, and fixed-sized types don't require a terminating byte
  assert.equal(encode([ [ 'foo', true ], 'bar' ]), '\xa0\xa0\pfoo\x00\x21\x00\pbar\x00\x00');

  // Objects are just string-keyed maps, stored like arrays: [ k1, v1, k2, v2, ... ]
  assert.equal(encode({ foo: true, bar: 'baz' }), '\xb0pfoo\x00\x21\pbar\x00\pbaz\x00\x00');
  
  ```


`decode` parses a buffer and returns the structured data, or throws if malformed:
  
  ``` js
  var samples = [
    'foo √',
    null,
    '',
    new Date('2000-01-01T00:00:00Z'),
    42,
    undefined,
    [ undefined ],
    -1.1,
    {},
    [],
    true,
    { bar: 1 },
    [ { bar: 1 }, { bar: [ 'baz' ] } ],
    -Infinity,
    false
  ];
  var result = samples.map(bytewise.encode).map(bytewise.decode);
  assert.deepEqual(samples, result);
  ```


`compare` is just a convenience bytewise comparison function:

  ``` js
  var sorted = [
    null,
    false,
    true,
    -Infinity,
    -1.1,
    42,
    new Date('2000-01-01T00:00:00Z'),
    '',
    'foo √',
    [],
    [ { bar: 1 }, { bar: [ 'baz' ] } ],
    [ undefined ],
    {},
    { bar: 1 },
    undefined
  ];

  var result = samples.map(bytewise.encode).sort(bytewise.compare).map(bytewise.decode);
  assert.deepEqual(sorted, result);
  ```


## Use Cases

### Numeric indexing

This is surprisingly difficult to with vanilla LevelDB -- basic approaches require ugly hacks like left-padding numbers to make them sort lexicographically (which is prone to overflow problems). You could write a one-off comparator function in C, but there a number of drawbacks to this as well. This serializaiton solves this problem in a clean and generalized way, in part by taking advantage of properties of the byte sequences defined by the IEE 754 floating point standard.

### Namespaces, partitions and patterns

This is another really basic and oft-needed ammenity that isn't very easy out of the box in LevelDB. We reserve the lowest and highest bytes as abstract tags representing low and high key sentinals, allowing you to faithfully request all values in any portion of an array. Arrays can be used as namespaces without any leaky hacks, or even more detailed slicing can be done per element to implement wildcards or even more powerful pattern semantics for specific elements in the array keyspace.

### Document storage

It may be reasonably fast to encode and decode, but `JSON.stringify` is totally useless for storing objects as document records in a way that is of any use for range queries, where LevelDB and its ilk excel. This serialization allows you to build indexes on top of your documents, as well as expanding on the range of serializable types available in JSON.

### Multilevel language-sensitive collation

You have a bunch of strings in a paritcular language-specific strings you want to index, but at the time of indexing you're not sure *how* sorted you need them. Queries may or may not care about case or punctionation differences, for instance. You can index your string as an array of weights, most-to-least specific, and prefixed by collation language (since our values are language-sensitive). There are [mechanisms available](http://www.unicode.org/reports/tr10/#Run-length_Compression) to compress this array to keep its size reasonable.

### Full-text search

Full-text indexing is a natural extension of the language-sensitive collation use case described above. Add a little lexing and stemming and basic full text search is close at hand. Structured indexes can be employed to make other more interesting search features possible as well.

### CouchDB-style "joins"

Build a view that colocates related subrecords, taking advantage of component-wise sorting of arrays to interleave them. This is a technique I first saw [employed by CouchDB](http://www.cmlenz.net/archives/2007/10/couchdb-joins). More recently [Akiban](http://www.akiban.com/) has formalized this concept of [table grouping](http://blog.akiban.com/how-does-table-grouping-compare-to-sql-server-indexed-views/) and brought it the SQL world. Our collation extends naturally to their idea of [hierarchical keys](http://blog.akiban.com/introducing-hkey/).

### Emulating other systems

Clients that wish to employ a subset of the full range of possible types above can preprocess values to coerce them into the desired simpler forms before serializing. For instance, if you were to build CouchDB-style indexing you could round-trip values through a `JSON` encode cycle (to get just the subset of types supported by CouchDB) before passing to `encode`, resulting in a collation that is identical to CouchDB. Emulating IndexedDB's collation would at least require preprocessing away `Buffer` data and `undefined` values and normalizing for the es6 types.


## License

[MIT](http://deanlandolt.mit-license.org/)
