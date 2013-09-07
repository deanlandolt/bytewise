// Find and require all test modules

var fs = require('fs');
fs.readdirSync(__dirname).filter(function(filename) {
  return filename.match(/\.js$/) && filename != 'index.js';
}).forEach(function(filename) {
  require('./' + filename);
});
