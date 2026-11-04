/* Book detail page: availability, PDF reader, streaming audio player. */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) return fail('No book selected.', 'Open the catalogue and pick a title.');
  loadBook(id);
});

function fail(title, msg) {
  document.getElementById('book-root').innerHTML = `
    <div class="empty">
      <div class="big">📕</div>
      <h3>${esc(title)}</h3>
      <p>${esc(msg)}</p>
      <p style="margin-top:14px"><a class="btn btn-outline btn-sm" href="books.html">Back to catalogue</a></p>
    </div>`;
}

async function loadBook(id) {
  const root = document.getElementById('book-root');
  try {
    const { book, files, open_issues } = await api('/api/books/' + encodeURIComponent(id));
    document.title = `${book.title} · E-Library`;
    document.getElementById('crumb-title').textContent = book.title;

    const pdf = files.find((f) => f.file_type === 'PDF');
    const audio = files.find((f) => f.file_type === 'Audio');
    const issued = book.status !== 'Available';

    const statusBadge = issued
      ? '<span class="badge badge-warn">Issued</span>'
      : '<span class="badge badge-ok">Available</span>';

    const dueLine = issued && book.earliest_due
      ? `<div class="due">Earliest expected return: ${fmtDate(book.earliest_due)}</div>` : '';
    const copiesLine = `<div class="copies"><b>${book.available_copies}</b> of ${book.total_copies} copies on the shelf${open_issues ? ` · ${open_issues} out on loan` : ''}</div>`;

    const actions = [];
    if (pdf) {
      actions.push(`<button class="btn btn-lg" id="btn-read" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><path d="M9 13h6M9 17h6"/></svg>
        Read PDF</button>`);
    }
    if (audio) {
      actions.push(`<button class="btn btn-lg btn-outline" id="btn-listen" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="14" width="4.5" height="7" rx="2"/><rect x="17" y="14" width="4.5" height="7" rx="2"/></svg>
        Listen to audio book</button>`);
    }
    actions.push(`<a class="btn btn-lg btn-outline" href="books.html?q=${encodeURIComponent(book.subject || '')}">More in ${esc(book.subject || 'this subject')} →</a>`);

    root.innerHTML = `
      <div class="book-page">
        <div class="panel">
          <div class="book-hero">
            <div class="book-cover" style="background:${coverGradient(book.title)}">
              ${esc((book.title || '?').trim()[0].toUpperCase())}
              <span class="spine-label">E-Library</span>
            </div>
            <div style="min-width:0">
              <div class="book-meta" style="margin-bottom:10px">
                <span class="subject-tag">${esc(book.subject || 'General')}</span>
                ${pdf ? '<span class="badge badge-flat badge-pdf">PDF</span>' : ''}
                ${audio ? '<span class="badge badge-flat badge-audio">AUDIO</span>' : ''}
              </div>
              <h1>${esc(book.title)}</h1>
              <p class="author">${esc(book.author || 'Unknown author')}${book.edition ? ' · ' + esc(book.edition) + ' edition' : ''}</p>
              ${statusBadge}
            </div>
          </div>

          <p class="book-desc">${esc(book.description || 'No description has been added for this title yet.')}</p>

          <table class="meta-table">
            <tr><th>Subject</th><td>${esc(book.subject || '—')}</td></tr>
            <tr><th>ISBN</th><td>${esc(book.isbn || '—')}</td></tr>
            <tr><th>Edition</th><td>${esc(book.edition || '—')}</td></tr>
            <tr><th>Shelf location</th><td>${esc(book.shelf_location || '—')}</td></tr>
            <tr><th>Total copies</th><td>${book.total_copies}</td></tr>
            <tr><th>Added on</th><td>${fmtDate(book.added_on)}</td></tr>
          </table>
        </div>

        <div class="panel">
          <div class="avail-box">
            ${statusBadge}
            ${copiesLine}
            ${dueLine}
          </div>

          <div class="action-stack">${actions.join('')}</div>

          ${pdf || audio ? `
          <div class="tip-box">
            <b>Digital access</b>
            ${pdf ? 'Press <b>Read PDF</b> to open the book in your browser; a download option is available in the viewer. ' : ''}
            ${audio ? 'Press <b>Listen</b> to stream the narrated book with play, pause, seek and volume controls.' : ''}
          </div>` : `
          <div class="tip-box">
            <b>Physical copy only</b>
            This title is kept on the shelf. Check its status above before walking to the library, then borrow it at the issue counter.
          </div>`}

          <div class="tip-box" style="background:var(--line-2);color:var(--ink-2)">
            <b>How to borrow</b>
            Log in with your college account, note the shelf location, and collect the book from the issue counter during library hours.
          </div>
        </div>
      </div>`;

    if (pdf) {
      document.getElementById('btn-read').addEventListener('click', () => {
        openReader(book.title, pdf.file_path, sanitizeName(book.title) + '.pdf');
      });
    }
    if (audio) {
      const player = buildAudioPlayer(book, audio);
      const actionsBox = root.querySelector('.action-stack');
      actionsBox.insertAdjacentElement('afterend', player);
      document.getElementById('btn-listen').addEventListener('click', () => {
        player.scrollIntoView({ behavior: 'smooth', block: 'center' });
        player.querySelector('audio').play().catch(() => {});
      });
    }
  } catch (err) {
    if (err.status === 404) fail('Book not found.', 'This title may have been removed from the catalogue.');
    else fail('Could not load the book.', err.message);
  }
}

function sanitizeName(t) {
  return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'book';
}

/* ------------------------- custom audio player ----------------------- */
function buildAudioPlayer(book, file) {
  const wrap = document.createElement('div');
  wrap.className = 'audio-player';
  wrap.innerHTML = `
    <div class="ap-head">
      <div class="ap-art">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="14" width="4.5" height="7" rx="2"/><rect x="17" y="14" width="4.5" height="7" rx="2"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div class="ap-title">${esc(book.title)}</div>
        <div class="ap-sub">Audio book · ${esc(file.file_name || 'narration')}</div>
      </div>
      <a class="btn btn-sm btn-outline" href="${esc(file.file_path)}" download>Download</a>
    </div>
    <div class="ap-controls">
      <button class="ap-play" type="button" aria-label="Play or pause">
        <svg class="ic-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>
        <svg class="ic-pause hidden" viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>
      </button>
      <span class="ap-time" data-cur>0:00</span>
      <input class="ap-seek" type="range" min="0" max="100" value="0" step="0.1" aria-label="Seek">
      <span class="ap-time" data-dur>0:00</span>
      <div class="ap-vol">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10v4h3l4 3.5v-11L7 10z"/><path d="M15.5 9.5a4 4 0 0 1 0 5M18 7a7.5 7.5 0 0 1 0 10"/></svg>
        <input type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume">
      </div>
    </div>
    <audio src="${esc(file.file_path)}" preload="metadata"></audio>`;

  const audio = wrap.querySelector('audio');
  const playBtn = wrap.querySelector('.ap-play');
  const icPlay = wrap.querySelector('.ic-play');
  const icPause = wrap.querySelector('.ic-pause');
  const seek = wrap.querySelector('.ap-seek');
  const cur = wrap.querySelector('[data-cur]');
  const dur = wrap.querySelector('[data-dur]');
  const vol = wrap.querySelector('.ap-vol input');

  const fmt = (s) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${r}`;
  };

  playBtn.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => toast('Audio could not be played.', 'err'));
    else audio.pause();
  });
  audio.addEventListener('play', () => { icPlay.classList.add('hidden'); icPause.classList.remove('hidden'); });
  audio.addEventListener('pause', () => { icPause.classList.add('hidden'); icPlay.classList.remove('hidden'); });
  audio.addEventListener('loadedmetadata', () => { dur.textContent = fmt(audio.duration); });
  audio.addEventListener('timeupdate', () => {
    cur.textContent = fmt(audio.currentTime);
    seek.value = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  });
  audio.addEventListener('ended', () => { seek.value = 0; cur.textContent = '0:00'; });
  seek.addEventListener('input', () => {
    if (audio.duration) audio.currentTime = (seek.value / 100) * audio.duration;
  });
  vol.addEventListener('input', () => { audio.volume = Number(vol.value); });

  return wrap;
}
