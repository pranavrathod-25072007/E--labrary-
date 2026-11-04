/* ============================================================
   E-Library — administrator panel
   Dashboard · Books (CRUD + PDF/audio uploads) · Circulation
   (issue / return → availability) · Notices (publish / archive)
   ============================================================ */
'use strict';

let booksCache = [];

const todayISO = () => new Date().toISOString().slice(0, 10);
function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function setCount(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = n;
  el.classList.toggle('hidden', !n);
}

function showPanelError(panel, err) {
  panel.innerHTML = `<div class="empty"><h3>Something went wrong</h3><p>${esc(err.message)}</p>
    <p style="margin-top:12px"><button class="btn btn-outline btn-sm" onclick="location.reload()">Retry</button></p></div>`;
}

/* --------------------------- access guard --------------------------- */
document.addEventListener('session:ready', () => {
  const u = SESSION.user;
  const loading = document.getElementById('guard-loading');
  const denied = document.getElementById('denied');
  loading.classList.add('hidden');

  if (!u) {
    document.getElementById('denied-msg').textContent =
      'Please log in with your administrator account to open the admin panel.';
    denied.classList.remove('hidden');
    return;
  }
  if (u.role !== 'admin') {
    document.getElementById('denied-msg').textContent =
      `You are signed in as ${u.name} (${u.role}). The administrator panel is restricted to library staff — students and faculty can browse the catalogue and notices instead.`;
    denied.classList.remove('hidden');
    return;
  }

  document.getElementById('admin-app').classList.remove('hidden');
  document.getElementById('admin-who').textContent = `Signed in as ${u.name}`;

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) activateTab(tab.dataset.tab);
  });
  document.getElementById('btn-add-student').addEventListener('click', () => studentModal());
  loadDashboard();
});

function activateTab(name) {
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) =>
    p.classList.toggle('hidden', p.id !== 'panel-' + name));
  if (name === 'dashboard') loadDashboard();
  if (name === 'books') loadBooks();
  if (name === 'circulation') loadCirculation();
  if (name === 'notices') loadNotices();
  if (name === 'history') loadHistory();
}

/* ----------------------------- dashboard ---------------------------- */
async function loadDashboard() {
  const panel = document.getElementById('panel-dashboard');
  try {
    const [stats, issuesRes, noticesRes] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/issues?open=1'),
      api('/api/admin/notices'),
    ]);
    setCount('tab-books-count', stats.books);
    setCount('tab-issues-count', stats.open_issues);
    setCount('tab-notices-count', stats.notices);

    const open = issuesRes.issues.slice(0, 6);
    const recent = noticesRes.notices.slice(0, 5);

    const mini = (label, value, cls = '') =>
      `<div class="mini-stat ${cls}"><b>${value}</b><span>${label}</span></div>`;

    panel.innerHTML = `
      <div class="admin-stats">
        ${mini('Titles in catalogue', stats.books)}
        ${mini('Physical copies', stats.copies)}
        ${mini('Digital files (PDF/audio)', stats.files)}
        ${mini('Books on loan', stats.open_issues)}
        ${mini('Overdue', stats.overdue, stats.overdue ? 'bad' : '')}
        ${mini('Registered members', stats.members)}
        ${mini('Active notices', stats.notices)}
        ${mini('Archived notices', stats.archived)}
      </div>

      <div class="split">
        <div class="list-card">
          <h3>Books currently on loan
            <button class="btn btn-sm btn-outline" data-goto="circulation" type="button">Open circulation →</button>
          </h3>
          <div class="items">
            ${open.length ? open.map((i) => {
              const late = i.due_date < todayISO();
              return `<div class="list-item">
                <span class="avatar">${esc(initials(i.member_name))}</span>
                <span class="grow"><b>${esc(i.book_title)}</b>
                  <span>${esc(i.member_name)} · due ${fmtDate(i.due_date)}${late ? ' · overdue' : ''}</span></span>
                ${late ? '<span class="badge badge-bad">Overdue</span>' : '<span class="badge badge-ok">On loan</span>'}
              </div>`;
            }).join('') : '<div class="list-item muted">No books are on loan — everything is on the shelf.</div>'}
          </div>
        </div>

        <div class="list-card">
          <h3>Latest notices
            <button class="btn btn-sm btn-outline" data-goto="notices" type="button">Manage notices →</button>
          </h3>
          <div class="items">
            ${recent.length ? recent.map((n) => `
              <div class="list-item">
                <span class="cat-pill ${n.category === 'College' ? 'college' : 'library'}">${esc(n.category)}</span>
                <span class="grow"><b>${esc(n.title)}</b><span>${fmtDate(n.posted_on)}${n.archived ? ' · archived' : ''}</span></span>
              </div>`).join('') : '<div class="list-item muted">No notices published yet.</div>'}
          </div>
        </div>
      </div>`;

    // ---- motion: stagger indexes + count-up on the stat numbers ----
    panel.querySelectorAll('.admin-stats .mini-stat').forEach((el, i) =>
      el.style.setProperty('--i', i));
    panel.querySelectorAll('.split .list-card .items').forEach((list) =>
      list.querySelectorAll('.list-item').forEach((el, i) =>
        el.style.setProperty('--j', i)));
    panel.querySelectorAll('.mini-stat b').forEach((el) =>
      countUp(el, Number(el.textContent) || 0));

    panel.querySelectorAll('[data-goto]').forEach((b) =>
      b.addEventListener('click', () => activateTab(b.dataset.goto)));
  } catch (err) {
    showPanelError(panel, err);
  }
}

/* -------------------------------- books ----------------------------- */
async function loadBooks() {
  const panel = document.getElementById('panel-books');
  try {
    const { books } = await api('/api/admin/books');
    booksCache = books;
    setCount('tab-books-count', books.length);

    panel.innerHTML = `
      <div class="toolbar">
        <div class="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
          <input type="search" id="admin-book-search" placeholder="Filter by title, author or subject…">
        </div>
        <button class="btn" id="btn-add-book" type="button" style="margin-left:auto">＋ Add book</button>
      </div>

      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Title</th><th>Subject</th><th>Copies</th><th>Status</th>
              <th>Digital</th><th>Shelf</th><th style="text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody id="books-tbody">${books.map(bookRow).join('')}</tbody>
        </table>
      </div>`;

    document.getElementById('btn-add-book').addEventListener('click', () => bookModal(null));
    document.getElementById('admin-book-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const list = booksCache.filter((b) =>
        [b.title, b.author, b.subject, b.isbn].filter(Boolean)
          .some((v) => v.toLowerCase().includes(q)));
      document.getElementById('books-tbody').innerHTML = list.length
        ? list.map(bookRow).join('')
        : '<tr><td colspan="7" class="center muted" style="padding:26px">No matching books.</td></tr>';
    });

    panel.addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit]');
      const del = e.target.closest('[data-del]');
      if (edit) {
        const b = booksCache.find((x) => x.book_id === Number(edit.dataset.edit));
        if (b) bookModal(b);
      }
      if (del) deleteBook(Number(del.dataset.del));
    });
  } catch (err) {
    showPanelError(panel, err);
  }
}

function bookRow(b) {
  const has = (t) => b.files.some((f) => f.file_type === t);
  const digital = [
    has('PDF') ? '<span class="badge badge-flat badge-pdf">PDF</span>' : '',
    has('Audio') ? '<span class="badge badge-flat badge-audio">AUDIO</span>' : '',
  ].join(' ') || '<span class="muted small">—</span>';
  const status = b.status === 'Available'
    ? '<span class="badge badge-ok">Available</span>'
    : '<span class="badge badge-warn">Issued</span>';
  return `
    <tr>
      <td><div class="t-title">${esc(b.title)}</div><div class="t-sub">${esc(b.author || '')}</div></td>
      <td>${esc(b.subject || '—')}</td>
      <td><b>${b.available_copies}</b> / ${b.total_copies}</td>
      <td>${status}${b.open_issues ? `<div class="t-sub">${b.open_issues} on loan</div>` : ''}</td>
      <td>${digital}</td>
      <td>${esc(b.shelf_location || '—')}</td>
      <td><div class="row-actions">
        <button class="btn btn-sm btn-outline" type="button" data-edit="${b.book_id}">Edit</button>
        <button class="btn btn-sm btn-danger" type="button" data-del="${b.book_id}">Delete</button>
      </div></td>
    </tr>`;
}

function bookModal(book) {
  const isEdit = Boolean(book);
  const f = book || {};
  const fileOf = (type) => (f.files || []).find((x) => x.file_type === type);
  const pdf = fileOf('PDF');
  const audio = fileOf('Audio');

  const fileRow = (label, current, removeName) => current
    ? `<div class="file-row"><span>${label}: <b>${esc(current.file_name || current.file_path)}</b></span>
         <label class="file-check"><input type="checkbox" name="${removeName}" value="1"> remove</label></div>`
    : `<div class="file-row"><span class="none">${label}: no file uploaded yet</span></div>`;

  const overlay = openModal(`
    <div class="modal">
      <div class="modal-head">
        <h3>${isEdit ? 'Edit book' : 'Add a new book'}</h3>
        <button class="modal-close" type="button" data-x>✕</button>
      </div>
      <form id="book-form" enctype="multipart/form-data">
        <div class="modal-body">
          <div id="bf-error" class="form-error hidden"></div>
          <div class="field"><label>Title <span class="req">*</span></label>
            <input class="input" name="title" required value="${esc(f.title || '')}" placeholder="e.g. Introduction to Algorithms"></div>
          <div class="field-row">
            <div class="field"><label>Author</label><input class="input" name="author" value="${esc(f.author || '')}"></div>
            <div class="field"><label>Subject</label><input class="input" name="subject" value="${esc(f.subject || '')}" placeholder="e.g. Computer Science"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>ISBN</label><input class="input" name="isbn" value="${esc(f.isbn || '')}"></div>
            <div class="field"><label>Edition</label><input class="input" name="edition" value="${esc(f.edition || '')}"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Shelf location</label><input class="input" name="shelf_location" value="${esc(f.shelf_location || '')}" placeholder="e.g. CS-11"></div>
            <div class="field"><label>Total copies <span class="req">*</span></label>
              <input class="input" type="number" name="total_copies" min="1" value="${f.total_copies || 1}"></div>
          </div>
          <div class="field"><label>Description</label>
            <textarea class="textarea" name="description" placeholder="Short summary shown on the book page…">${esc(f.description || '')}</textarea></div>
          <div class="field"><label>PDF file</label>
            <input class="input" type="file" name="pdf" accept="application/pdf,.pdf">
            ${fileRow('Current PDF', pdf, 'remove_pdf')}</div>
          <div class="field"><label>Audio file</label>
            <input class="input" type="file" name="audio" accept="audio/*,.mp3,.wav,.m4a,.ogg">
            ${fileRow('Current audio', audio, 'remove_audio')}</div>
          <p class="small muted" style="margin:0">Availability is calculated automatically from total copies minus open issues.</p>
        </div>
        <div class="modal-foot">
          <button class="btn btn-outline" type="button" data-x>Cancel</button>
          <button class="btn" type="submit" id="bf-save">${isEdit ? 'Save changes' : 'Add book'}</button>
        </div>
      </form>
    </div>`);

  overlay.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', closeModal));
  overlay.querySelector('#book-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('bf-save');
    const errBox = document.getElementById('bf-error');
    errBox.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const body = new FormData(e.target);
      if (isEdit) await api('/api/admin/books/' + book.book_id, { method: 'PUT', body });
      else await api('/api/admin/books', { method: 'POST', body });
      closeModal();
      toast(isEdit ? 'Book updated.' : 'Book added to the catalogue.', 'ok');
      loadBooks();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = isEdit ? 'Save changes' : 'Add book';
    }
  });
}

async function deleteBook(id) {
  const book = booksCache.find((b) => b.book_id === id);
  const ok = await confirmDialog(
    'Delete book',
    `Remove “${book ? book.title : id}” and its digital files from the catalogue? This cannot be undone.`);
  if (!ok) return;
  try {
    await api('/api/admin/books/' + id, { method: 'DELETE' });
    toast('Book deleted.', 'ok');
    loadBooks();
  } catch (err) {
    toast(err.message, 'err');
  }
}

/* ---------------------------- circulation --------------------------- */
async function loadCirculation() {
  const panel = document.getElementById('panel-circulation');
  try {
    const [membersRes, booksRes, issuesRes] = await Promise.all([
      api('/api/admin/members'),
      api('/api/admin/books'),
      api('/api/admin/issues'),
    ]);
    const members = membersRes.members;
    const issues = issuesRes.issues;
    const open = issues.filter((i) => !i.return_date);
    const returned = issues.filter((i) => i.return_date).slice(0, 8);
    const lendable = booksRes.books.filter((b) => b.available_copies > 0);
    setCount('tab-issues-count', open.length);

    const openRow = (i) => {
      const late = i.due_date < todayISO();
      return `
        <tr class="${late ? 'overdue-row' : ''}">
          <td><div class="t-title">${esc(i.member_name)}</div><div class="t-sub">${esc(i.roll_no || i.email)}</div></td>
          <td><div class="t-title">${esc(i.book_title)}</div><div class="t-sub">${esc(i.book_author || '')}</div></td>
          <td>${fmtDate(i.issue_date)}</td>
          <td>${fmtDate(i.due_date)} ${late ? '<span class="badge badge-bad">Overdue</span>' : ''}</td>
          <td><div class="row-actions">
            <button class="btn btn-sm btn-ok" type="button" data-return="${i.issue_id}">Record return</button>
          </div></td>
        </tr>`;
    };

    panel.innerHTML = `
      <div class="split" style="margin-bottom:18px">
        <div class="panel">
          <h3 style="font-size:16px">Issue a book</h3>
          <form id="issue-form">
            <div class="field">
              <label>Member <span class="req">*</span></label>
              <select class="input" name="user_id" required>
                <option value="">Select a member…</option>
                ${members.map((m) => `<option value="${m.user_id}">${esc(m.name)} · ${esc(m.roll_no || m.email)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Book <span class="req">*</span> (available copies)</label>
              <select class="input" name="book_id" required>
                <option value="">Select a book…</option>
                ${lendable.map((b) => `<option value="${b.book_id}">${esc(b.title)} — ${b.available_copies} left</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Due date <span class="req">*</span></label>
              <input class="input" type="date" name="due_date" value="${plusDays(14)}" required>
            </div>
            <button class="btn btn-block" type="submit">Record issue</button>
          </form>
          ${lendable.length ? '' : '<p class="small muted" style="margin-top:10px">Every copy is currently on loan.</p>'}
        </div>

        <div class="list-card">
          <h3>Recently returned</h3>
          <div class="items">
            ${returned.length ? returned.map((i) => `
              <div class="list-item">
                <span class="avatar">${esc(initials(i.member_name))}</span>
                <span class="grow"><b>${esc(i.book_title)}</b>
                  <span>${esc(i.member_name)} · returned ${fmtDate(i.return_date)}</span></span>
                <span class="badge badge-ok">Returned</span>
              </div>`).join('') : '<div class="list-item muted">No returns recorded yet.</div>'}
          </div>
        </div>
      </div>

      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Member</th><th>Book</th><th>Issued</th><th>Due date</th><th style="text-align:right">Action</th></tr></thead>
          <tbody>
            ${open.length ? open.map(openRow).join('')
              : '<tr><td colspan="5" class="center muted" style="padding:26px">No books are currently on loan.</td></tr>'}
          </tbody>
        </table>
      </div>`;

    panel.querySelector('#issue-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const data = await api('/api/admin/issues', {
          method: 'POST',
          body: {
            book_id: Number(e.target.book_id.value),
            user_id: Number(e.target.user_id.value),
            due_date: e.target.due_date.value,
          },
        });
        toast(`Book issued · ${data.available_copies} cop${data.available_copies === 1 ? 'y' : 'ies'} now on the shelf`, 'ok');
        loadCirculation();
      } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false;
      }
    });

    panel.querySelectorAll('[data-return]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const id = btn.dataset.return;
        const rec = open.find((i) => i.issue_id === Number(id));
        const ok = await confirmDialog('Record return',
          `Mark “${rec ? rec.book_title : ''}” as returned by ${rec ? rec.member_name : ''}?`, 'Record return');
        if (!ok) return;
        try {
          const data = await api('/api/admin/returns/' + id, { method: 'POST' });
          toast(`Returned · ${data.available_copies} cop${data.available_copies === 1 ? 'y' : 'ies'} back on the shelf`, 'ok');
          loadCirculation();
        } catch (err) {
          toast(err.message, 'err');
        }
      }));
  } catch (err) {
    showPanelError(panel, err);
  }
}

/* ------------------------------ notices ----------------------------- */
async function loadNotices() {
  const panel = document.getElementById('panel-notices');
  try {
    const { notices } = await api('/api/admin/notices');
    setCount('tab-notices-count', notices.filter((n) => !n.archived).length);

    const row = (n) => `
      <tr class="${n.archived ? 'overdue-row' : ''}">
        <td><div class="t-title">${esc(n.title)}</div>
            <div class="t-sub">${esc((n.description || '').slice(0, 90))}${(n.description || '').length > 90 ? '…' : ''}</div></td>
        <td><span class="cat-pill ${n.category === 'College' ? 'college' : 'library'}">${esc(n.category)}</span></td>
        <td>${fmtDate(n.posted_on)}${n.archived ? '<div class="t-sub">archived</div>' : ''}</td>
        <td><div class="row-actions">
          <button class="btn btn-sm btn-outline" type="button" data-edit-notice="${n.notice_id}">Edit</button>
          <button class="btn btn-sm btn-outline" type="button" data-archive="${n.notice_id}">${n.archived ? 'Restore' : 'Archive'}</button>
          <button class="btn btn-sm btn-danger" type="button" data-del-notice="${n.notice_id}">Delete</button>
        </div></td>
      </tr>`;

    panel.innerHTML = `
      <div class="split">
        <div class="panel">
          <h3 style="font-size:16px">Publish a notice</h3>
          <form id="notice-form">
            <div id="nf-error" class="form-error hidden"></div>
            <div class="field"><label>Title <span class="req">*</span></label>
              <input class="input" name="title" required placeholder="e.g. Library closed on Saturday"></div>
            <div class="field-row">
              <div class="field"><label>Category</label>
                <select class="input" name="category"><option>College</option><option>Library</option></select></div>
              <div class="field"><label>Date</label>
                <input class="input" type="date" name="posted_on" value="${todayISO()}"></div>
            </div>
            <div class="field"><label>Description</label>
              <textarea class="textarea" name="description" placeholder="Full text of the announcement…"></textarea></div>
            <button class="btn btn-block" type="submit">Publish notice</button>
          </form>
          <p class="small muted" style="margin:12px 0 0">Published notices appear on the home page and notice board immediately. Archived notices are hidden from students.</p>
        </div>

        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Notice</th><th>Category</th><th>Date</th><th style="text-align:right">Actions</th></tr></thead>
            <tbody>
              ${notices.length ? notices.map(row).join('')
                : '<tr><td colspan="4" class="center muted" style="padding:26px">No notices yet — publish the first one.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    panel.querySelector('#notice-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      const errBox = document.getElementById('nf-error');
      btn.disabled = true;
      try {
        await api('/api/admin/notices', {
          method: 'POST',
          body: {
            title: e.target.title.value.trim(),
            description: e.target.description.value.trim(),
            category: e.target.category.value,
            posted_on: e.target.posted_on.value,
          },
        });
        toast('Notice published to the board.', 'ok');
        loadNotices();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
        btn.disabled = false;
      }
    });

    panel.addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit-notice]');
      const arch = e.target.closest('[data-archive]');
      const del = e.target.closest('[data-del-notice]');

      if (edit) {
        const n = notices.find((x) => x.notice_id === Number(edit.dataset.editNotice));
        if (n) noticeModal(n);
      }
      if (arch) {
        const n = notices.find((x) => x.notice_id === Number(arch.dataset.archive));
        if (!n) return;
        try {
          await api('/api/admin/notices/' + n.notice_id, {
            method: 'PUT',
            body: { archived: !n.archived },
          });
          toast(n.archived ? 'Notice restored.' : 'Notice archived.', 'ok');
          loadNotices();
        } catch (err) { toast(err.message, 'err'); }
      }
      if (del) {
        const n = notices.find((x) => x.notice_id === Number(del.dataset.delNotice));
        const ok = await confirmDialog('Delete notice',
          `Delete “${n ? n.title : ''}” permanently?`);
        if (!ok) return;
        try {
          await api('/api/admin/notices/' + del.dataset.delNotice, { method: 'DELETE' });
          toast('Notice deleted.', 'ok');
          loadNotices();
        } catch (err) { toast(err.message, 'err'); }
      }
    });
  } catch (err) {
    showPanelError(panel, err);
  }
}

function noticeModal(n) {
  const overlay = openModal(`
    <div class="modal">
      <div class="modal-head">
        <h3>Edit notice</h3>
        <button class="modal-close" type="button" data-x>✕</button>
      </div>
      <form id="notice-edit-form">
        <div class="modal-body">
          <div id="ne-error" class="form-error hidden"></div>
          <div class="field"><label>Title <span class="req">*</span></label>
            <input class="input" name="title" required value="${esc(n.title)}"></div>
          <div class="field-row">
            <div class="field"><label>Category</label>
              <select class="input" name="category">
                <option ${n.category === 'College' ? 'selected' : ''}>College</option>
                <option ${n.category === 'Library' ? 'selected' : ''}>Library</option>
              </select></div>
            <div class="field"><label>Date</label>
              <input class="input" type="date" name="posted_on" value="${esc(n.posted_on)}"></div>
          </div>
          <div class="field"><label>Description</label>
            <textarea class="textarea" name="description">${esc(n.description || '')}</textarea></div>
          <label class="file-check"><input type="checkbox" name="archived" ${n.archived ? 'checked' : ''}> Archived (hidden from students)</label>
        </div>
        <div class="modal-foot">
          <button class="btn btn-outline" type="button" data-x>Cancel</button>
          <button class="btn" type="submit" id="ne-save">Save changes</button>
        </div>
      </form>
    </div>`);

  overlay.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', closeModal));
  overlay.querySelector('#notice-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('ne-save');
    const errBox = document.getElementById('ne-error');
    btn.disabled = true;
    try {
      await api('/api/admin/notices/' + n.notice_id, {
        method: 'PUT',
        body: {
          title: e.target.title.value.trim(),
          description: e.target.description.value.trim(),
          category: e.target.category.value,
          posted_on: e.target.posted_on.value,
          archived: e.target.archived.checked,
        },
      });
      closeModal();
      toast('Notice updated.', 'ok');
      loadNotices();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
      btn.disabled = false;
    }
  });
}

/* --------------------------- confirm dialog -------------------------- */
function confirmDialog(title, message, confirmLabel = 'Delete') {
  return new Promise((resolve) => {
    const overlay = openModal(`
      <div class="modal" style="max-width:430px">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="modal-close" type="button" data-x>✕</button>
        </div>
        <div class="modal-body"><p style="margin:0">${esc(message)}</p></div>
        <div class="modal-foot">
          <button class="btn btn-outline" type="button" data-no>Cancel</button>
          <button class="btn btn-danger" type="button" data-yes>${esc(confirmLabel)}</button>
        </div>
      </div>`);
    const done = (v) => { closeModal(); resolve(v); };
    overlay.querySelector('[data-x]').addEventListener('click', () => done(false));
    overlay.querySelector('[data-no]').addEventListener('click', () => done(false));
    overlay.querySelector('[data-yes]').addEventListener('click', () => done(true));
  });
}
