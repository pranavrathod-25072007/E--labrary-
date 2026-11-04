'use strict';
/**
 * Seeds the demo data set for E-Library:
 *   - 6 accounts (librarian/admin, 4 students, 1 faculty)
 *   - 15 catalogue titles (6 of them with PDF / audio files)
 *   - open and returned issue records
 *   - college & library notices (one archived)
 *
 * Runs automatically on first start.  Force a re-seed with:  npm run seed -- --force
 */
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const USERS = [
  { name: 'Library Administrator', roll_no: 'STAFF01', email: 'librarian@jscoe.edu.in', password: 'admin123', role: 'admin' },
  { name: 'PRANAV RATHOD', roll_no: '2226', email: 'pranav.rathod@jscoe.edu.in', password: 'student123', role: 'student' },
  { name: 'MAHESH MURSHETWAD', roll_no: '2229', email: 'mahesh.murshetwad@jscoe.edu.in', password: 'student123', role: 'student' },
  { name: 'SWARESH CHAPKE', roll_no: '2230', email: 'swaresh.chapke@jscoe.edu.in', password: 'student123', role: 'student' },
  { name: 'ADITYA DAWANGE', roll_no: '2228', email: 'aditya.dawange@jscoe.edu.in', password: 'student123', role: 'student' },
  { name: 'Prof. R. Deshpande', roll_no: 'FAC07', email: 'faculty@jscoe.edu.in', password: 'faculty123', role: 'faculty' },
];

const BOOKS = [
  {
    title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', subject: 'English Literature',
    isbn: '978-0-141-43976-1', edition: 'Reprint', shelf: 'LIT-01', total: 3, added: '2026-08-12',
    description: 'A young girl falls down a rabbit hole into a fantasy world of talking animals and curious games. A public-domain classic, available here as PDF and as a narrated audio book.',
    files: [['PDF', 'alice.pdf'], ['Audio', 'alice.wav']],
  },
  {
    title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', subject: 'Fiction / Mystery',
    isbn: '978-0-19-953556-9', edition: 'Oxford', shelf: 'FIC-02', total: 2, added: '2026-08-12',
    description: 'Twelve short stories featuring the world’s greatest consulting detective. Read the PDF online or listen to the narrated excerpt in the browser.',
    files: [['PDF', 'sherlock.pdf'], ['Audio', 'sherlock.wav']],
  },
  {
    title: 'Pride and Prejudice', author: 'Jane Austen', subject: 'English Literature',
    isbn: '978-0-14-143951-8', edition: 'Penguin', shelf: 'LIT-03', total: 2, added: '2026-08-20',
    description: 'The classic novel of manners following Elizabeth Bennet and Mr. Darcy. Digitised from a public-domain edition.',
    files: [['PDF', 'pride.pdf']],
  },
  {
    title: 'The Metamorphosis', author: 'Franz Kafka', subject: 'Fiction',
    isbn: '978-0-553-21369-0', edition: 'Bantam', shelf: 'FIC-05', total: 1, added: '2026-09-02',
    description: 'Gregor Samsa wakes one morning to find himself transformed into a monstrous insect — Kafka’s best-known novella.',
    files: [['PDF', 'metamorphosis.pdf']],
  },
  {
    title: 'The Republic', author: 'Plato', subject: 'Philosophy',
    isbn: '978-0-14-045511-3', edition: 'Penguin Classics', shelf: 'PHI-01', total: 2, added: '2026-09-02',
    description: 'Plato’s dialogue on justice, the ideal state and the famous allegory of the cave.',
    files: [['PDF', 'republic.pdf']],
  },
  {
    title: 'Frankenstein; or, The Modern Prometheus', author: 'Mary Shelley', subject: 'Fiction',
    isbn: '978-0-14-1-43947-1', edition: 'Penguin Classics', shelf: 'FIC-07', total: 2, added: '2026-09-15',
    description: 'The groundbreaking science-fiction novel, available as a narrated audio book for listening in the browser.',
    files: [['Audio', 'frankenstein.wav']],
  },
  {
    title: 'Introduction to Algorithms (3rd Edition)', author: 'Cormen, Leiserson, Rivest, Stein', subject: 'Computer Science',
    isbn: '978-0-262-03384-8', edition: '3rd', shelf: 'CS-11', total: 4, added: '2026-07-05',
    description: 'The standard university text on algorithms and data structures — sorting, graphs, dynamic programming and more.',
  },
  {
    title: 'Operating System Concepts (9th Edition)', author: 'Silberschatz, Galvin, Gagne', subject: 'Computer Science',
    isbn: '978-1-119-32091-3', edition: '9th', shelf: 'CS-04', total: 3, added: '2026-07-05',
    description: 'Processes, threads, memory management, file systems and I/O — the classic “Galvin” OS textbook.',
  },
  {
    title: 'Database System Concepts (7th Edition)', author: 'Silberschatz, Korth, Sudarshan', subject: 'Computer Science',
    isbn: '978-0-07-802215-9', edition: '7th', shelf: 'CS-06', total: 3, added: '2026-07-18',
    description: 'Relational design, SQL, transactions and storage — the reference used for the DBMS course.',
  },
  {
    title: 'Fundamentals of Database Systems (7th Edition)', author: 'R. Elmasri, S. B. Navathe', subject: 'Computer Science',
    isbn: '978-0-133-97077-7', edition: '7th', shelf: 'CS-07', total: 2, added: '2026-07-18',
    description: 'Conceptual modelling, normalisation and query processing. Also a key reference for this project report.',
  },
  {
    title: 'Software Engineering (10th Edition)', author: 'Ian Sommerville', subject: 'Computer Science',
    isbn: '978-0-133-94303-0', edition: '10th', shelf: 'CS-09', total: 2, added: '2026-08-01',
    description: 'Requirements, design, testing and project management — the software-engineering process textbook.',
  },
  {
    title: 'Computer Networks (6th Edition)', author: 'Andrew S. Tanenbaum', subject: 'Computer Science',
    isbn: '978-0-132-12695-3', edition: '6th', shelf: 'CS-12', total: 3, added: '2026-08-24',
    description: 'The physical layer up to application protocols, with a layered approach to networking fundamentals.',
  },
  {
    title: 'Fundamentals of Physics (10th Edition)', author: 'Halliday, Resnick, Walker', subject: 'Physics',
    isbn: '978-1-118-23071-8', edition: '10th', shelf: 'PHY-02', total: 4, added: '2026-06-30',
    description: 'Mechanics, electromagnetism and modern physics for first-year engineering students.',
  },
  {
    title: 'Higher Engineering Mathematics (40th Edition)', author: 'B. S. Grewal', subject: 'Mathematics',
    isbn: '978-81-7409-158-1', edition: '40th', shelf: 'MATH-01', total: 5, added: '2026-06-30',
    description: 'Calculus, linear algebra, differential equations and numerical methods used across the engineering curriculum.',
  },
  {
    title: 'The Jungle Book', author: 'Rudyard Kipling', subject: 'Fiction',
    isbn: '978-0-141-43955-6', edition: 'Penguin', shelf: 'FIC-09', total: 2, added: '2026-09-20',
    description: 'Mowgli and the animals of the jungle — a public-domain favourite for leisure reading.',
  },
];

// [book key (title), member index in USERS, issue date, due date, return date|null]
const ISSUES = [
  ['Operating System Concepts (9th Edition)', 1, '2026-10-25', '2026-11-08', null],
  ['Operating System Concepts (9th Edition)', 2, '2026-10-29', '2026-11-12', null],
  ['Operating System Concepts (9th Edition)', 3, '2026-11-01', '2026-11-15', null],
  ['Introduction to Algorithms (3rd Edition)', 4, '2026-10-27', '2026-11-10', null],
  ['Introduction to Algorithms (3rd Edition)', 5, '2026-11-03', '2026-11-20', null],
  ['Database System Concepts (7th Edition)', 1, '2026-10-20', '2026-11-03', '2026-11-02'],
  ['Database System Concepts (7th Edition)', 3, '2026-10-30', '2026-11-13', null],
  ['Software Engineering (10th Edition)', 2, '2026-11-01', '2026-11-15', null],
  ['Fundamentals of Physics (10th Edition)', 4, '2026-10-28', '2026-11-11', null],
  ['Higher Engineering Mathematics (40th Edition)', 1, '2026-11-02', '2026-11-16', null],
  ["Alice's Adventures in Wonderland", 1, '2026-10-05', '2026-10-19', '2026-10-17'],
];

const NOTICES = [
  { title: 'New arrivals – November 2026', category: 'Library', posted_on: '2026-11-02', by: 'Library Administrator',
    description: 'Forty new titles have been added to the Computer Science and Mathematics sections, including the latest editions of Algorithms, Operating Systems and Database Systems. Visit shelf locations CS-04 to CS-12 to browse them.' },
  { title: 'Library closed for annual inventory on 8 November', category: 'College', posted_on: '2026-11-01', by: 'Library Administrator',
    description: 'The library will remain closed on Saturday, 8 November 2026 for the annual stock verification. Please return all borrowed books before 7 November to avoid overdue records.' },
  { title: 'Extended library hours during end-semester examinations', category: 'College', posted_on: '2026-10-28', by: 'Library Administrator',
    description: 'From 15 November to 5 December 2026 the reading hall will stay open till 11:00 PM on working days. Issue counters will close at the usual time.' },
  { title: 'Audio books now available on E-Library', category: 'Library', posted_on: '2026-10-25', by: 'Library Administrator',
    description: 'You can now listen to selected titles such as Alice in Wonderland, Sherlock Holmes and Frankenstein directly in your browser — useful while travelling. Use the Listen button on any book page.' },
  { title: 'Workshop: Research resources of the National Digital Library of India', category: 'College', posted_on: '2026-10-18', by: 'Library Administrator',
    description: 'A one-hour hands-on workshop on finding journals, theses and NPTEL lectures through NDLI will be held in Seminar Hall B on 21 October at 3:00 PM. Open to all students and faculty.' },
  { title: 'Inter-library membership registration', category: 'Library', posted_on: '2026-10-10', by: 'Library Administrator',
    description: 'Students and faculty may register for inter-library membership to borrow books from partner college libraries. Forms are available at the issue counter and on the E-Library notice board.' },
  { title: 'Orientation programme for new students', category: 'College', posted_on: '2026-09-15', by: 'Library Administrator', archived: 1,
    description: 'The library orientation for first-year students was conducted on 15 September. Students who missed it may collect the library guide from the issue counter.' },
];

async function wipe() {
  for (const t of ['sessions', 'issue_records', 'digital_files', 'notices', 'books', 'users']) {
    await db.run(`DELETE FROM ${t}`);
  }
}

async function seed({ force = false } = {}) {
  const existing = await db.get('SELECT COUNT(*) AS c FROM users');
  if (Number(existing.c) > 0) {
    if (!force) {
      console.log('Database already contains data — skipping seed (use --force to re-seed).');
      return false;
    }
    await wipe();
  }

  // users
  const userIds = {};
  for (const u of USERS) {
    const r = await db.run(
      'INSERT INTO users (name, roll_no, email, password_hash, role, created_on) VALUES (?, ?, ?, ?, ?, ?)',
      [u.name, u.roll_no, u.email, await bcrypt.hash(u.password, 10), u.role, db.iso()]
    );
    userIds[u.email] = r.lastInsertRowid;
  }

  // books + digital files
  const bookIds = {};
  for (const b of BOOKS) {
    const r = await db.run(
      `INSERT INTO books (title, author, subject, isbn, edition, description,
                          total_copies, available_copies, shelf_location, added_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.title, b.author, b.subject, b.isbn, b.edition, b.description,
       b.total, b.total, b.shelf, b.added]
    );
    const id = r.lastInsertRowid;
    bookIds[b.title] = id;
    for (const [type, file] of b.files || []) {
      const rel = type === 'PDF' ? `/uploads/pdfs/${file}` : `/uploads/audio/${file}`;
      const abs = path.join(db.ROOT, rel.replace(/\//g, path.sep));
      if (!fs.existsSync(abs)) {
        console.warn(`  ! missing asset ${rel} — skipping file record`);
        continue;
      }
      await db.run(
        'INSERT INTO digital_files (book_id, file_type, file_name, file_path, uploaded_on) VALUES (?, ?, ?, ?, ?)',
        [id, type, file, rel, db.iso()]
      );
    }
  }

  // circulation
  for (const [title, memberIdx, issueDate, dueDate, returnDate] of ISSUES) {
    await db.run(
      'INSERT INTO issue_records (book_id, user_id, issue_date, due_date, return_date) VALUES (?, ?, ?, ?, ?)',
      [bookIds[title], userIds[USERS[memberIdx].email], issueDate, dueDate, returnDate]
    );
    await db.recalcAvailable(bookIds[title]);
  }

  // notices
  for (const n of NOTICES) {
    await db.run(
      'INSERT INTO notices (title, description, category, posted_on, posted_by, archived) VALUES (?, ?, ?, ?, ?, ?)',
      [n.title, n.description, n.category, n.posted_on, n.by, n.archived || 0]
    );
  }

  console.log(
    `Seeded ${USERS.length} users, ${BOOKS.length} books, ${ISSUES.length} issue records, ${NOTICES.length} notices.`
  );
  return true;
}

module.exports = { seed };

if (require.main === module) {
  (async () => {
    await db.init();
    await seed({ force: process.argv.includes('--force') });
    process.exit(0);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
