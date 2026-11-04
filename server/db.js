'use strict';
/**
 * Data tier of E-Library.
 *
 * The schema follows Table 4.1 of the project report (users, books,
 * digital_files, issue_records, notices) and is available in two dialects:
 *   - sqlite  (default, uses the Node.js built-in node:sqlite driver)
 *   - mysql   (set DB_DRIVER=mysql to run against a MySQL server)
 * Both dialects share the same queries, so switching is a config change only.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = process.env.SQLITE_FILE || path.join(DATA_DIR, 'e-library.db');
const DRIVER = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

let sqlite = null;
let pool = null;

const DDL = {
  sqlite: [
    `CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      roll_no TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      created_on TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS books (
      book_id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT,
      subject TEXT,
      isbn TEXT,
      edition TEXT,
      description TEXT,
      total_copies INTEGER NOT NULL DEFAULT 1,
      available_copies INTEGER NOT NULL DEFAULT 1,
      shelf_location TEXT,
      added_on TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS digital_files (
      file_id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      file_name TEXT,
      file_path TEXT NOT NULL,
      uploaded_on TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(book_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS issue_records (
      issue_id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      return_date TEXT,
      FOREIGN KEY (book_id) REFERENCES books(book_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS notices (
      notice_id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      posted_on TEXT NOT NULL,
      posted_by TEXT,
      archived INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_on TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS login_history (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT NOT NULL,
      role TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      ip TEXT,
      user_agent TEXT,
      logged_on TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_files_book ON digital_files(book_id)`,
    `CREATE INDEX IF NOT EXISTS idx_lh_on ON login_history(logged_on)`,
    `CREATE INDEX IF NOT EXISTS idx_issues_book ON issue_records(book_id)`,
    `CREATE INDEX IF NOT EXISTS idx_issues_user ON issue_records(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notices_on ON notices(posted_on)`,
  ],
  mysql: [
    `CREATE TABLE IF NOT EXISTS users (
      user_id BIGINT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      roll_no VARCHAR(40),
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'student',
      created_on VARCHAR(30) NOT NULL
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS books (
      book_id BIGINT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      author VARCHAR(255),
      subject VARCHAR(120),
      isbn VARCHAR(40),
      edition VARCHAR(60),
      description TEXT,
      total_copies INT NOT NULL DEFAULT 1,
      available_copies INT NOT NULL DEFAULT 1,
      shelf_location VARCHAR(60),
      added_on VARCHAR(30) NOT NULL
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS digital_files (
      file_id BIGINT PRIMARY KEY AUTO_INCREMENT,
      book_id BIGINT NOT NULL,
      file_type VARCHAR(10) NOT NULL,
      file_name VARCHAR(255),
      file_path VARCHAR(255) NOT NULL,
      uploaded_on VARCHAR(30) NOT NULL,
      CONSTRAINT fk_df_book FOREIGN KEY (book_id) REFERENCES books(book_id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS issue_records (
      issue_id BIGINT PRIMARY KEY AUTO_INCREMENT,
      book_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      issue_date VARCHAR(10) NOT NULL,
      due_date VARCHAR(10) NOT NULL,
      return_date VARCHAR(10),
      CONSTRAINT fk_ir_book FOREIGN KEY (book_id) REFERENCES books(book_id),
      CONSTRAINT fk_ir_user FOREIGN KEY (user_id) REFERENCES users(user_id),
      INDEX idx_issues_book (book_id),
      INDEX idx_issues_user (user_id)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS notices (
      notice_id BIGINT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(20) NOT NULL,
      posted_on VARCHAR(10) NOT NULL,
      posted_by VARCHAR(120),
      archived TINYINT NOT NULL DEFAULT 0,
      INDEX idx_notices_on (posted_on)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(64) PRIMARY KEY,
      user_id BIGINT NOT NULL,
      expires_on VARCHAR(30) NOT NULL,
      CONSTRAINT fk_sess_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS login_history (
      log_id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NULL,
      email VARCHAR(255) NOT NULL,
      role VARCHAR(20),
      success TINYINT NOT NULL DEFAULT 0,
      ip VARCHAR(64),
      user_agent VARCHAR(255),
      logged_on VARCHAR(30) NOT NULL,
      INDEX idx_lh_on (logged_on),
      CONSTRAINT fk_lh_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
    ) ENGINE=InnoDB`,
  ],
};

async function init() {
  if (DRIVER === 'mysql') {
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'e_library',
      waitForConnections: true,
      connectionLimit: 10,
    });
    for (const stmt of DDL.mysql) await pool.query(stmt);
  } else {
    const { DatabaseSync } = require('node:sqlite');
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    sqlite = new DatabaseSync(DB_FILE);
    sqlite.exec('PRAGMA foreign_keys = ON;');
    for (const stmt of DDL.sqlite) sqlite.exec(stmt);
  }
  await run("DELETE FROM sessions WHERE expires_on < ?", [iso()]);
}

async function all(sql, params = []) {
  if (DRIVER === 'mysql') {
    const [rows] = await pool.execute(sql, params);
    return rows;
  }
  return sqlite.prepare(sql).all(...params);
}

async function get(sql, params = []) {
  if (DRIVER === 'mysql') {
    const [rows] = await pool.execute(sql, params);
    return rows[0];
  }
  return sqlite.prepare(sql).get(...params);
}

async function run(sql, params = []) {
  if (DRIVER === 'mysql') {
    const [r] = await pool.execute(sql, params);
    return { changes: r.affectedRows, lastInsertRowid: r.insertId };
  }
  const r = sqlite.prepare(sql).run(...params);
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}

/** Current UTC timestamp, stored as an ISO string in every dialect. */
function iso() {
  return new Date().toISOString();
}

/** Today's date as YYYY-MM-DD. */
function today() {
  return iso().slice(0, 10);
}

/**
 * Keep available_copies in sync with the open issue records:
 * available = total_copies - open issues (never below zero).
 */
async function recalcAvailable(bookId) {
  const row = await get(
    `SELECT b.total_copies AS total,
            (SELECT COUNT(*) FROM issue_records i
              WHERE i.book_id = b.book_id AND i.return_date IS NULL) AS open
       FROM books b WHERE b.book_id = ?`,
    [bookId]
  );
  if (!row) return null;
  const avail = Math.max(0, Number(row.total) - Number(row.open));
  await run('UPDATE books SET available_copies = ? WHERE book_id = ?', [avail, bookId]);
  return avail;
}

module.exports = { init, all, get, run, iso, today, recalcAvailable, ROOT, DRIVER };
