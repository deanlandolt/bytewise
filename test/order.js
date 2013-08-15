
var bytewise = require('../')
var typewise = require('typewise')
var test = require('tap').test
var bops = require('bops')

var example = [
  null,
  0.304958230,
  true,
  4,
  'hello',
  ['foo', 'bar', 'baz'],
  {whatever: {}},
  //this breaks  
  //{k: 'X'}
].sort(typewise.compare)

test('sorts with same order when encoded', function (t) {

  var sorted = 
  example
    .map(bytewise.encode)
    .sort(bytewise.compare)
    .map(bytewise.decode)

  t.deepEqual(sorted, example)
  t.end()
})

test('sorts with same order when hex encoded', function (t) {

  var sorted = 
  example
    .map(bytewise.hex.encode)
    .sort()
    .map(bytewise.hex.decode)

  t.deepEqual(sorted, example)
  t.end()
})


