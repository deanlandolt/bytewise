
var bytewise = require('../');
var bytewiseHex = require('../hex');
var typewise = require('typewise');
var test = require('tape');
var bops = require('bops');

var example = [
  null,
  0.304958230,
  true,
  4,
  'hello',
  [ 'foo', 'bar', 'baz' ],
  { k: 'X', b: false },
  { k: 'X', b: true },
  { whatever: false },
  { whatever: true }
].sort(typewise.compare);

test('sorts with same order when encoded', function (t) {
  var sorted = example
    .map(bytewise.encode)
    .sort(bytewise.compare)
    .map(bytewise.decode);

  t.equal(
    bops.to(bytewise.encode(sorted),'hex'),
    bops.to(bytewise.encode(example),'hex')
  );
  t.end();
})

test('sorts with same order when hex encoded', function (t) {
  var sorted = example
    .map(bytewiseHex.encode)
    .sort()
    .map(bytewiseHex.decode);

  t.equal(
    bops.to(bytewise.encode(sorted),'hex'),
    bops.to(bytewise.encode(example),'hex')
  );
  t.end();
})


