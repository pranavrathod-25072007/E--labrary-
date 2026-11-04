'use strict';
/**
 * Catalogue routes: search with live availability, book detail, home stats.
 * (Chapter 5.2: "Book search and availability" and "Notice board".)
 */
const express = require('express');
const db = require('../db');

const router = express.Router();

async function decorate(books) {
  if (!books.length) return books;
  const files = await db.all(
    'SELECT book_id, file_type, file_path, file_name FROM digital_files'
  );
  const dues = await db.all(
    `SELECT book_id, MIN(due_date) AS earliest FROM issue_records
      WHERE return_date IS NULL GROUP BY book_id`
  );
  const fileMap = {};
  for (const f of files) {
    (fileMap[f.book_id] = fileMap[f.book_id] || []).push(f);
  }
  const dueMap = {};
  for (const d of dues) dueMap[d.book_id] = d.earliest;

  return books.map((b) => {
    const mine = fileMap[b.book_id] || [];
    return {
      ...b,
      status: Number(b.available_copies) > 0 ? 'Available' : 'Issued',
      earliest_due: dueMap[b.book_id] || null,
      has_pdf: mine.some((f) => f.file_type === 'PDF'),
      has_audio: mine.some((f) => f.file_type === 'Audio'),
    };
  });
}

/** GET /api/stats — figures used on the home page. */
router.get('/stats', async (req, res, next) => {
  try {
    const books = await db.get('SELECT COUNT(*) AS c FROM books');
    const copies = await db.get('SELECT COALESCE(SUM(total_copies), 0) AS c FROM books');
    const digital = await db.get('SELECT COUNT(DISTINCT book_id) AS c FROM digital_files');
    const files = await db.get('SELECT COUNT(*) AS c FROM digital_files');
    const notices = await db.get('SELECT COUNT(*) AS c FROM notices WHERE archived = 0');
    const members = await db.get("SELECT COUNT(*) AS c FROM users WHERE role <> 'admin'");
    res.json({
      books: Number(books.c),
      copies: Number(copies.c),
      digital: Number(digital.c),
      files: Number(files.c),
      notices: Number(notices.c),
      members: Number(members.c),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/books?q=&status=&digital=&sort=&limit= */
router.get('/books', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const { status, digital, sort } = req.query;
    const limit = Math.min(Number(req.query.limit) || 0, 100);

    let rows = await db.all('SELECT * FROM books');
    if (q) {
      const needle = q.toLowerCase();
      const like = `%${q}%`;
      const matches = await db.all(
        `SELECT book_id FROM books
          WHERE title LIKE ? OR author LIKE ?
             OR subject LIKE ? OR isbn LIKE ?
             OR description LIKE ?`,
        [like, like, like, like, like]
      );
      const ids = new Set(matches.map((m) => m.book_id));
      rows = rows.filter((r) => ids.has(r.book_id) ||
        [r.title, r.author, r.subject, r.isbn, r.description]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)));
    }

    let books = await decorate(rows);

    if (status === 'available') books = books.filter((b) => b.status === 'Available');
    if (status === 'issued') books = books.filter((b) => b.status === 'Issued');
    if (digital === 'pdf') books = books.filter((b) => b.has_pdf);
    if (digital === 'audio') books = books.filter((b) => b.has_audio);

    if (sort === 'new') books.sort((a, b) => String(b.added_on).localeCompare(String(a.added_on)));
    else books.sort((a, b) => String(a.title).localeCompare(String(b.title)));

    const total = books.length;
    if (limit > 0) books = books.slice(0, limit);
    res.json({ books, total });
  } catch (err) {
    next(err);
  }
});

/** GET /api/books/:id — full detail for the book page. */
router.get('/books/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await db.get('SELECT * FROM books WHERE book_id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Book not found.' });
    const [book] = await decorate([row]);
    const files = await db.all(
      'SELECT file_id, file_type, file_name, file_path, uploaded_on FROM digital_files WHERE book_id = ?',
      [id]
    );
    const open = await db.get(
      'SELECT COUNT(*) AS c FROM issue_records WHERE book_id = ? AND return_date IS NULL',
      [id]
    );
    res.json({ book, files, open_issues: Number(open.c) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
