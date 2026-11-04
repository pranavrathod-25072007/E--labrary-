/* ============================================================
   E-Library — shared front-end helpers
   Session state in the header, toasts, modals, formatting.
   ============================================================ */
'use strict';

/** JSON fetch wrapper — cookies are sent automatically (same origin). */
async function api(path, options = {}) {
  const opts = { credentials: 'same-origin', ...options };
  opts.headers = { ...(options.headers || {}) };
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ------------------------------ escaping ---------------------------- */
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ------------------------------ formatting -------------------------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-11-02' → '02 Nov 2026' */
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('');
}

function coverGradient(seed) {
  const s = String(seed || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `linear-gradient(140deg, hsl(${h} 55% 32%), hsl(${(h + 40) % 360} 62% 46%))`;
}

function subjectOf(book) {
  return book.subject || 'General';
}

/** Book card markup shared by home & catalogue pages. */
function bookCard(b) {
  const digital = [
    b.has_pdf ? '<span class="badge badge-flat badge-pdf">PDF</span>' : '',
    b.has_audio ? '<span class="badge badge-flat badge-audio">AUDIO</span>' : '',
  ].join('');
  const status = b.status === 'Available'
    ? '<span class="badge badge-ok">Available</span>'
    : `<span class="badge badge-warn">Issued${b.earliest_due ? ' · due ' + fmtDate(b.earliest_due) : ''}</span>`;
  return `
    <a class="book-card" href="book.html?id=${b.book_id}">
      <div class="book-cover" style="background:${coverGradient(b.title)}">
        ${esc((b.title || '?').trim()[0].toUpperCase())}
        <span class="spine-label">E-Library</span>
      </div>
      <div class="book-body">
        <h3>${esc(b.title)}</h3>
        <p class="author">${esc(b.author || 'Unknown author')}</p>
        <div class="book-meta">
          <span class="subject-tag">${esc(subjectOf(b))}</span>
          ${digital}
        </div>
        <div class="book-shelf">
          ${status}
          ${b.shelf_location ? `<span>· Shelf ${esc(b.shelf_location)}</span>` : ''}
        </div>
      </div>
    </a>`;
}

/* -------------------------------- toast ----------------------------- */
function toast(message, kind = '') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const icon = kind === 'err'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M4 12.5l5 5L20 6.5"/></svg>';
  el.innerHTML = `${icon}<span>${esc(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 320);
  }, 3400);
}

/* ------------------------------- modals ----------------------------- */
function openModal(html) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = html;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  return overlay;
}

function closeModal() {
  const m = document.querySelector('.modal-overlay');
  if (m) m.remove();
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    const reader = document.querySelector('.reader-overlay');
    if (reader) closeReader();
  }
});

/* ------------------------------ reader ------------------------------ */
function openReader(title, src, downloadName) {
  closeReader();
  const el = document.createElement('div');
  el.className = 'reader-overlay';
  el.innerHTML = `
    <div class="reader-bar">
      <b>${esc(title)}</b>
      <span class="spacer"></span>
      <a href="${esc(src)}" download="${esc(downloadName || 'book.pdf')}">Download PDF</a>
      <button type="button" data-close>Close ✕</button>
    </div>
    <iframe class="reader-frame" src="${esc(src)}" title="${esc(title)} — PDF reader"></iframe>`;
  el.querySelector('[data-close]').addEventListener('click', closeReader);
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
}

function closeReader() {
  const r = document.querySelector('.reader-overlay');
  if (r) r.remove();
  document.body.style.overflow = '';
}

/* --------------------------- header / session ----------------------- */
const SESSION = { user: null };

async function loadSession() {
  try {
    const data = await api('/api/auth/me');
    SESSION.user = data.user;
  } catch {
    SESSION.user = null;
  }
  renderAuth();
  return SESSION.user;
}

function isAdmin() { return SESSION.user && SESSION.user.role === 'admin'; }

function renderAuth() {
  const slots = document.querySelectorAll('[data-auth-slot]');
  if (!slots.length) return;
  const u = SESSION.user;
  let html;
  if (!u) {
    html = `
      <a class="btn btn-outline btn-sm" href="login.html">Log in</a>
      <a class="btn btn-sm" href="register.html">Register</a>`;
  } else {
    html = `
      <div class="user-chip">
        <span class="avatar">${esc(initials(u.name))}</span>
        <span class="who"><b>${esc(u.name)}</b><span>${esc(u.role)}${u.roll_no ? ' · ' + esc(u.roll_no) : ''}</span></span>
      </div>
      ${isAdmin() ? '<a class="btn btn-outline btn-sm" href="admin.html">Admin panel</a>' : ''}
      <button class="btn btn-ghost btn-sm" type="button" data-logout>Log out</button>`;
  }
  slots.forEach((slot) => {
    slot.innerHTML = html;
    const btn = slot.querySelector('[data-logout]');
    if (btn) btn.addEventListener('click', logout);
  });
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  SESSION.user = null;
  toast('Logged out.');
  const adminPage = /admin\.html$/.test(location.pathname);
  location.href = adminPage ? 'login.html' : location.pathname + location.search;
}

/* ------------------------------ boot -------------------------------- */
function initHeader() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
  }
  // mark active nav link
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === here || (here === 'book.html' && href === 'books.html')) {
      a.classList.add('active');
    }
  });
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initHeader();
  await loadSession();
  document.dispatchEvent(new Event('session:ready'));
});

/* ------------------------------ motion ------------------------------ */
/** Animated count-up for hero / dashboard statistics. */
function countUp(el, to, dur = 900) {
  if (!el || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (el) el.textContent = to;
    return;
  }
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* Scroll-reveal + staggered card entrances, on every page. Static markup is
   marked as soon as the deferred script runs; cards rendered later are picked
   up by the MutationObserver, so search/filter re-renders animate too. */
(() => {
  const REVEAL = '.section-head, .stat-card, .feature, .notice-card, .book-card, .toolbar, .result-line';
  const STAGGER = '.stat-grid, .feature-grid, .book-grid, .notice-list';

  const stagger = (grid) => {
    if (grid && grid.children.length) {
      [...grid.children].forEach((el, i) => el.style.setProperty('--i', i));
    }
  };

  let io = null;
  try {
    io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -24px 0px' });
  } catch { /* no IntersectionObserver — show everything immediately */ }

  const markOne = (el) => {
    if (el.classList.contains('reveal')) return;
    el.classList.add('reveal');
    if (io) io.observe(el); else el.classList.add('in');
  };
  const mark = (root) => {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(REVEAL)) markOne(root);
    if (root.querySelectorAll) root.querySelectorAll(REVEAL).forEach(markOne);
  };

  document.querySelectorAll(STAGGER).forEach(stagger);
  document.querySelectorAll(REVEAL).forEach(markOne);

  new MutationObserver((muts) => {
    muts.forEach((m) => {
      if (m.target.nodeType === 1 && m.target.matches && m.target.matches(STAGGER)) {
        stagger(m.target);
      }
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        mark(n);
        if (n.matches && n.matches(STAGGER)) stagger(n);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
