/* Home page: hero search, statistics, latest notices, digital collection. */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('hero-search');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(form).get('q');
    location.href = 'books.html' + (q ? `?q=${encodeURIComponent(q)}` : '');
  });

  loadStats();
  loadNotices();
  loadDigital();
});

async function loadStats() {
  try {
    const s = await api('/api/stats');
    const hero = document.getElementById('hero-figures').children;
    countUp(hero[0].querySelector('b'), s.books);
    countUp(hero[1].querySelector('b'), s.copies);
    countUp(hero[2].querySelector('b'), s.files);
    countUp(hero[3].querySelector('b'), s.notices);

    const cards = document.getElementById('stat-grid').children;
    countUp(cards[0].querySelector('b'), s.books);
    countUp(cards[1].querySelector('b'), s.copies);
    countUp(cards[2].querySelector('b'), s.files);
    countUp(cards[3].querySelector('b'), s.notices);
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function loadNotices() {
  const box = document.getElementById('latest-notices');
  try {
    const { notices } = await api('/api/notices?limit=3');
    if (!notices.length) {
      box.innerHTML = '<div class="empty"><h3>No notices yet</h3><p>Check back soon for announcements.</p></div>';
      return;
    }
    box.innerHTML = notices.map((n) => noticeCard(n)).join('');
  } catch (err) {
    box.innerHTML = `<div class="empty"><h3>Could not load notices</h3><p>${esc(err.message)}</p></div>`;
  }
}

function noticeCard(n) {
  const cat = n.category === 'College' ? 'college' : 'library';
  return `
    <article class="notice-card cat-${cat}">
      <div class="notice-top">
        <span class="cat-pill ${cat}">${esc(n.category)}</span>
        <span class="notice-date">${fmtDate(n.posted_on)}</span>
      </div>
      <h3>${esc(n.title)}</h3>
      <p>${esc(n.description || '')}</p>
    </article>`;
}

async function loadDigital() {
  const box = document.getElementById('digital-grid');
  try {
    const { books } = await api('/api/books?limit=60');
    const digital = books.filter((b) => b.has_pdf || b.has_audio).slice(0, 6);
    if (!digital.length) {
      box.innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>No digital titles yet</h3><p>The librarian can upload PDF and audio files from the admin panel.</p></div>';
      return;
    }
    box.innerHTML = digital.map(bookCard).join('');
  } catch (err) {
    box.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Could not load the collection</h3><p>${esc(err.message)}</p></div>`;
  }
}
