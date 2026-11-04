'use strict';
/** Registration / login / logout / session routes. */
const express = require('express');
const db = require('../db');
const auth = require('../auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res, next) => {
  try {
    const { name, roll_no, email, password, role } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!email || !EMAIL_RE.test(String(email).trim())) {
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
    await auth.createSession(res, r.lastInsertRowid);
    res.status(201).json({
      user: { user_id: r.lastInsertRowid, name: String(name).trim(), roll_no: roll_no || null, email: mail, role: finalRole },
    });
  } catch (err) {
    next(err);
  }
});

/** Append a row to the login history — never lets logging in fail. */
async function recordLogin(req, email, user, success) {
  try {
    await db.run(
      `INSERT INTO login_history (user_id, email, role, success, ip, user_agent, logged_on)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user ? user.user_id : null, email, user ? user.role : null, success ? 1 : 0,
       req.ip || null, String(req.headers['user-agent'] || '').slice(0, 200) || null, db.iso()]
    );
  } catch { /* history must never break a login */ }
}

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'E-mail and password are required.' });
    const mail = String(email).trim().toLowerCase();
    const row = await db.get('SELECT * FROM users WHERE email = ?', [mail]);
    if (!row || !(await auth.verifyPassword(String(password), row.password_hash))) {
      await recordLogin(req, mail, row || null, false);
      return res.status(401).json({ error: 'Incorrect e-mail or password.' });
    }
    await auth.createSession(res, row.user_id);
    await recordLogin(req, mail, row, true);
    res.json({ user: auth.publicUser(row) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    await auth.destroySession(req, res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', (req, res) => {
  res.json({ user: req.user || null });
});

module.exports = router;
