(() => {
  'use strict';

  const els = {
    main: document.getElementById('main'),
    backBtn: document.getElementById('backBtn'),
    menuBtn: document.getElementById('menuBtn'),
    subtitle: document.getElementById('subtitle'),
    fab: document.getElementById('fab'),
    sheet: document.getElementById('sheet'),
    sheetBackdrop: document.getElementById('sheetBackdrop'),
    sheetContent: document.getElementById('sheetContent'),
    backupFile: document.getElementById('backupFile')
  };

  const state = {
    folders: [],
    watches: [],
    view: { type: 'home', id: null },
    objectUrls: new Set(),
    editingWatchId: null,
    draftPhotos: []
  };

  const uid = (prefix='id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
  const euro = (v) => Number.isFinite(Number(v)) ? `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €` : '—';
  const num = (v) => v === '' || v === null || v === undefined ? null : Number(v);
  const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function cleanupObjectUrls() {
    for (const url of state.objectUrls) URL.revokeObjectURL(url);
    state.objectUrls.clear();
  }

  function blobUrl(blob) {
    if (!(blob instanceof Blob)) return null;
    const url = URL.createObjectURL(blob);
    state.objectUrls.add(url);
    return url;
  }

  function watchProfit(w) {
    const sell = num(w.sellPrice);
    if (sell === null) return null;
    return sell - (num(w.buyPrice) || 0) - (num(w.fees) || 0);
  }

  function totals(watches) {
    let buy = 0, sell = 0, profit = 0;
    for (const w of watches) {
      buy += num(w.buyPrice) || 0;
      if (num(w.sellPrice) !== null) sell += num(w.sellPrice) || 0;
      const p = watchProfit(w);
      if (p !== null) profit += p;
    }
    return { buy, sell, profit };
  }

  function profitClass(value) {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return '';
  }

  function summaryHtml(t, title='Total général') {
    return `
      <section class="summary">
        <div class="summary-title">${esc(title)}</div>
        <div class="summary-grid">
          <div class="metric"><div class="metric-label">Achat</div><div class="metric-value">${euro(t.buy)}</div></div>
          <div class="metric"><div class="metric-label">Vente</div><div class="metric-value">${euro(t.sell)}</div></div>
          <div class="metric"><div class="metric-label">Bénéfice</div><div class="metric-value ${profitClass(t.profit)}">${euro(t.profit)}</div></div>
        </div>
      </section>`;
  }

  async function initDefaults() {
    const folders = await WatchDB.getAll('folders');
    if (folders.length) return;
    const now = Date.now();
    const defaults = ['En vente', 'Vendues', 'Perso'];
    for (let i = 0; i < defaults.length; i++) {
      await WatchDB.put('folders', { id: uid('folder'), name: defaults[i], createdAt: now + i });
    }
  }

  async function loadData() {
    state.folders = (await WatchDB.getAll('folders')).sort((a,b) => a.createdAt - b.createdAt);
    state.watches = (await WatchDB.getAll('watches')).sort((a,b) => b.createdAt - a.createdAt);
  }

  function setView(type, id=null) {
    closeSheet();
    state.view = { type, id };
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function render() {
    cleanupObjectUrls();
    const { type, id } = state.view;
    els.backBtn.classList.toggle('hidden', type === 'home');
    els.fab.classList.remove('hidden');

    if (type === 'home') return renderHome();
    if (type === 'folder') return renderFolder(id);
    if (type === 'watch') return renderWatch(id);
  }

  function renderHome() {
    els.subtitle.textContent = `${state.watches.length} montre${state.watches.length > 1 ? 's' : ''}`;
    els.fab.setAttribute('aria-label', 'Ajouter une montre');
    const t = totals(state.watches);
    let html = summaryHtml(t);
    html += `<div class="section-head"><div class="section-title">Dossiers</div><button class="text-btn" data-action="new-folder">＋ Nouveau</button></div>`;

    if (!state.folders.length) {
      html += `<div class="empty"><span class="big">⌁</span>Aucun dossier pour le moment.</div>`;
    } else {
      html += `<div class="folder-grid">`;
      for (const f of state.folders) {
        const fw = state.watches.filter(w => w.folderId === f.id);
        const ft = totals(fw);
        html += `
          <button class="folder-card" data-folder-id="${f.id}">
            <div class="folder-top"><div class="folder-name">${esc(f.name)}</div><div class="folder-count">${fw.length}</div></div>
            <div class="folder-stats">
              <div class="stat-row"><span>Achat</span><strong>${euro(ft.buy)}</strong></div>
              <div class="stat-row"><span>Vente</span><strong>${euro(ft.sell)}</strong></div>
              <div class="stat-row"><span>Bénéfice</span><strong class="${profitClass(ft.profit)}">${euro(ft.profit)}</strong></div>
            </div>
          </button>`;
      }
      html += `</div>`;
    }
    els.main.innerHTML = html;
    bindCommon();
  }

  function renderFolder(folderId) {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return setView('home');
    const watches = state.watches.filter(w => w.folderId === folderId);
    els.subtitle.textContent = folder.name;
    const t = totals(watches);
    let html = summaryHtml(t, folder.name);
    html += `<div class="section-head"><div class="section-title">${watches.length} montre${watches.length > 1 ? 's' : ''}</div><button class="text-btn" data-action="folder-menu">Gérer</button></div>`;
    if (!watches.length) {
      html += `<div class="empty"><span class="big">⌚</span>Aucune montre dans ce dossier.<br>Appuie sur ＋ pour en ajouter une.</div>`;
    } else {
      html += `<div class="watch-grid">${watches.map(watchCardHtml).join('')}</div>`;
    }
    els.main.innerHTML = html;
    bindCommon();
  }

  function watchCardHtml(w) {
    const p = watchProfit(w);
    const first = Array.isArray(w.photos) && w.photos.length ? w.photos[0] : null;
    const photo = first ? `<img class="watch-photo" src="${blobUrl(first)}" alt="${esc(w.name)}">` : `<div class="photo-placeholder">⌚</div>`;
    return `
      <button class="watch-card" data-watch-id="${w.id}">
        ${photo}
        <div class="watch-body">
          <div class="watch-name">${esc(w.name || 'Sans nom')}</div>
          <div class="watch-money">
            <div><span>Achat</span><strong>${euro(w.buyPrice)}</strong></div>
            <div><span>Vente</span><strong>${num(w.sellPrice) === null ? '—' : euro(w.sellPrice)}</strong></div>
            <div><span>Bénéf.</span><strong class="${p === null ? '' : profitClass(p)}">${p === null ? '—' : euro(p)}</strong></div>
          </div>
        </div>
      </button>`;
  }

  function renderWatch(watchId) {
    const w = state.watches.find(x => x.id === watchId);
    if (!w) return setView('home');
    const folder = state.folders.find(f => f.id === w.folderId);
    els.subtitle.textContent = folder?.name || 'Montre';
    els.fab.classList.add('hidden');
    const p = watchProfit(w);
    const photos = Array.isArray(w.photos) ? w.photos : [];
    const urls = photos.map(blobUrl);
    let html = '';
    if (urls.length) {
      html += `<div class="detail-hero"><img id="heroPhoto" src="${urls[0]}" alt="${esc(w.name)}"></div>`;
      if (urls.length > 1) {
        html += `<div class="photo-strip">${urls.map((u,i)=>`<img class="thumb ${i===0?'active':''}" data-photo-index="${i}" src="${u}" alt="Photo ${i+1}">`).join('')}</div>`;
      }
    } else {
      html += `<div class="detail-hero"><div class="photo-placeholder">⌚</div></div>`;
    }
    html += `
      <h1 class="detail-title">${esc(w.name || 'Sans nom')}</h1>
      <div class="detail-folder">${esc(folder?.name || 'Sans dossier')}</div>
      <div class="detail-stats">
        <div class="detail-stat"><span>Achat</span><strong>${euro(w.buyPrice)}</strong></div>
        <div class="detail-stat"><span>Vente</span><strong>${num(w.sellPrice) === null ? '—' : euro(w.sellPrice)}</strong></div>
        <div class="detail-stat"><span>Bénéfice</span><strong class="${p === null ? '' : profitClass(p)}">${p === null ? '—' : euro(p)}</strong></div>
      </div>
      ${num(w.fees) ? `<div class="detail-folder">Frais inclus dans le calcul : ${euro(w.fees)}</div>` : ''}
      ${w.description ? `<div class="detail-description">${esc(w.description)}</div>` : ''}
      <div class="detail-actions">
        <button class="btn secondary" data-action="edit-watch">Modifier</button>
        <button class="btn danger" data-action="delete-watch">Supprimer</button>
      </div>`;
    els.main.innerHTML = html;
    document.querySelectorAll('.thumb').forEach((el, i) => {
      el.addEventListener('click', () => {
        document.getElementById('heroPhoto').src = urls[i];
        document.querySelectorAll('.thumb').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
      });
    });
    bindCommon();
  }

  function bindCommon() {
    document.querySelectorAll('[data-folder-id]').forEach(el => el.addEventListener('click', () => setView('folder', el.dataset.folderId)));
    document.querySelectorAll('[data-watch-id]').forEach(el => el.addEventListener('click', () => setView('watch', el.dataset.watchId)));
    document.querySelectorAll('[data-action="new-folder"]').forEach(el => el.addEventListener('click', showNewFolder));
    document.querySelectorAll('[data-action="folder-menu"]').forEach(el => el.addEventListener('click', showFolderMenu));
    document.querySelectorAll('[data-action="edit-watch"]').forEach(el => el.addEventListener('click', () => showWatchForm(state.view.id)));
    document.querySelectorAll('[data-action="delete-watch"]').forEach(el => el.addEventListener('click', deleteCurrentWatch));
  }

  function openSheet(html) {
    els.sheetContent.innerHTML = html;
    els.sheet.classList.remove('hidden');
    els.sheetBackdrop.classList.remove('hidden');
    els.sheet.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    els.sheet.classList.add('hidden');
    els.sheetBackdrop.classList.add('hidden');
    els.sheet.setAttribute('aria-hidden', 'true');
    els.sheetContent.innerHTML = '';
    state.editingWatchId = null;
    state.draftPhotos = [];
  }

  function showNewFolder() {
    openSheet(`
      <h2 class="sheet-title">Nouveau dossier</h2>
      <form id="folderForm" class="form">
        <div class="field"><label>Nom du dossier</label><input id="folderName" maxlength="50" placeholder="Ex. À réparer" autofocus required></div>
        <div class="form-actions"><button type="button" class="btn secondary" data-close>Annuler</button><button class="btn primary">Créer</button></div>
      </form>`);
    els.sheetContent.querySelector('[data-close]').addEventListener('click', closeSheet);
    els.sheetContent.querySelector('#folderForm').addEventListener('submit', async e => {
      e.preventDefault();
      const name = els.sheetContent.querySelector('#folderName').value.trim();
      if (!name) return;
      await WatchDB.put('folders', { id: uid('folder'), name, createdAt: Date.now() });
      await loadData(); closeSheet(); render(); toast('Dossier créé');
    });
  }

  function showFolderMenu() {
    const folder = state.folders.find(f => f.id === state.view.id);
    if (!folder) return;
    openSheet(`
      <h2 class="sheet-title">${esc(folder.name)}</h2>
      <div class="sheet-list">
        <button class="sheet-action" data-act="rename">Renommer le dossier</button>
        <button class="sheet-action danger" data-act="delete">Supprimer le dossier</button>
      </div>`);
    els.sheetContent.querySelector('[data-act="rename"]').addEventListener('click', () => showRenameFolder(folder));
    els.sheetContent.querySelector('[data-act="delete"]').addEventListener('click', () => deleteFolder(folder));
  }

  function showRenameFolder(folder) {
    openSheet(`
      <h2 class="sheet-title">Renommer</h2>
      <form id="renameFolderForm" class="form">
        <div class="field"><label>Nom du dossier</label><input id="renameFolderName" maxlength="50" value="${esc(folder.name)}" required></div>
        <div class="form-actions"><button type="button" class="btn secondary" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div>
      </form>`);
    els.sheetContent.querySelector('[data-close]').addEventListener('click', closeSheet);
    els.sheetContent.querySelector('#renameFolderForm').addEventListener('submit', async e => {
      e.preventDefault();
      const name = els.sheetContent.querySelector('#renameFolderName').value.trim();
      if (!name) return;
      await WatchDB.put('folders', { ...folder, name });
      await loadData(); closeSheet(); render(); toast('Dossier renommé');
    });
  }

  async function deleteFolder(folder) {
    const watches = state.watches.filter(w => w.folderId === folder.id);
    if (watches.length) {
      alert('Ce dossier contient des montres. Déplace-les ou supprime-les avant de supprimer le dossier.');
      return;
    }
    if (!confirm(`Supprimer le dossier « ${folder.name} » ?`)) return;
    await WatchDB.del('folders', folder.id);
    await loadData(); closeSheet(); setView('home'); toast('Dossier supprimé');
  }

  function showWatchForm(watchId=null) {
    if (!state.folders.length) { showNewFolder(); return; }
    const w = watchId ? state.watches.find(x => x.id === watchId) : null;
    state.editingWatchId = w?.id || null;
    state.draftPhotos = w?.photos ? [...w.photos] : [];
    const folderId = w?.folderId || (state.view.type === 'folder' ? state.view.id : state.folders[0].id);
    openSheet(`
      <h2 class="sheet-title">${w ? 'Modifier la montre' : 'Ajouter une montre'}</h2>
      <form id="watchForm" class="form">
        <div class="field"><label>Nom / modèle</label><input id="watchName" value="${esc(w?.name || '')}" placeholder="Ex. Seiko Lord Matic" required></div>
        <div class="field"><label>Dossier</label><select id="watchFolder">${state.folders.map(f=>`<option value="${f.id}" ${f.id===folderId?'selected':''}>${esc(f.name)}</option>`).join('')}</select></div>
        <div class="photo-input-wrap">
          <label class="btn secondary" style="display:inline-block;">Ajouter des photos<input id="watchPhotos" type="file" accept="image/*" multiple hidden></label>
          <div style="font-size:11px;color:var(--muted);margin-top:8px;">La première photo sera utilisée comme vignette.</div>
          <div id="photoPreview" class="photo-preview-grid"></div>
        </div>
        <div class="field"><label>Description</label><textarea id="watchDescription" placeholder="État, référence, calibre, mesures, notes…">${esc(w?.description || '')}</textarea></div>
        <div class="money-grid">
          <div class="field"><label>Prix d'achat (€)</label><input id="buyPrice" inputmode="decimal" type="number" step="0.01" min="0" value="${w?.buyPrice ?? ''}"></div>
          <div class="field"><label>Frais (€)</label><input id="fees" inputmode="decimal" type="number" step="0.01" min="0" value="${w?.fees ?? ''}"></div>
        </div>
        <div class="field"><label>Prix de vente (€)</label><input id="sellPrice" inputmode="decimal" type="number" step="0.01" min="0" value="${w?.sellPrice ?? ''}" placeholder="Laisser vide si non vendue"></div>
        <div class="profit-preview"><span>Bénéfice calculé</span><strong id="profitPreview">—</strong></div>
        <div class="form-actions"><button type="button" class="btn secondary" data-close>Annuler</button><button class="btn primary">${w ? 'Enregistrer' : 'Ajouter'}</button></div>
      </form>`);

    const q = s => els.sheetContent.querySelector(s);
    q('[data-close]').addEventListener('click', closeSheet);
    q('#watchPhotos').addEventListener('change', e => {
      const files = [...e.target.files].filter(f => f.type.startsWith('image/'));
      state.draftPhotos.push(...files);
      renderPhotoPreview();
      e.target.value = '';
    });
    ['#buyPrice','#fees','#sellPrice'].forEach(s => q(s).addEventListener('input', updateProfitPreview));
    q('#watchForm').addEventListener('submit', saveWatchForm);
    renderPhotoPreview();
    updateProfitPreview();
  }

  function renderPhotoPreview() {
    const root = els.sheetContent.querySelector('#photoPreview');
    if (!root) return;
    const old = root.querySelectorAll('img[data-preview-url]');
    old.forEach(img => URL.revokeObjectURL(img.dataset.previewUrl));
    root.innerHTML = state.draftPhotos.map((blob,i) => {
      const url = URL.createObjectURL(blob);
      return `<div class="preview-item"><img src="${url}" data-preview-url="${url}" alt="Photo"><button type="button" class="remove-photo" data-remove-photo="${i}">×</button>${i===0?'<div class="primary-photo-label">Principale</div>':''}</div>`;
    }).join('');
    root.querySelectorAll('[data-remove-photo]').forEach(btn => btn.addEventListener('click', () => {
      state.draftPhotos.splice(Number(btn.dataset.removePhoto), 1);
      renderPhotoPreview();
    }));
  }

  function updateProfitPreview() {
    const q = s => els.sheetContent.querySelector(s);
    const buy = num(q('#buyPrice')?.value) || 0;
    const fees = num(q('#fees')?.value) || 0;
    const sell = num(q('#sellPrice')?.value);
    const out = q('#profitPreview');
    if (!out) return;
    if (sell === null) { out.textContent = '—'; out.className=''; return; }
    const p = sell - buy - fees;
    out.textContent = euro(p);
    out.className = profitClass(p);
  }

  async function saveWatchForm(e) {
    e.preventDefault();
    const q = s => els.sheetContent.querySelector(s);
    const old = state.editingWatchId ? state.watches.find(x => x.id === state.editingWatchId) : null;
    const data = {
      id: old?.id || uid('watch'),
      name: q('#watchName').value.trim(),
      folderId: q('#watchFolder').value,
      description: q('#watchDescription').value.trim(),
      buyPrice: num(q('#buyPrice').value),
      fees: num(q('#fees').value),
      sellPrice: num(q('#sellPrice').value),
      photos: [...state.draftPhotos],
      createdAt: old?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await WatchDB.put('watches', data);
    await loadData();
    const id = data.id;
    closeSheet();
    setView('watch', id);
    toast(old ? 'Montre modifiée' : 'Montre ajoutée');
  }

  async function deleteCurrentWatch() {
    const w = state.watches.find(x => x.id === state.view.id);
    if (!w) return;
    if (!confirm(`Supprimer « ${w.name || 'cette montre'} » ?`)) return;
    const folderId = w.folderId;
    await WatchDB.del('watches', w.id);
    await loadData();
    setView('folder', folderId);
    toast('Montre supprimée');
  }

  function showMainMenu() {
    openSheet(`
      <h2 class="sheet-title">Menu</h2>
      <div class="sheet-list">
        <button class="sheet-action" data-menu="export">Exporter une sauvegarde</button>
        <button class="sheet-action" data-menu="import">Importer une sauvegarde</button>
        <button class="sheet-action" data-menu="new-folder">Créer un dossier</button>
      </div>`);
    els.sheetContent.querySelector('[data-menu="export"]').addEventListener('click', exportBackup);
    els.sheetContent.querySelector('[data-menu="import"]').addEventListener('click', () => { closeSheet(); els.backupFile.click(); });
    els.sheetContent.querySelector('[data-menu="new-folder"]').addEventListener('click', showNewFolder);
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function dataURLToBlob(dataURL) {
    const [meta, data] = dataURL.split(',');
    const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'application/octet-stream';
    const bin = atob(data); const arr = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], {type:mime});
  }

  async function exportBackup() {
    const watches = [];
    for (const w of state.watches) {
      const photos = [];
      for (const p of (w.photos || [])) photos.push(await blobToDataURL(p));
      watches.push({ ...w, photos });
    }
    const payload = { version: 1, exportedAt: new Date().toISOString(), folders: state.folders, watches };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mes-montres-sauvegarde-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    closeSheet(); toast('Sauvegarde exportée');
  }

  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.folders) || !Array.isArray(data.watches)) throw new Error('Format incorrect');
      if (!confirm('Importer cette sauvegarde remplacera les données actuelles. Continuer ?')) return;
      await WatchDB.clear('watches');
      await WatchDB.clear('folders');
      for (const f of data.folders) await WatchDB.put('folders', f);
      for (const w of data.watches) {
        const photos = (w.photos || []).map(dataURLToBlob);
        await WatchDB.put('watches', { ...w, photos });
      }
      await loadData(); setView('home'); toast('Sauvegarde importée');
    } catch (err) {
      alert('Impossible d’importer cette sauvegarde.');
      console.error(err);
    }
  }

  function toast(message) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div'); el.className='toast'; el.textContent=message; document.body.appendChild(el);
    setTimeout(()=>el.remove(), 2200);
  }

  els.backBtn.addEventListener('click', () => {
    if (state.view.type === 'watch') {
      const w = state.watches.find(x => x.id === state.view.id);
      setView(w?.folderId ? 'folder' : 'home', w?.folderId || null);
    } else setView('home');
  });
  els.menuBtn.addEventListener('click', showMainMenu);
  els.fab.addEventListener('click', () => showWatchForm());
  els.sheetBackdrop.addEventListener('click', closeSheet);
  els.backupFile.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) importBackup(f);
    e.target.value='';
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
  }

  (async () => {
    await WatchDB.open();
    await initDefaults();
    await loadData();
    render();
  })();
})();
