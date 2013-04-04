'use strict';

var bytewise = require('../bytewise');

var samples = {
  empty: [
    void 0,
    null
  ],
  boolean: [
    false,
    true
  ],
  number: [
    Number.NEGATIVE_INFINITY,
    -Number.MAX_INTEGER,
    -1000,
    -100,
    -10,
    -3,
    -2,
    -1,
    -0.1,
    -0.01,
    -0.001,
    -Number.EPSILON * 2,
    -Number.EPSILON,
    -0,
    0,
    Number.EPSILON,
    Number.EPSILON * 2,
    0.001,
    0.01,
    0.1,
    1,
    2,
    3,
    10,
    100,
    1000,
    Number.MAX_INTEGER,
    Number.POSITIVE_INFINITY
  ],
  date: [
    new Date(-1),
    new Date(-0),
    new Date(0),
    new Date(1),
    new Date('2001-09-09T01:46:39.999Z'),
    new Date(1000000000000),
    new Date('2001-09-09T01:46:40.001Z')
  ],
  buffer: [
    new Buffer([]),
    new Buffer([ 0 ]),
    new Buffer([ 0, 0 ]),
    new Buffer([ 0, 1 ]),
    new Buffer([ 1, 0 ]),
    new Buffer([ 1, 1 ]),
    new Buffer([ 255 ]),
    new Buffer([ 255, 0 ]),
    new Buffer([ 255, 255 ])
  ],
  string: [
    '',
    '\x00',
    '\x00\x00',
    '\x00\x01',
    '\x00\xff',
    'AA',
    'AB',
    'Aa',
    'Ab',
    'a',
    'aa',
    'ab',
    'b',
    'ba',
    'bb',
    '\xff',
    '\xff\x00',
    '\xff\xfe',
    '\xff\xff'
  ]
};

function shuffle(o) {
  for (var j, x, i = o.length; i; j = parseInt(Math.random() * i, 10), x = o[--i], o[i] = o[j], o[j] = x);
  return o;
}

var assert = require('assert');
function listEqual(a, b) {
  // TODO stringify functions
  // TODO test number and date value for -0
  return assert.deepEqual(a, b);
}

function getSample() {
  var sample = [];
  Object.keys(samples).forEach(function(key) {
    sample = sample.concat(samples[key]);
  });
  return sample;
}


var sample = getSample();
var shuffled = shuffle(sample.slice());
listEqual(sample, shuffled.map(bytewise.encode).sort(bytewise.compare).map(bytewise.decode));


function getArraySample(depth) {
  var sample = getSample();
  if (!depth) return sample;
  sample.forEach(function(item) {
    sample.push([ item ]);
  });
  sample.push([ getArraySample(depth - 1) ]);
  return sample;
}

var sample = getArraySample(2);
var shuffled = shuffle(sample.slice());
listEqual(sample, shuffled.map(bytewise.encode).sort(bytewise.compare).map(bytewise.decode));

// TODO we need specific array samples with mixed
// We also need tests with specific samples for objects and other maps, sets, and functions
// We need to expand on the string samples with multibyte utf-8 and characters outside BMP
