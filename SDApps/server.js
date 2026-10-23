const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const DB_DIR = path.join(__dirname, 'Database');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname, { index: 'index.html' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/db/:file', (req, res) => {
  const file = req.params.file;
  if (!file.endsWith('.json') || file.includes('..') || file.includes('/')) {
    return res.status(400).send('bad file');
  }
  fs.readFile(path.join(DB_DIR, file), 'utf8', (err, data) => {
    if (err) return res.status(404).send('not found');
    res.type('application/json').send(data);
  });
});

app.post('/save', (req, res) => {
  const file = req.query.file;
  if (!file || !file.endsWith('.json') || file.includes('..') || file.includes('/')) {
    return res.status(400).send('bad file');
  }
  fs.writeFile(path.join(DB_DIR, file), JSON.stringify(req.body, null, 2), err => {
    if (err) return res.status(500).send(err.message);
    res.send('ok');
  });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`SDApp running at http://localhost:${PORT}`));