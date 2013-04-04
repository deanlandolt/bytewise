'use strict';

var vm = require('vm');
var fs = require('fs');
var path = require('path');
var source = fs.readFileSync(path.join(module.filename, '..', 'node_modules', 'ses', 'initSes.js'), 'utf8');

module.exports = function(sandbox) {
  // Make a shallow copy of the sandbox object
  var copy = {};
  Object.keys(sandbox).forEach(function(key) {
    copy[key] = sandbox[key];
  });

  // Intantiate a new SES context
  vm.runInNewContext(source, copy, 'initSes.js');
  return {
    Function: copy.Function
  };
};
