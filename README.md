bytewise
========

This library defines a total order of possible data structures allowed in a keyspace. This order happens to be a superset of both the sorting algorithm defined by [IndexedDB](http://www.w3.org/TR/IndexedDB/#key-construct) and the one defined by [CouchDB](http://wiki.apache.org/couchdb/View_collation). This should make it easy to embed the useful approaches afforded by structured indexing into systems with fast but dumb bytewise comparators such as the default sort in leveldb.


## Collation of Supported Structures

This is the sort order of the various structures that can be encoded:

* `null`
* `false`
* `true`
* `number` (numeric)
* `date` (numeric, epoch offset)
* `buffer` (bitwise)
* `string` (lexicographic)
* `array` (componentwise)
* `map` (componentwise key/value pairs)
* `set` (componentwise, values sorted)
* `function` (stringified lexicographic)
* `undefined`


These specific structures can be used to serialize the vast majority of javascript values in a way that can be sorted in an efficient, complete and sensible manner. Each value is prefixed with a type tag, and we do some bit munging to encode our values in a way that carefully preserves the desired sort behavior even in the precense of structural nested. Negative numbers are stored as a different type from positive numbers, inverted to ensure numbers with a larger magnitude come first. Positive and negative `Infinity` can also be encoded. Values of `Date` types are stored similarly to numbers, but as in indexeddb, they sort after all numbers, including `Infinity`. Binary data can be stored in the raw, and is sorted before string data. Then come the collection types -- arrays, objects (as well as other non-string-keyed maps), sets and even functions.


## Unsupported Structures

This serialization accomodates a wide range of javascript structures, but it is not exhaustive. Objects or arrays with reference cycles, for instance, cannot be serialized. NaNs are also illegal as their presense is very likely indicative of a calculation error, and sorting NaNs is nonsensical anyway. (Similarly we may want to reject objects which are instances of `Error`.) Attempts to serialize any values which include these structures will throw an error.


## Properties

This sort order has some useful properties. For instance, `undefined` can serve as a high-key sentinal in range requests. If end key is `undefined` the range will extend all the way to its end. Similarly `null` gives us a the low-key sentinal since it always sorts first.

Clients that wish to employ a subset of the full range of possible types above should preprocess any objects to transform them into simpler forms before serializing. For instance, if you wanted to build couchdb-style indexing you could round-trip values through a JSON encode cycle (to get just the subset of types supported by couchdb) before passing to `encode`.

This collation should be easy to extend to indexeddb as well. It is specifically designed as a superset of the collation defined for indexeddb so we can use array structures type prefixed array structures and otherwise fall back on indexeddb's sort where possible.


## Usage

`encode` serializes any supported type and returns a buffer, or throws if an unsupported structure is passed:
  
  ``` js
  var result = bytewise.encode([ 42, [ 'foo' ] ]);
  var buffer = new Buffer([ 0xa0,0x45,0x40,0x45,0,0,0,0,0,0,0xa0,0x90,0x67,0x70,0x70,0,0,0 ]);
  assert.deepEqual(buffer, result);
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
    -1.1,
    {},
    true,,
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
    {},
    undefined
  ];

  var result = samples.map(bytewise.encode).sort(bytewise.compare).map(bytewise.decode);
  assert.deepEqual(sorted, result);
  ```


## Future

The ordering chosen for some of the types is somewhat arbitrary. It is intentionally structured to support the structural sorts defined by couchdb and indexeddb but there might be more logical placements, specifically for BUFFER, SET, and FUNCTION. For instance we may want to draw a distinction between collections that preserve order and those that don't. We may want another distinction on whether duplicate keys are allowed.


## License

[MIT](http://deanlandolt.mit-license.org/)
