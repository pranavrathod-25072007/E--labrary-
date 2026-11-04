'use strict';
/**
 * Administrator panel API — everything the librarian manages:
 * books, PDF / audio uploads, issue & return (availability), notices.
 * All routes require the admin role (role-based access, Table 4.2).
 */
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();
router.use(auth.requireAdmin);

const PDF_DIR = path.join(db.ROOT, 'uploads', 'pdfs');
const AUDIO_DIR = path.join(db.ROOT, 'uploads', 'audio');
fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac'];

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, file.fieldname === 'pdf' ? PDF_DIR : AUDIO_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'pdf' && ext !== '.pdf') {
      return cb(Object.assign(new Error('The PDF field only accepts .pdf files.'), { status: 400 }));
    }
    if (file.fieldname === 'audio' && !AUDIO_EXT.includes(ext)) {
      return cb(Object.assign(
        new Error(`The audio field accepts ${AUDIO_EXT.join(', ')} files.`), { status: 400 }));
    }
    cb(null, true);
  },
});

const fields = upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'audio', maxCount: 1 }]);

function unlinkQuiet(abs) {
  try {
    if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch { /* ignore */ }
}

function absOf(rel) {
  return path.join(db.ROOT, String(rel).replace(/\//g, path.sep));
}

/* ------------------------------- stats ------------------------------- */

router.get('/stats', async (req, res, next) => {
  try {
    const one = async (sql, p = []) => Number((await db.get(sql, p)).c);
    res.json({
      books: await one('SELECT COUNT(*) AS c FROM books'),
      copies: await one('SELECT COALESCE(SUM(total_copies), 0) AS c FROM books'),
      files: await one('SELECT COUNT(*) AS c FROM digital_files'),
      open_issues: await one('SELECT COUNT(*) AS c FROM issue_records WHERE return_date IS NULL'),
      overdue: await one("SELECT COUNT(*) AS c FROM issue_records WHERE return_date IS NULL AND due_date < ?",
        [db.today()]),
      members: await one("SELECT COUNT(*) AS c FROM users WHERE role <> 'admin'"),
      notices: await one('SELECT COUNT(*) AS c FROM notices WHERE archived = 0'),
      archived: await one('SELECT COUNT(*) AS c FROM notices WHERE archived = 1'),
    });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- books ------------------------------ */

async function adminBooks() {
  const books = await db.all('SELECT * FROM books ORDER BY title');
  const files = await db.all('SELECT * FROM digital_files');
  const open = await db.all(
    `SELECT book_id, COUNT(*) AS c, MIN(due_date) AS earliest
       FROM issue_records WHERE return_date IS NULL GROUP BY book_id`
  );
  const fMap = {};
  for (const f of files) (fMap[f.book_id] = fMap[f.book_id] || []).push(f);
  const oMap = {};
  for (const o of open) oMap[o.book_id] = o;
  return books.map((b) => ({
    ...b,
    status: Number(b.available_copies) > 0 ? 'Available' : 'Issued',
    open_issues: Number((oMap[b.book_id] || {}).c || 0),
    earliest_due: (oMap[b.book_id] || {}).earliest || null,
    files: fMap[b.book_id] || [],
  }));
}

router.get('/books', async (req, res, next) => {
  try {
    res.json({ books: await adminBooks() });
  } catch (err) {
    next(err);
  }
});

function bookFromBody(body) {
  const total = Math.max(1, parseInt(body.total_copies, 10) || 1);
  return {
    title: String(body.title || '').trim(),
    author: str(body.author),
    subject: str(body.subject),
    isbn: str(body.isbn),
    edition: str(body.edition),
    description: str(body.description),
    shelf_location: str(body.shelf_location),
    total_copies: total,
  };
}

function str(v) {
  const s = String(v == null ? '' : v).trim();
  return s === '' ? null : s;
}

async function saveFile(bookId, type, dir, incoming, remove) {
  const existing = await db.get(
    'SELECT * FROM digital_files WHERE book_id = ? AND file_type = ?', [bookId, type]
  );
  const file = (incoming || [])[0];
  const rel = type === 'PDF' ? '/uploads/pdfs/' : '/uploads/audio/';

  if (file) {
    if (existing) {
      unlinkQuiet(absOf(existing.file_path));
      await db.run('UPDATE digital_files SET file_path = ?, file_name = ?, uploaded_on = ? WHERE file_id = ?',
        [rel + file.filename, file.originalname, db.iso(), existing.file_id]);
    } else {
      await db.run(
        'INSERT INTO digital_files (book_id, file_type, file_name, file_path, uploaded_on) VALUES (?, ?, ?, ?, ?)',
        [bookId, type, file.originalname, rel + file.filename, db.iso()]
      );
    }
    return;
  }
  if (remove && existing) {
    unlinkQuiet(absOf(existing.file_path));
    await db.run('DELETE FROM digital_files WHERE file_id = ?', [existing.file_id]);
  }
}

router.post('/books', fields, async (req, res, next) => {
  try {
    const b = bookFromBody(req.body || {});
    if (!b.title) return res.status(400).json({ error: 'Book title is required.' });
    const r = await db.run(
      `INSERT INTO books (title, author, subject, isbn, edition, description,
                          total_copies, available_copies, shelf_location, added_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.title, b.author, b.subject, b.isbn, b.edition, b.description,
       b.total_copies, b.total_copies, b.shelf_location, db.today()]
    );
    const id = r.lastInsertRowid;
    await saveFile(id, 'PDF', PDF_DIR, req.files && req.files.pdf, false);
    await saveFile(id, 'Audio', AUDIO_DIR, req.files && req.files.audio, false);
    await db.recalcAvailable(id);
    res.status(201).json({ ok: true, book_id: id });
  } catch (err) {
    next(err);
  }
});

router.put('/books/:id', fields, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.get('SELECT * FROM books WHERE book_id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Book not found.' });
    const b = bookFromBody(req.body || {});
    if (!b.title) return res.status(400).json({ error: 'Book title is required.' });
    await db.run(
      `UPDATE books SET title = ?, author = ?, subject = ?, isbn = ?, edition = ?,
                        description = ?, total_copies = ?, shelf_location = ?
        WHERE book_id = ?`,
      [b.title, b.author, b.subject, b.isbn, b.edition, b.description,
       b.total_copies, b.shelf_location, id]
    );
    const body = req.body || {};
    await saveFile(id, 'PDF', PDF_DIR, req.files && req.files.pdf, body.remove_pdf === '1');
    await saveFile(id, 'Audio', AUDIO_DIR, req.files && req.files.audio, body.remove_audio === '1');
    await db.recalcAvailable(id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/books/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.get('SELECT * FROM books WHERE book_id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Book not found.' });
    const open = await db.get(
      'SELECT COUNT(*) AS c FROM issue_records WHERE book_id = ? AND return_date IS NULL', [id]
    );
    if (Number(open.c) > 0) {
      return res.status(409).json({
        error: 'This book still has copies issued. Record the returns before deleting it.',
      });
    }
    const files = await db.all('SELECT file_path FROM digital_files WHERE book_id = ?', [id]);
    for (const f of files) unlinkQuiet(absOf(f.file_path));
    await db.run('DELETE FROM issue_records WHERE book_id = ?', [id]);
    await db.run('DELETE FROM digital_files WHERE book_id = ?', [id]);
    await db.run('DELETE FROM books WHERE book_id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------- circulation --------------------------- */

router.get('/issues', async (req, res, next) => {
  try {
    const openOnly = String(req.query.open || '') === '1';
    let sql = `SELECT i.issue_id, i.book_id, i.user_id, i.issue_date, i.due_date, i.return_date,
                      b.title AS book_title, b.author AS book_author,
                      u.name AS member_name, u.roll_no, u.email
                 FROM issue_records i
                 JOIN books b ON b.book_id = i.book_id
                 JOIN users u ON u.user_id = i.user_id`;
    if (openOnly) sql += ' WHERE i.return_date IS NULL';
    sql += ' ORDER BY (i.return_date IS NULL) DESC, i.due_date ASC, i.issue_id DESC';
    const issues = await db.all(sql);
    res.json({ issues, today: db.today() });
  } catch (err) {
    next(err);
  }
});

router.get('/members', async (req, res, next) => {
  try {
    const members = await db.all(
      "SELECT user_id, name, roll_no, email, role FROM users WHERE role <> 'admin' ORDER BY name"
    );
    res.json({ members });
  } catch (err) {
    next(err);
  }
});

router.post('/issues', async (req, res, next) => {
  try {
    const { book_id, user_id, due_date } = req.body || {};
    const book = await db.get('SELECT * FROM books WHERE book_id = ?', [Number(book_id)]);
    if (!book) return res.status(404).json({ error: 'Book not found.' });
    const user = await db.get('SELECT * FROM users WHERE user_id = ?', [Number(user_id)]);
    if (!user) return res.status(404).json({ error: 'Member not found.' });
    await db.recalcAvailable(book.book_id);
    const fresh = await db.get('SELECT available_copies FROM books WHERE book_id = ?', [book.book_id]);
    if (Number(fresh.available_copies) <= 0) {
      return res.status(409).json({ error: 'No copy is currently available to issue.' });
    }
    const dup = await db.get(
      'SELECT issue_id FROM issue_records WHERE book_id = ? AND user_id = ? AND return_date IS NULL',
      [book.book_id, user.user_id]
    );
    if (dup) return res.status(409).json({ error: 'This member already has that book issued.' });

    const due = str(due_date) || plusDays(14);
    const r = await db.run(
      'INSERT INTO issue_records (book_id, user_id, issue_date, due_date) VALUES (?, ?, ?, ?)',
      [book.book_id, user.user_id, db.today(), due]
    );
    const available = await db.recalcAvailable(book.book_id);
    res.status(201).json({ ok: true, issue_id: r.lastInsertRowid, available_copies: available });
  } catch (err) {
    next(err);
  }
});

router.post('/returns/:issueId', async (req, res, next) => {
  try {
    const id = Number(req.params.issueId);
    const rec = await db.get('SELECT * FROM issue_records WHERE issue_id = ?', [id]);
    if (!rec) return res.status(404).json({ error: 'Issue record not found.' });
    if (rec.return_date) return res.status(409).json({ error: 'This copy has already been returned.' });
    await db.run('UPDATE issue_records SET return_date = ? WHERE issue_id = ?', [db.today(), id]);
    const available = await db.recalcAvailable(rec.book_id);
    res.json({ ok: true, available_copies: available });
  } catch (err) {
    next(err);
  }
});

function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------- notices ----------------------------- */

router.get('/notices', async (req, res, next) => {
  try {
    const notices = await db.all('SELECT * FROM notices ORDER BY posted_on DESC, notice_id DESC');
    res.json({ notices });
  } catch (err) {
    next(err);
  }
});

router.post('/notices', async (req, res, next) => {
  try {
    const { title, description, category, posted_on } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Notice title is required.' });
    const cat = category === 'Library' ? 'Library' : 'College';
    const r = await db.run(
      'INSERT INTO notices (title, description, category, posted_on, posted_by, archived) VALUES (?, ?, ?, ?, ?, 0)',
      [String(title).trim(), str(description), cat, str(posted_on) || db.today(), req.user.name]
    );
    res.status(201).json({ ok: true, notice_id: r.lastInsertRowid });
  } catch (err) {
    next(err);
  }
});

router.put('/notices/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.get('SELECT * FROM notices WHERE notice_id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Notice not found.' });
    const b = req.body || {};
    const title = b.title === undefined ? existing.title : String(b.title).trim();
    if (!title) return res.status(400).json({ error: 'Notice title is required.' });
    const category = b.category === undefined ? existing.category
      : (b.category === 'Library' ? 'Library' : 'College');
    const description = b.description === undefined ? existing.description : str(b.description);
    const posted_on = b.posted_on === undefined ? existing.posted_on : (str(b.posted_on) || existing.posted_on);
    const archived = b.archived === undefined ? existing.archived : (b.archived ? 1 : 0);
    await db.run(
      'UPDATE notices SET title = ?, description = ?, category = ?, posted_on = ?, archived = ? WHERE notice_id = ?',
      [title, description, category, posted_on, archived, id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/notices/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const r = await db.run('DELETE FROM notices WHERE notice_id = ?', [id]);
    if (!r.changes) return res.status(404).json({ error: 'Notice not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* -------------------------- members & history ----------------------- */

/** Librarian registers a new student / faculty account from the panel. */
router.post('/users', async (req, res, next) => {
  try {
    const { name, roll_no, email, password, role } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'A valid e-mail address is required.' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }
    const finalRole = role === 'faculty' ? 'faculty' : 'student';
    const mail = String(email).trim().toLowerCase();
    const taken = await db.get('SELECT user_id FROM users WHERE email = ?', [mail]);
    if (taken) return res.status(409).json({ error: 'An account with this e-mail already exists.' });
    const r = await db.run(
      'INSERT INTO users (name, roll_no, email, password_hash, role, created_on) VALUES (?, ?, ?, ?, ?, ?)',
      [String(name).trim(), roll_no ? String(roll_no).trim() : null, mail,
       await auth.hashPassword(String(password)), finalRole, db.iso()]
    );
    res.status(201).json({
      user: { user_id: r.lastInsertRowid, name: String(name).trim(),
              roll_no: roll_no || null, email: mail, role: finalRole },
    });
  } catch (err) {
    next(err);
  }
});

/** Login history for the librarian (newest first). */
router.get('/login-history', async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const history = await db.all(
      `SELECT h.log_id, h.user_id, h.email, h.role, h.success, h.ip, h.user_agent, h.logged_on,
              u.name AS member_name
         FROM login_history h
         LEFT JOIN users u ON u.user_id = h.user_id
        ORDER BY h.log_id DESC
        LIMIT ?`,
      [limit]
    );
    res.json({ history });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
