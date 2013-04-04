bytewise
========

This library defines a total order of possible data structures allowed in a keyspace. This order happens to be a superset of both the sorting algorithm defined by [IndexedDB](http://www.w3.org/TR/IndexedDB/#key-construct) and the one defined by [CouchDB](http://wiki.apache.org/couchdb/View_collation). This should make it easy to embed the useful approaches afforded by structured indexing into systems with fast but dumb bytewise comparators such as the default sort in leveldb.


## Collation of Supported Structures

This is the sort order of the various structures that can be encoded:

* `null`
* `false`
* `true`
* `Number` (numeric)
* `Date` (numeric, epoch offset)
* `Buffer` (bitwise)
* `String` (lexicographic)
* `Set` (componentwise with elements sorted)
* `Array` (componentwise)
* `Map` (componentwise key/value pairs)
* `Function` (stringified lexicographic)
* `undefined`


These specific structures can be used to serialize the vast majority of javascript values in a way that can be sorted in an efficient, complete and sensible manner. Each value is prefixed with a type tag, and we do some bit munging to encode our values in a way that carefully preserves the desired sort behavior even in the precense of structural nested. Negative numbers are stored as a different type from positive numbers, inverted to ensure numbers with a larger magnitude come first. `Infinity` and `-Infinity` can also be encoded. `Date` instances are stored just like `Number` instances, but as in indexeddb, `Date` sorts after `Number` (including `Infinity`). `Buffer` data can be stored in the raw, and is sorted before `String` data. Then come the collection types -- `Array`, `Object`, along with the additional types defined by es6: `Map` and `Set`. We can even serialize `Function` values.


## Unsupported Structures

This serialization accomodates a wide range of javascript structures, but it is not exhaustive. Objects or arrays with reference cycles, for instance, cannot be serialized. `NaN` is also illegal anywhere in a serialized value, as its presense is very likely indicative of an error. Moreover, sorting for `NaN` is completely nonsensical. (Similarly we may want to reject objects which are instances of `Error`.) Invalid `Date` objects are also illegal. Attempts to serialize any values which include these structures will throw a `TypeError`.


## Properties

This sort order has some useful properties. For instance, `undefined` can serve as a high-key sentinal in range requests. If end key is `undefined` the range will extend all the way to its end. Similarly `null` gives us a the low-key sentinal since it always sorts first.

Clients that wish to employ a subset of the full range of possible types above should preprocess any objects to transform them into simpler forms before serializing. For instance, if you wanted to build couchdb-style indexing you could round-trip values through a `JSON` encode cycle (to get just the subset of types supported by couchdb) before passing to `encode`.

This collation should be easy to extend to indexeddb as well. It is specifically designed as a superset of the collation defined for indexeddb so we can use type-prefixed array structures and lean on indexeddb's default sort behavior wherever possible.


## Usage

`encode` serializes any supported type and returns a buffer, or throws if an unsupported structure is passed:
  
  ``` js
  var bytewise = require('bytewise');
  var assert = require('assert');
  function hexEncode(buffer) { return bytewise.encode(buffer).toString('hex') }

  // Many types can be respresented using only their type tag, a single byte
  // WARNING type tags are subject to change for now!
  assert.equal(hexEncode(null), '10');
  assert.equal(hexEncode(false), '20');
  assert.equal(hexEncode(true), '21');
  assert.equal(hexEncode(undefined), 'ff');

  // Numbers are stored in 9 bytes -- 1 byte for the type tag and an 8 byte float
  assert.equal(hexEncode(12345), '4540c81c8000000000');
  // Negative numbers are stored as positive numbers, but with a lower type tag and their bits inverted
  assert.equal(hexEncode(-12345), '42bf37e37fffffffff');

  // All numbers, integer or floating point, are stored as IEEE 754 doubles
  assert.equal(hexEncode(1.2345), '453ff3c083126e978d');
  assert.equal(hexEncode(-1.2345), '42c00c3f7ced916872');

  // Serialization preserves the sign bit by default, so 0 is distinct from (but directly adjecent to) -0
  assert.equal(hexEncode(-0), '42ffffffffffffffff');
  assert.equal(hexEncode(0), '450000000000000000');

  // We can even serialize Infinity and -Infinity, though we just use their type tag
  assert.equal(hexEncode(-Infinity), '40');
  assert.equal(hexEncode(Infinity), '47');

  // Dates are stored just like numbers, but with different (and higher) type tags
  assert.equal(hexEncode(new Date(-12345)), '60bf37e37fffffffff');
  assert.equal(hexEncode(new Date(12345)), '6140c81c8000000000');

  // Top level Strings and Buffers are prefixed with their type tag but are otherwise left alone
  assert.equal(hexEncode('foo'), '80666f6f');
  assert.equal(hexEncode(new Buffer('ff00fe01', 'hex')), '70ff00fe01');

  // Arrays are just a series of values terminated with a null byte
  assert.equal(hexEncode([ true, -1.2345 ]), 'a02142c00c3f7ced91687200');

  // When embedded in complex structures (like arrays) Strings and Buffers have their bytes shifted
  // to make way for a null termination byte to signal their end
  assert.equal(hexEncode([ 'foo' ]), 'a0806770700000');

  // Here is the same encoded value as a raw string -- note the 'gpp', the escaped version of 'foo'
  assert.equal(bytewise.encode(['foo']).toString('binary'), '\xa0\x80gpp\x00\x00')

  // The 0xff byte is used as an escape to encode 0xfe and 0xff bytes, preserving the correct collation
  assert.equal(hexEncode([ new Buffer('ff00fe01', 'hex') ]), 'a070ffff01fffe020000');

  // Complex types like arrays can be arbitrarily nested, and fixed-sized types will never need a terminating byte
  assert.equal(hexEncode([ [ true, 'foo' ], -1.2345 ]), 'a0a02180677070000042c00c3f7ced91687200');

  // Objects are just string-keyed maps, stored like arrays: [ k1, v1, k2, v2, ... ]
  assert.equal(hexEncode({ foo: true, bar: -1.2345 }), 'b0806770700021806362730042c00c3f7ced91687200');
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
    true,
    [ { bar: [ 'baz' ] }, { bar: 1 } ],
    -Infinity,
    [],
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
    [ { bar: [ 'baz' ] }, { bar: 1 } ],
    [ undefined ],
    {},
    undefined
  ];

  var result = samples.map(bytewise.encode).sort(bytewise.compare).map(bytewise.decode);
  assert.deepEqual(sorted, result);
  ```


## Future

The ordering chosen for some of the types is somewhat arbitrary. It is intentionally structured to support those sorts defined by couchdb and indexeddb but there might be more logical placements, specifically for BUFFER, SET, and FUNCTION, which aren't defined in either. It may be beneficial to fully characterize the distinctions between collections that affect collation.
  
One possible breakdown for collection types:

* sorted set (order unimportant and thus sorted using standard collation)
  * sorted multiset, duplicates allowed
* ordered set (order-preserving with distinct values)
  * ordered multiset, duplicates allowed (an array or tuple)
* sorted map (keys as sorted set, objects are string-keyed maps)
  * sorted multimap (keys as sorted multiset), duplicates allowed
* ordered map (keys as ordered set)
  * ordered multimap (keys as ordered multiset), duplicates allowed

The primary distinction between collections are whether their items are unary (sets or arrays of elements) or binary (maps of keys and values). The secondary distinction is whether the collection preserves the order of its elements or not. For instance, arrays preserve the order of their elements while sets do not. Maps typically don't either, nor do javascript objects (even if they appear to at first). These are the two bits which characterize collection types that globally effect the sorting of the types.

There is a third characterizing bit: whether or not duplicates are allowed. The effect this has on sort is very localized, only for breaking ties between two otherwise identical keys -- otherwise records are completely interwoven when sorted, regardless of whether duplicates are allowed or not.

We may want unique symbols to signal these characterizing bits for serialization.

We probably want hooks for custom revivers.

Sparse arrays could be modeled with sorted maps of integer keys, but should we use a trailer to preserve this data?

This is very close to a generalized total order for all possible data structure models.


## License

[MIT](http://deanlandolt.mit-license.org/)
