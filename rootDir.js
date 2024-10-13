let fs   = require('fs'),
    path = require('path');

module.exports = function(dir) {
  while(!fs.existsSync(path.join(dir, 'package.json'))) {
    dir = dir.replace(path.sep+path.basename(dir), '')    
  }
  return dir
}