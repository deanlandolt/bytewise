'use strict';
var bytewise = require('../bytewise');

// This is just a simple little benchmark to compare against JSON
function run(name, fn, value, total) {
  var start = Date.now();
  while (total--) {
    fn(value);
  }
  var time = Date.now() - start;
  console.log(name, ':', time, 'ms');
  return time;
}

// The case we'll want to optimize for is (possibly nested) arrays of primitives
var sample = [ 'foo', 123, [ 'bar', -4.56 ] ];

exports.all = function(total) {
  console.log(total + ' runs each:');
  run('JSON.stringify', JSON.stringify, sample, total);
  run('bytewise.encode', bytewise.encode, sample, total);

  run('JSON.parse', JSON.parse, JSON.stringify(sample), total);
  run('bytewise.decode', bytewise.decode, bytewise.encode(sample), total);
};

if (require.main === module) exports.all(10000);
