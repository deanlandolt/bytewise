'use strict';
var bytewise = require('bytewise');

// This is just a simple little benchmark to compare against JSON
function bench(fn, value, runs) {
  var start = Date.now();
  while (runs--) {
    fn(value);
  }
  return Date.now() - start;
}

function log(name, time) {
  console.log(name, ':', time, 'ms');
}

module.exports = bench;

if (require.main === module) {
  var sample = [
    null,
    undefined,
    false,
    true,
    {},
    {
      a: null,
      b: [
        'nested array',
        { bb: 'nested object' }
      ],
      c: 'string value',
      d: 123.456,
      e: new Date('2000')
    },
    [],
    [ 'another', 'array' ]
  ];

  var count = 10000;
  log('JSON.stringify', bench(JSON.stringify, sample, count));
  log('bytewise.encode', bench(bytewise.encode, sample, count));

  log('JSON.parse', bench(JSON.parse, JSON.stringify(sample), count));
  log('bytewise.decode', bench(bytewise.decode, bytewise.encode(sample), count));
}
