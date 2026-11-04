/* Catalogue page: live search + availability / format filters. */
'use strict';

const state = { q: '', status: '', digital: '', sort: 'title' };
let debounce = null;

document.addEventListener('DOMContentLoaded', () => {
  // restore state from the query string (?q=, ?status=, ?digital=)
  const p = new URLSearchParams(location.search);
  state.q = p.get('q') || '';
  state.status = p.get('status') || '';
  state.digital = p.get('digital') || '';
  state.sort = p.get('sort') || 'title';

  const qInput = document.getElementById('q');
  qInput.value = state.q;
  qInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.q = qInput.value.trim();
      refresh();
    }, 300);
  });

  document.getElementById('status-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.status = chip.dataset.status;
    refresh();
  });

  document.getElementById('digital-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.digital = chip.dataset.digital;
    refresh();
  });

  document.getElementById('sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    refresh();
  });

  document.getElementById('clear-filters').addEventListener('click', () => {
    state.q = '';
    state.status = '';
    state.digital = '';
    state.sort = 'title';
    qInput.value = '';
    refresh();
  });

  syncChips();
  refresh();
});

function syncChips() {
  document.querySelectorAll('#status-chips .chip').forEach((c) =>
    c.classList.toggle('active', (c.dataset.status || '') === state.status));
  document.querySelectorAll('#digital-chips .chip').forEach((c) =>
    c.classList.toggle('active', (c.dataset.digital || '') === state.digital));
  document.getElementById('sort').value = state.sort;
}

function refresh() {
  syncChips();
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.status) p.set('status', state.status);
  if (state.digital) p.set('digital', state.digital);
  if (state.sort !== 'title') p.set('sort', state.sort);
  const qs = p.toString();
  history.replaceState(null, '', 'books.html' + (qs ? '?' + qs : ''));
  load();
}

async function load() {
  const box = document.getElementById('results');
  const count = document.getElementById('result-count');
  try {
    const params = new URLSearchParams({
      q: state.q, status: state.status, digital: state.digital, sort: state.sort,
    });
    const { books, total } = await api('/api/books?' + params.toString());

    if (!books.length) {
      count.textContent = '0 results';
      box.innerHTML = `
        <div class="empty" style="grid-column:1/-1">
          <div class="big">🔍</div>
          <h3>No results found</h3>
          <p>Try a different title, author or subject — or clear the filters.</p>
        </div>`;
      return;
    }

    const bits = [];
    if (state.q) bits.push(`for “${state.q}”`);
    if (state.status) bits.push(state.status === 'available' ? 'available now' : 'currently issued');
    if (state.digital) bits.push(state.digital === 'pdf' ? 'with PDF' : 'with audio');
    count.textContent = `${total} book${total === 1 ? '' : 's'} ${bits.join(' · ')}`;
    box.innerHTML = books.map(bookCard).join('');
  } catch (err) {
    count.textContent = '';
    box.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Search failed</h3><p>${esc(err.message)}</p></div>`;
  }
}
