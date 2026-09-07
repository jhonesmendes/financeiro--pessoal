const http = require('http');
const fs = require('fs');
const path = require('path');
http.createServer((req, res) => {
  const file = path.join(__dirname, 'mockup-reference.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('error: ' + err.message);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}).listen(4173, () => console.log('serving on 4173'));
