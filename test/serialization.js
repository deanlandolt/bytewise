'use strict';

var bytewise = require('../bytewise');
var typewise = require('typewise');
var util = require('typewise/test/util');

var sample, shuffled;

sample = util.getSample();
shuffled = util.shuffle(sample.slice());
typewise.equal(sample, shuffled.map(bytewise.encode).sort(bytewise.compare).map(bytewise.decode));

sample = util.getArraySample(2);
shuffled = util.shuffle(sample.slice());
typewise.equal(sample, shuffled.map(bytewise.encode).sort(bytewise.compare).map(bytewise.decode));

sample = util.shuffle(sample.slice());
var hash = {
  start: true,
  hash: sample,
  nested: {
    list: [ sample ]
  },
  end: {}
};
typewise.equal(sample, bytewise.decode(bytewise.encode(sample)));
