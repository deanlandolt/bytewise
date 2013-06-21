bytewise
========

A binary serialization which sorts bytewise for arbitrarily complex data structures, respecting [typewise](https://github.com/deanlandolt/typewise) structured sorting efficiently.

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

For example, negative numbers are stored as a different *type* from positive numbers, with its sign bit stripped and its bytes inverted to ensure numbers with a larger magnitude come first. `Infinity` and `-Infinity` can also be encoded -- they are *nullary* types, encoded using just their type tag., same with `null` and `undefined`, and the boolean values `false`, `true`, . `Date` instances are stored just like `Number` instances, but as in IndexedDB, `Date` sorts after `Number` (including `Infinity`). `Buffer` data can be stored in the raw, and is sorted before `String` data. Then come the collection types -- `Array`, `Object`, along with the additional types defined by es6: `Map` and `Set`. We can even serialize `Function` values, reviving them in an isolated [Secure ECMAScript](https://code.google.com/p/es-lab/wiki/SecureEcmaScript) context where they can't do anything but calculate.


## Unsupported Structures

This serialization accomodates a wide range of javascript structures, but it is not exhaustive. Objects or arrays with reference cycles, for instance, cannot be serialized. `NaN` is also illegal anywhere in a serialized value, as its presense is very likely indicative of an error. Moreover, sorting for `NaN` is completely nonsensical. (Similarly we may want to reject objects which are instances of `Error`.) Invalid `Date` objects are also illegal. Attempts to serialize any values which include these structures will throw a `TypeError`.


## Usage

`encode` serializes any supported type and returns a buffer, or throws if an unsupported structure is passed:
  
  ``` js
  var bytewise = require('bytewise');
  var assert = require('assert');
  function hexEncode(buffer) { return bytewise.encode(buffer).toString('hex') }

  // Many types can be respresented using only their type tag, a single byte
  // WARNING type tags are subject to change for the time being!
  assert.equal(bytewise.encode(null).toString('binary'), '\x10');
  assert.equal(bytewise.encode(false).toString('binary'), '\x20');
  assert.equal(bytewise.encode(true).toString('binary'), '\x21');
  assert.equal(bytewise.encode(undefined).toString('binary'), '\xe0');

  // Numbers are stored in 9 bytes -- 1 byte for the type tag and an 8 byte float
  assert.equal(hexEncode(12345), '4240c81c8000000000');
  // Negative numbers are stored as positive numbers, but with a lower type tag and their bits inverted
  assert.equal(hexEncode(-12345), '41bf37e37fffffffff');

  // All numbers, integer or floating point, are stored as IEEE 754 doubles
  assert.equal(hexEncode(1.2345), '423ff3c083126e978d');
  assert.equal(hexEncode(-1.2345), '41c00c3f7ced916872');

  // Serialization does not preserve the sign bit, so 0 is indistinguishable from -0
  assert.equal(hexEncode(-0), '420000000000000000');
  assert.equal(hexEncode(0), '420000000000000000');

  // We can even serialize Infinity and -Infinity, though we just use their type tag
  assert.equal(hexEncode(-Infinity), '40');
  assert.equal(hexEncode(Infinity), '43');

  // Dates are stored just like numbers, but with different (and higher) type tags
  assert.equal(hexEncode(new Date(-12345)), '51bf37e37fffffffff');
  assert.equal(hexEncode(new Date(12345)), '5240c81c8000000000');

  // Strings are as utf8 prefixed with their type tag
  assert.equal(hexEncode('foo'), '70666f6f');

  // That same string encoded in the raw
  assert.equal(bytewise.encode('foo').toString('binary'), '\x70foo')

  // Buffers are completely left alone, other than being prefixed with their type tag
  assert.equal(hexEncode(new Buffer('ff00fe01', 'hex')), '60ff00fe01');

  // Arrays are just a series of values terminated with a null byte
  assert.equal(hexEncode([ true, -1.2345 ]), 'a02141c00c3f7ced91687200');

  // When embedded in complex structures (like arrays) Strings and Buffers have their bytes shifted
  // to make way for a null termination byte to signal their end
  assert.equal(hexEncode([ 'foo' ]), 'a0706770700000');

  // That same string encoded in the raw -- note the 'gpp', the escaped version of 'foo'
  assert.equal(bytewise.encode(['foo']).toString('binary'), '\xa0\x70gpp\x00\x00');

  // The 0xff byte is used as an escape to encode 0xfe and 0xff bytes, preserving the correct collation
  assert.equal(hexEncode([ new Buffer('ff00fe01', 'hex') ]), 'a060ffff01fffe020000');

  // Complex types like arrays can be arbitrarily nested, and fixed-sized types never need a terminating byte
  assert.equal(hexEncode([ [ true, 'foo' ], -1.2345 ]), 'a0a02170677070000041c00c3f7ced91687200');

  // Objects are just string-keyed maps, stored like arrays: [ k1, v1, k2, v2, ... ]
  assert.equal(hexEncode({ foo: true, bar: -1.2345 }), 'b0706770700021706362730041c00c3f7ced91687200');
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

This is surprisingly difficult to with vanilla LevelDB -- basic approaches require ugly hacks like left-padding numbers to make them sort lexicographically (which is prone to overflow problems). You could write a one-off comparator function in C, but there a number of drawbacks to this as well. This serializaiton solves this problem in a clean, generalizable way, taking advantage of properties of the byte sequences defined by the IEE 754 floating point standard.

### Namespaces, partitions and patterns

This is another really basic and oft-needed ammenity that isn't very easy out of the box in LevelDB. We reserve the lowest and highest bytes as abstract tags representing low and high key sentinals, allowing you to faithfully request all values in any portion of an array. Arrays can be used as namespaces without any leaky hacks, or even more detailed slicing can be done per element to implement wildcards or even more powerful pattern semantics for specific elements in the array keyspace.

### Document storage

It may be reasonably fast to encode and decode, but `JSON.stringify` is totally useless for storing objects as document records in a way that is of any use for range queries, where LevelDB and its ilk excel. Our serialization allows you to build indexes on top of your documents. Being unable to indexing purposes since it doesn't sort correctly. We fix that, and even expand on the range of serializable types available.

### Multilevel language-sensitive collation

You have a bunch of strings in a paritcular language-specific strings you want to index, but at the time of indexing you're not sure *how* sorted you need them. Queries may or may not care about case or punctionation differences, for instance. You can index your string as an array of weights, most-to-least specific, and prefixed by collation language (since our values are language-sensitive). There are [mechanisms available](http://www.unicode.org/reports/tr10/#Run-length_Compression) to compress this array to keep its size reasonable.

### Full-text search

Full-text indexing is a natural extension of the language-sensitive collation use case described above. Add a little lexing and stemming and basic full text search is close at hand. Structured indexes can be employed to make other more interesting search features possible as well.

### CouchDB-style "joins"

Build a view that colocates related subrecords, taking advantage of component-wise sorting of arrays to interleave them. This is a technique I first saw [employed by CouchDB](http://www.cmlenz.net/archives/2007/10/couchdb-joins). More recently [Akiban](http://www.akiban.com/) has formalized this concept of [table grouping](http://blog.akiban.com/how-does-table-grouping-compare-to-sql-server-indexed-views/) and brought it the SQL world. Our collation extends naturally to their idea of [hierarchical keys](http://blog.akiban.com/introducing-hkey/).

### Emulating other systems

Clients that wish to employ a subset of the full range of possible types above can preprocess values to coerce them into the desired simpler forms before serializing. For instance, if you were to build CouchDB-style indexing you could round-trip values through a `JSON` encode cycle (to get just the subset of types supported by CouchDB) before passing to `encode`, resulting in a collation that is identical to CouchDB. Emulating IndexedDB's collation would require preprocessing away `Buffer` data and `undefined` values. (TODO what else? Does it normalize `-0` values to `0`?)

### Embedding in the browser

While this particular serialization is only useful for binary indexing, the collation defined can easily be extended to embed inside indexeddb. At the top level all values would be arrays with the type tag as the first value. Any binary data would have be transcoded to a string in a manner that preserves sort order. Otherwise we can lean on IndexedDB's default sort behavior as much as possible.


## Future

### Generic collections

The ordering chosen for some of the types is somewhat arbitrary. It is intentionally structured to support those sorts defined by CouchDB and IndexedDB but there might be more logical placements, specifically for BUFFER, SET, and FUNCTION, which aren't defined in either. It may be beneficial to fully characterize the distinctions between collections that affect collation.
  
One possible breakdown for collection types:

* unordered set (order unimportant and thus sorted using standard collation)
  * unordered multiset, duplicates allowed
* chain (ordered set) (order-preserving with distinct values)
  * ordered multiset, duplicates allowed (an array or tuple)
* unordered map (keys as unordered set, objects are string-keyed maps)
  * unordered multimap (keys as unordered multiset), duplicates allowed
* ordered map (keys as ordered set)
  * ordered multimap (keys as ordered multiset), duplicates allowed

Perhaps we should always allow duplicates, and have the prevention of duplicates be a enforced at runtime by a schema of some sort.

The primary distinction between collections are whether their items are unary (sets or arrays of elements) or binary (maps of keys and values). The secondary distinction is whether the collection preserves the order of its elements or not. For instance, arrays preserve the order of their elements while sets do not. Maps typically don't either, nor do javascript objects (even if they appear to at first). These are the two bits which characterize collection types that globally effect the sorting of the types.

There is a third characterizing bit: whether or not duplicates are allowed. The effect this has on sort is very localized, only for breaking ties between two otherwise identical keys -- otherwise records are completely interwoven when sorted, regardless of whether duplicates are allowed or not.

We may want unique symbols to signal these characterizing bits for serialization.

We probably want hooks for custom revivers.

Sparse arrays could be modeled with sorted maps of integer keys, but should we use a trailer to preserve this data?

This is very close to a generalized total order for all possible data structure models.

### Performance

Encoding and decoding is surely slower than the native `JSON` functions, but there is plenty of room to narrow the gap. Once the serialization stabilizes a C port should be straitforward to narrow the gap further.

### Streams

Where this serialization should really shine is streaming. Building a stream from individually encoded elements should require little more than strait concatenation, and parsing a stream would be the same as parsing an array. Parsing is a little more complex than msgpack and many other binary encodings because we have to use termination characters, not length specifiers, for certain types to keep from screwing up our collation invariants. This also means we have to do a little escapement dance, which costs a little extra too.


## License

[MIT](http://deanlandolt.mit-license.org/)
