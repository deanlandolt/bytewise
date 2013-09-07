var bops = require('bops');
var bytewise = require('./');

exports.encode = function (val) {
  return bops.to(bytewise.encode(val), 'hex');
};

exports.decode = function (val) {
  return bytewise.decode(bops.from(val, 'hex'));
};

exports.buffer = false;
exports.type = 'bytewise-hex';
