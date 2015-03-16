
var bytewise = require('../');
var bytewiseHex = require('../hex');
var typewise = require('typewise');
var test = require('tape');
var bops = require('bops');

var expected = [
  null,
  true,
  0.304958230,
  4,
  'hello',
  [ 'foo', 'bar', 'baz' ],
  { k: 'X', b: false },
  { k: 'X', b: true },
  { k: 'X', c: false },
  { k: 'X', c: true },
  { k: 'X', c: true, d: null },
  { whatever: false },
  { whatever: true }
];
var sorted = expected.sort(typewise.compare);

test('sorts in expected order', function (t) {
  t.equal(
    bops.to(bytewise.encode(sorted), 'hex'),
    bops.to(bytewise.encode(expected), 'hex')
  );
  t.end();
});

test('sorts with same order when encoded', function (t) {
  var encoded = expected
    .map(bytewise.encode)
    .sort(bytewise.compare)
    .map(bytewise.decode);

  t.equal(
    bops.to(bytewise.encode(encoded), 'hex'),
    bops.to(bytewise.encode(expected), 'hex')
  );
  t.end();
});

test('sorts with same order when hex encoded', function (t) {
  var encoded = expected
    .map(bytewiseHex.encode)
    .sort()
    .map(bytewiseHex.decode);

  t.equal(
    bops.to(bytewise.encode(encoded), 'hex'),
    bops.to(bytewise.encode(expected), 'hex')
  );
  t.end();
});
