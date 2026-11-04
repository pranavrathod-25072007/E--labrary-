# E-Library — A Digital Library Management System

A web-based digital library for the college community: a searchable catalogue of the
physical collection with **live availability**, **PDF books** that can be read in the
browser, **audio books** that stream with play/pause/seek/volume controls, a central
**notice board**, and a secure **librarian admin panel**.

This is the working implementation of the Community Engagement Project report
*"E-Library: A Digital Library Management System"* (Dept. of IT, JSCOE, Pune, A.Y. 2026–27).

---

## Quick start

```bash
npm install     # install dependencies (express, bcryptjs, multer, mysql2)
npm start       # first run creates + seeds data/e-library.db, then serves http://localhost:3000
```

Open **http://localhost:3000** and log in with one of the demo accounts:

| Role | E-mail | Password |
|---|---|---|
| Librarian (admin) | `librarian@jscoe.edu.in` | `admin123` |
| Student | `pranav.rathod@jscoe.edu.in` | `student123` |
| Student | `mahesh.murshetwad@jscoe.edu.in` | `student123` |
| Faculty | `faculty@jscoe.edu.in` | `faculty123` |

> Students: `swaresh.chapke@jscoe.edu.in`, `aditya.dawange@jscoe.edu.in` (same password).

Other useful commands:

```bash
npm run seed -- --force      # wipe and re-seed the demo data
npm run assets               # regenerate the demo PDF collection (downloads Project Gutenberg texts)
powershell -File scripts\make_audio.ps1   # regenerate the narrated audio books (Windows TTS)
PORT=4000 npm start          # run on another port
```

---

## Features (mapped to the report)

| Report objective | Where it lives |
|---|---|
| Searchable catalogue by title / author / subject / keyword | `books.html`, `GET /api/books?q=` |
| Live availability status (Available / Issued + expected return) | computed from `available_copies` & open `issue_records` |
| PDF books: read online + download | book page **Read PDF** → in-browser viewer overlay |
| Audio books: play, pause, seek, volume | book page custom player (`<audio>` + controls) |
| Notice board with College / Library filter, newest first | `notices.html`, latest notices on the home page |
| Role-based login (student / faculty / administrator), hashed passwords | `server/auth.js` (bcrypt, token sessions, httpOnly cookie) |
| Admin panel: add/edit/delete books, upload PDF & audio, issue/return, publish/archive/delete notices | `admin.html` |
| Responsive interface (phone → desktop) | CSS breakpoints in `public/css/style.css` |

All eight sample test cases of **Table 5.1** are covered: search hit, "No results found",
issue the last copy, return a copy, open the PDF, play/pause the audio, publish a notice,
and deny admin access to a student (both in the UI and with HTTP 403 on the API).

---

## Architecture (three-tier, as in Chapter 4)

```
presentation tier   public/           HTML5 + CSS3 + JavaScript (responsive, no framework)
application tier    server/           Node.js + Express REST API, sessions, file uploads
data tier           data/e-library.db SQLite via the built-in node:sqlite driver
                    (optional) MySQL via DB_DRIVER=mysql — same schema, same queries
file storage        uploads/pdfs/ · uploads/audio/   (server file system, Table 4.2)
```

### Database schema (Table 4.1)

| Table | Key fields |
|---|---|
| `users` | user_id, name, roll_no / employee_id, email, password_hash, role |
| `books` | book_id, title, author, subject, isbn, edition, total_copies, available_copies, shelf_location |
| `digital_files` | file_id, book_id, file_type (PDF / Audio), file_path, uploaded_on |
| `issue_records` | issue_id, book_id, user_id, issue_date, due_date, return_date |
| `notices` | notice_id, title, description, category, posted_on, posted_by, archived |
| `sessions` | token, user_id, expires_on (token-based login) |

`available_copies` is always derived: **total_copies − open issue records**, so every
issue/return/edit keeps the status shown to students correct.

### Switching to MySQL (as documented in the report)

```bash
mysql -e "CREATE DATABASE e_library;"
DB_DRIVER=mysql DB_HOST=localhost DB_USER=root DB_PASSWORD=yourpass DB_NAME=e_library npm start
```

The DDL for both dialects lives in `server/db.js`; all queries are shared.

---

## API overview

```
POST /api/auth/register · /api/auth/login · /api/auth/logout     GET /api/auth/me
GET  /api/stats                                                 GET /api/books?q=&status=&digital=&sort=
GET  /api/books/:id                                             GET /api/notices?category=&limit=
GET  /api/admin/stats|books|issues|members|notices              (admin only)
POST /api/admin/books (multipart: pdf, audio)                   PUT|DELETE /api/admin/books/:id
POST /api/admin/issues · POST /api/admin/returns/:issueId       (availability updated automatically)
POST /api/admin/notices                                         PUT|DELETE /api/admin/notices/:id
```

---

## Project structure

```
├── public/                  front end
│   ├── index.html           home: hero search, stats, features, latest notices, digital picks
│   ├── books.html           catalogue with live search + filters
│   ├── book.html            book detail, PDF reader, audio player
│   ├── notices.html         notice board with category filter
│   ├── login.html · register.html · admin.html
│   ├── css/style.css        design system, responsive
│   └── js/                  main (session/toasts) + one module per page
├── server/
│   ├── app.js               Express entry point (starts, seeds, serves)
│   ├── db.js                data tier: SQLite/MySQL drivers, schema, recalc helper
│   ├── auth.js              bcrypt passwords, token sessions, role guards
│   ├── seed.js              demo catalogue, members, circulation, notices
│   └── routes/              auth · books · notices · admin
├── uploads/pdfs · audio     demo digital collection (public-domain texts, TTS narration)
├── scripts/                 asset generators (Python PDFs, PowerShell TTS)
└── data/e-library.db        created on first run
```

### Demo digital collection

Public-domain texts from Project Gutenberg as PDFs (*Alice*, *Sherlock Holmes*,
*Pride and Prejudice*, *The Metamorphosis*, *The Republic*) plus Windows-TTS narrated
audio excerpts (*Alice*, *Sherlock Holmes*, *Frankenstein*).

---

## Limitations (as stated in the report)

- Availability depends on the librarian recording issues and returns correctly.
- Only legally shareable digital copies are provided (public-domain works).
- Audio streaming and PDF reading need an internet connection.
- Online payment, fines and a mobile app are out of scope for this version.

**Future enhancements:** reservations and due-date reminders, QR-code issue/return,
recommendations from reading history, NDLI integration, push notifications.

---

*Community Engagement Project · Team: Mahesh Murshetwad (2229), Swaresh Chapke (2230),
Pranav Rathod (2226), Aditya Dawange (2228) · Guided by Prof. Ashwini Tadkal · JSCOE, Pune*
