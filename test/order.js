var bytewise = require('../')
var typewise = require('typewise')
var util = require('typewise-core/test/util')
var test = require('tape')
var bops = require('bops')

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
]

var sample = util.shuffle(expected.slice()).sort(typewise.compare)
var sorted = expected.slice().sort(typewise.compare)

test('sorts in expected order', function (t) {
  t.equal(
    bops.to(bytewise.encode(sorted), 'hex'),
    bops.to(bytewise.encode(expected), 'hex')
  )
  t.equal(
    bops.to(bytewise.encode(sample), 'hex'),
    bops.to(bytewise.encode(expected), 'hex')
  )
  t.end()
})

test('sorts with same order when encoded', function (t) {
  var decoded = expected
    .map(bytewise.encode)
    .sort(bytewise.compare)
    .map(bytewise.decode);

  t.equal(
    bops.to(bytewise.encode(decoded), 'hex'),
    bops.to(bytewise.encode(expected), 'hex')
  )
  t.end()
})
