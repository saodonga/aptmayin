const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.js')) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes("This page couldn't load")) {
          results.push(file);
        }
      }
    }
  });
  return results;
}
console.log(walk('node_modules/next/dist'));
