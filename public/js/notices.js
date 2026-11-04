/* Notice board page: reverse-chronological list with College / Library filter. */
'use strict';

let category = '';

document.addEventListener('DOMContentLoaded', () => {
  const p = new URLSearchParams(location.search);
  category = ['College', 'Library'].includes(p.get('category') || '') ? p.get('category') : '';

  document.getElementById('cat-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    category = chip.dataset.cat;
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    history.replaceState(null, '', 'notices.html' + qs);
    load();
  });

  load();
});

async function load() {
  const box = document.getElementById('notice-list');
  const count = document.getElementById('notice-count');
  document.querySelectorAll('#cat-chips .chip').forEach((c) =>
    c.classList.toggle('active', (c.dataset.cat || '') === category));

  try {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    const { notices } = await api('/api/notices' + qs);
    count.textContent = `${notices.length} notice${notices.length === 1 ? '' : 's'}`;

    if (!notices.length) {
      box.innerHTML = `
        <div class="empty">
          <div class="big">📭</div>
          <h3>No notices found</h3>
          <p>There are no ${esc(category.toLowerCase())} notices right now — check back soon.</p>
        </div>`;
      return;
    }

    box.innerHTML = notices.map((n) => {
      const cat = n.category === 'College' ? 'college' : 'library';
      return `
        <article class="notice-card cat-${cat}">
          <div class="notice-top">
            <span class="cat-pill ${cat}">${esc(n.category)}</span>
            <span class="notice-date">${fmtDate(n.posted_on)}</span>
            ${n.posted_by ? `<span class="notice-date">· ${esc(n.posted_by)}</span>` : ''}
          </div>
          <h3>${esc(n.title)}</h3>
          <p>${esc(n.description || '')}</p>
        </article>`;
    }).join('');
  } catch (err) {
    count.textContent = '';
    box.innerHTML = `<div class="empty"><h3>Could not load notices</h3><p>${esc(err.message)}</p></div>`;
  }
}
