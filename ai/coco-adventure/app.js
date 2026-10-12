/* UI glue: library, loading adventures from URL/file, input, picture updates. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const log = $('log'), cmd = $('cmd'), menu = $('menu');
  const renderer = new GTARenderer.Renderer($('pic'));
  const store = (() => { try { const s = window.localStorage; s.setItem('gta:test', '1'); s.removeItem('gta:test'); return s; } catch (e) { return null; } })();
  const pref = (k, d) => { try { return store ? (store.getItem('gta:pref:' + k) ?? d) : d; } catch (e) { return d; } };
  const setPref = (k, v) => { try { store && store.setItem('gta:pref:' + k, v); } catch (e) { /* ignore */ } };

  let game = null, lastPicKey = null, lastRoom = null, cmdHistory = [], hIdx = 0, library = [];

  // ---------- output ----------
  function print(text, cls) {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    p.textContent = text;
    log.appendChild(p);
  }
  function scrollDown() { log.scrollTop = log.scrollHeight; }

  function refresh(forceAnim) {
    if (!game) return;
    const st = game.status();
    $('roomName').textContent = st.room;
    $('score').textContent = st.max ? `SCORE ${st.score}/${st.max}` : '';
    $('moves').textContent = `MOVES ${st.turns}`;
    const spec = game.picture();
    if (spec.key !== lastPicKey || forceAnim) {
      const animate = forceAnim || spec.room !== lastRoom || spec.dark !== (lastPicKey || '').includes('#true#');
      lastPicKey = spec.key; lastRoom = spec.room;
      renderer.draw(spec, animate);
    }
    // quick buttons: highlight available exits
    document.querySelectorAll('#quick button[data-dir]').forEach((b) => b.classList.toggle('off', !st.exits.includes(b.dataset.dir)));
  }
  renderer.onImageLoad = () => { if (game) { lastPicKey = null; refresh(); } };

  function autosave() {
    if (!game || !store) return;
    try { store.setItem(`gta:${game.id}:auto`, game.exportSave()); } catch (e) { /* full or blocked */ }
  }

  function run(text) {
    if (!game) return;
    print('> ' + text, 'cmd');
    game.input(text);
    autosave();
    refresh();
    scrollDown();
  }

  // ---------- loading ----------
  function validate(adv) {
    if (!adv || typeof adv !== 'object') throw new Error('Not a JSON object.');
    if (!adv.rooms || !Object.keys(adv.rooms).length) throw new Error('Adventure has no "rooms".');
    if (!adv.start) throw new Error('Adventure has no "start" room.');
    return adv;
  }
  function startAdventure(adv, sourceUrl) {
    validate(adv);
    log.textContent = '';
    game = new GTA.Game(adv, { output: print, storage: store });
    renderer.setAdventure(adv, sourceUrl ? new URL(sourceUrl, location.href).href : location.href);
    renderer.check = (c) => game.check(c);
    lastPicKey = null; lastRoom = null;
    if (adv.theme && !pref('themeLocked', '')) applyTheme(adv.theme, false);
    document.title = (adv.title || 'Adventure') + ' – Graphic Adventure Engine';
    let resumed = false;
    try {
      const saved = store && store.getItem(`gta:${game.id}:auto`);
      if (saved) {
        game.start();
        log.textContent = '';
        game.state = JSON.parse(saved).state;
        print(adv.title || 'Adventure', 'title');
        print('(Resuming where you left off. Type RESTART to begin again.)', 'hint');
        game.describe();
        resumed = true;
      }
    } catch (e) { resumed = false; }
    if (!resumed) { log.textContent = ''; game.start(); }
    setPref('last', sourceUrl || '');
    refresh(true);
    scrollDown();
    if (menu.open) menu.close();
    cmd.focus();
  }

  async function loadUrl(url) {
    $('loadErr').textContent = 'Loading ' + url + ' ...';
    try {
      const bundled = window.GTA_BUNDLE && window.GTA_BUNDLE[url];
      let adv;
      if (location.protocol === 'file:' && bundled) adv = JSON.parse(JSON.stringify(bundled));
      else {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          adv = await res.json();
        } catch (e) {
          if (!bundled) throw e;
          adv = JSON.parse(JSON.stringify(bundled));
        }
      }
      $('loadErr').textContent = '';
      startAdventure(adv, url);
      const u = new URL(location.href);
      u.searchParams.set('adv', url);
      window.history.replaceState(null, '', u);
    } catch (e) {
      $('loadErr').textContent = `Couldn't load that adventure: ${e.message}. ` +
        (/fetch|network|cors/i.test(e.message) ? 'The server must allow cross-origin requests (CORS). GitHub raw, Gist raw and most static hosts do.' : '');
      if (!menu.open) menu.showModal();
    }
  }
  function loadText(text, name) {
    try { startAdventure(JSON.parse(text), null); }
    catch (e) { $('loadErr').textContent = `${name || 'File'}: ${e.message}`; if (!menu.open) menu.showModal(); }
  }

  async function loadLibrary() {
    let list = null;
    try { const r = await fetch('adventures/index.json', { cache: 'no-cache' }); if (r.ok) list = await r.json(); } catch (e) { /* file:// */ }
    if (!list && window.GTA_BUNDLE_INDEX) list = window.GTA_BUNDLE_INDEX;
    library = list || [];
    const el = $('lib');
    el.textContent = '';
    if (!library.length) { el.innerHTML = '<p class="note">No built-in library found. Load an adventure by URL or file below.</p>'; return; }
    for (const a of library) {
      const b = document.createElement('button');
      const t = document.createElement('b'); t.textContent = a.title + (a.year ? ` (${a.year})` : '');
      const d = document.createElement('span'); d.textContent = a.description || '';
      b.append(t, d);
      b.onclick = () => loadUrl('adventures/' + a.file);
      el.appendChild(b);
    }
  }

  // ---------- settings ----------
  function applyTheme(t, save = true) {
    document.body.dataset.theme = t;
    $('theme').value = t;
    if (save) { setPref('theme', t); setPref('themeLocked', '1'); }
  }
  applyTheme(pref('theme', 'phosphor'), false);
  $('theme').onchange = (e) => applyTheme(e.target.value);
  $('speed').value = pref('speed', '60');
  renderer.speed = Number($('speed').value);
  $('speed').onchange = (e) => { renderer.speed = Number(e.target.value); setPref('speed', e.target.value); };
  $('showPic').checked = pref('pic', '1') === '1';
  document.body.classList.toggle('nopic', !$('showPic').checked);
  $('showPic').onchange = (e) => { document.body.classList.toggle('nopic', !e.target.checked); setPref('pic', e.target.checked ? '1' : '0'); };
  $('scan').checked = pref('scan', '1') === '1';
  document.body.classList.toggle('noscan', !$('scan').checked);
  $('scan').onchange = (e) => { document.body.classList.toggle('noscan', !e.target.checked); setPref('scan', e.target.checked ? '1' : '0'); };

  // ---------- events ----------
  $('form').onsubmit = (e) => {
    e.preventDefault();
    const t = cmd.value.trim();
    cmd.value = '';
    if (!t) return;
    cmdHistory.push(t); hIdx = cmdHistory.length;
    if (!game) { menu.showModal(); return; }
    run(t);
  };
  cmd.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && hIdx > 0) { cmd.value = cmdHistory[--hIdx]; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { hIdx = Math.min(cmdHistory.length, hIdx + 1); cmd.value = cmdHistory[hIdx] || ''; e.preventDefault(); }
  });
  $('menuBtn').onclick = () => menu.showModal();
  $('closeMenu').onclick = () => { menu.close(); cmd.focus(); };
  $('loadUrl').onclick = () => { const u = $('url').value.trim(); if (u) loadUrl(u); };
  $('url').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loadUrl').click(); });
  $('loadFile').onclick = () => $('file').click();
  $('file').onchange = async (e) => { const f = e.target.files[0]; if (f) loadText(await f.text(), f.name); e.target.value = ''; };
  menu.querySelectorAll('[data-cmd]').forEach((b) => (b.onclick = () => { menu.close(); run(b.dataset.cmd); cmd.focus(); }));
  $('exportSave').onclick = () => {
    if (!game) return;
    const blob = new Blob([game.exportSave()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${game.id}-save.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('importSave').onclick = () => $('saveFile').click();
  $('saveFile').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f || !game) return;
    try { game.importSave(await f.text()); autosave(); menu.close(); refresh(true); scrollDown(); }
    catch (err) { $('loadErr').textContent = err.message; }
  };
  // drag & drop
  document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drop'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('drop'); });
  document.addEventListener('drop', async (e) => {
    e.preventDefault(); document.body.classList.remove('drop');
    const f = e.dataTransfer.files[0];
    if (f) loadText(await f.text(), f.name);
    else { const u = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'); if (u) loadUrl(u.trim()); }
  });
  // click the picture or log to focus the prompt
  log.addEventListener('click', () => { if (!window.getSelection().toString()) cmd.focus(); });

  // quick command bar
  const quick = [['N', 'north'], ['S', 'south'], ['E', 'east'], ['W', 'west'], ['NE', 'northeast'], ['NW', 'northwest'], ['SE', 'southeast'], ['SW', 'southwest'], ['U', 'up'], ['D', 'down'], ['IN', 'in'], ['OUT', 'out']];
  for (const [label, dir] of quick) {
    const b = document.createElement('button'); b.textContent = label; b.dataset.dir = dir; b.title = dir;
    b.onclick = () => { run(dir); cmd.focus(); }; $('quick').appendChild(b);
  }
  for (const [label, c] of [['LOOK', 'look'], ['INV', 'inventory'], ['WAIT', 'wait'], ['UNDO', 'undo']]) {
    const b = document.createElement('button'); b.textContent = label; b.onclick = () => { run(c); cmd.focus(); }; $('quick').appendChild(b);
  }

  // ---------- boot ----------
  (async function boot() {
    await loadLibrary();
    const params = new URLSearchParams(location.search);
    const want = params.get('adv') || pref('last', '');
    if (want) loadUrl(want);
    else {
      print('GRAPHIC ADVENTURE ENGINE', 'title');
      print('Choose an adventure from the library, or load any adventure JSON by URL or file.', 'byline');
      menu.showModal();
    }
  })();
})();
