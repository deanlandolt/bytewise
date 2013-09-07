'use strict';

var bytewise = require('../bytewise');
var typewise = require('typewise');
var util = require('typewise/test/util');
var tape = require('tape');
var bops = require('bops');

var sample, shuffled;

function eq(t, a, b) {
  t.equal(a.length, b.length);
  a.forEach(function (_, i) {
    var y = b[i];
    var _a = bops.to(bytewise.encode(a[i]), 'hex');
    var _b = bops.to(bytewise.encode(b[i]), 'hex');
    
    t.equal(_a, _b);

    if (_a != _b) {
      console.log('not equal:', a[i]);
      console.log('expected :', b[i]);
    }
  });
}

tape('equal', function (t) {
  sample = util.getSample();
  shuffled = util.shuffle(sample.slice());

  eq(t, sample,
    shuffled
      .map(bytewise.encode)
      .sort(bytewise.compare)
      .map(bytewise.decode)
  )

  sample = util.getArraySample(2);
  shuffled = util.shuffle(sample.slice());
  eq(t, sample,
    shuffled.map(bytewise.encode).sort(bytewise.compare).map(bytewise.decode)
  );
  sample = util.shuffle(sample.slice());
  t.end();
});

var hash = {
  start: true,
  hash: sample,
  nested: {
    list: [sample]
  },
  end: {}
};


tape('simple equal', function (t) {

  eq(t, sample, bytewise.decode(bytewise.encode(sample))) ;
  t.end();
});
