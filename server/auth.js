'use strict';
/**
 * Session handling for E-Library (token-based login, as in Table 4.2:
 * "hashed passwords, session or token-based login, role-based access").
 * Passwords are hashed with bcrypt; session tokens are random and stored
 * server-side, the browser only ever sees an opaque httpOnly cookie.
 */
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const COOKIE = 'elibrary_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function publicUser(row) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    name: row.name,
    roll_no: row.roll_no,
    email: row.email,
    role: row.role,
  };
}

async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + MAX_AGE_MS).toISOString();
  await db.run('INSERT INTO sessions (token, user_id, expires_on) VALUES (?, ?, ?)', [
    token,
    userId,
    expires,
  ]);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`
  );
}

async function destroySession(req, res) {
  const token = parseCookies(req)[COOKIE];
  if (token) await db.run('DELETE FROM sessions WHERE token = ?', [token]);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

/** Attaches req.user for any request carrying a valid session cookie. */
async function attachUser(req, _res, next) {
  try {
    const token = parseCookies(req)[COOKIE];
    req.user = null;
    if (token) {
      const row = await db.get(
        `SELECT u.* FROM sessions s JOIN users u ON u.user_id = s.user_id
          WHERE s.token = ? AND s.expires_on > ?`,
        [token, db.iso()]
      );
      req.user = publicUser(row);
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  next();
}

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  COOKIE,
  createSession,
  destroySession,
  attachUser,
  requireLogin,
  requireAdmin,
  hashPassword,
  verifyPassword,
  publicUser,
};
