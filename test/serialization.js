'use strict';

var bytewise = require('../bytewise');
var typewise = require('typewise');
var util = require('typewise/test/util');

var sample = util.getSample();
var shuffled = util.shuffle(sample.slice());
typewise.equal(sample, shuffled.map(bytewise.encode).sort(bytewise.compare).map(bytewise.decode));

var sample = util.getArraySample(2);
var shuffled = util.shuffle(sample.slice());
typewise.equal(sample, shuffled.map(bytewise.encode).sort(bytewise.compare).map(bytewise.decode));
