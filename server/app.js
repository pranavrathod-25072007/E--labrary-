'use strict';
/**
 * E-Library — application server (application tier of the three-tier
 * architecture described in Chapter 4 of the report).
 *
 *   presentation tier : static HTML5 / CSS3 / JS in  public/
 *   application tier  : this Express server + REST API in server/
 *   data tier         : SQLite (default) or MySQL (DB_DRIVER=mysql)
 *
 * Start with:  npm start        (first run creates & seeds the database)
 */
const path = require('node:path');
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const { seed } = require('./seed');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(db.ROOT, 'public');
const UPLOADS_DIR = path.join(db.ROOT, 'uploads');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(auth.attachUser);

/* ------------------------------- API -------------------------------- */
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/books'));
app.use('/api/notices', require('./routes/notices'));
app.use('/api/admin', require('./routes/admin'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

/* ----------------------------- static ------------------------------- */
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use((req, res) => {
  res.status(404).type('html').send(
    '<!doctype html><meta charset="utf-8"><title>404 – E-Library</title>' +
    '<div style="font:16px/1.6 system-ui;text-align:center;padding:80px 20px">' +
    '<h1 style="font-size:52px;margin:0">404</h1><p>This page does not exist in the library.</p>' +
    '<a href="/" style="color:#4f46e5">Back to home</a></div>'
  );
});

/* eslint-disable no-unused-vars */
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Something went wrong on the server.' });
});

/* ------------------------------ start ------------------------------- */
(async () => {
  await db.init();
  await seed();
  app.listen(PORT, () => {
    console.log('----------------------------------------------------------');
    console.log('  E-Library is running  →  http://localhost:' + PORT);
    console.log('  database: ' + (db.DRIVER === 'mysql' ? 'MySQL' : 'SQLite (data/e-library.db)'));
    console.log('  admin   : librarian@jscoe.edu.in / admin123');
    console.log('  student : pranav.rathod@jscoe.edu.in / student123');
    console.log('----------------------------------------------------------');
  });
})().catch((err) => {
  console.error('Failed to start E-Library:', err);
  process.exit(1);
});
