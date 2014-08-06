// Mock the filesystem.
var fs = require('fs');
var fsCopy = {};
for (var property in fs) {
  fsCopy[property] = fs[property];
}

var files = {
  'assets/ok.json': '{"success": true}',
  'assets/fail.json': '{fail}'
};

fs.readFile = function (path, errBack) {
  var string = files[path];
  if (string) {
    errBack(null, new Buffer(string, 'utf8'));
  }
  else {
    throw new Error('File not found');
  }
};


require('./flow.js');
