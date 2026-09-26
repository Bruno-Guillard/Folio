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
    backupFile: document.getElementById('backupFile'),
    syncBadge: document.getElementById('syncBadge')
  };

  const state = {
    folders: [],
    watches: [],
    view: { type: 'home', id: null },
    objectUrls: new Set(),
    editingWatchId: null,
    draftPhotos: [],
    suppressWatchClickUntil: 0,
    syncStatus: 'local',
    syncBusy: false,
    lastSyncError: '',
    miscExpenses: 0,
    miscExpensesUpdatedAt: 0,
    miscExpensesPendingSync: false
  };

  const uid = (prefix='id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
  const euro = (v) => Number.isFinite(Number(v)) ? `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €` : '—';
  const num = (v) => v === '' || v === null || v === undefined ? null : Number(v);
  const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));


  const newUuid = () => crypto.randomUUID();
  const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

  function setSyncStatus(status, error='') {
    state.syncStatus = status;
    state.lastSyncError = error || '';
    if (!els.syncBadge) return;
    els.syncBadge.className = `sync-badge ${status}`;
    if (status === 'syncing') {
      els.syncBadge.innerHTML = '<span class="sync-progress">Sync</span>';
      els.syncBadge.title = 'Synchronisation en cours';
    } else if (status === 'synced') {
      els.syncBadge.textContent = 'Synchronisé';
      els.syncBadge.title = 'Bibliothèque synchronisée';
    } else if (status === 'error') {
      els.syncBadge.textContent = 'À synchroniser';
      els.syncBadge.title = error || 'Synchronisation incomplète';
    } else {
      els.syncBadge.textContent = 'Local';
      els.syncBadge.title = 'Données locales — connexion Folio inactive';
    }
  }

  async function stableUuid(namespace, value) {
    const source = `${namespace}:${String(value)}`;
    if (!crypto.subtle) return newUuid();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)));
    const b = digest.slice(0, 16);
    b[6] = (b[6] & 0x0f) | 0x50;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }

  async function normalizeLocalIds() {
    const folders = await WatchDB.getAll('folders');
    const watches = await WatchDB.getAll('watches');
    const needs = folders.some(f => !isUuid(f.id)) || watches.some(w => !isUuid(w.id));
    if (!needs) return false;

    const folderMap = new Map();
    for (const f of folders) folderMap.set(f.id, isUuid(f.id) ? f.id : await stableUuid('folio-folder', f.id));
    const itemMap = new Map();
    for (const w of watches) itemMap.set(w.id, isUuid(w.id) ? w.id : await stableUuid('folio-item', w.id));

    await WatchDB.clear('watches');
    await WatchDB.clear('folders');
    for (const f of folders) {
      await WatchDB.put('folders', {
        ...f,
        id: folderMap.get(f.id),
        pendingSync: true,
        updatedAt: Number(f.updatedAt) || Number(f.createdAt) || Date.now()
      });
    }
    for (const w of watches) {
      await WatchDB.put('watches', {
        ...w,
        id: itemMap.get(w.id),
        folderId: folderMap.get(w.folderId) || w.folderId,
        pendingSync: 'full',
        updatedAt: Number(w.updatedAt) || Number(w.createdAt) || Date.now()
      });
    }
    return true;
  }

  function defaultFolderNamesOnly() {
    if (state.watches.length) return false;
    if (!state.folders.length || state.folders.length > 3) return false;
    const allowed = new Set(['en vente', 'vendus', 'collection']);
    return state.folders.every(f => allowed.has(String(f.name || '').trim().toLocaleLowerCase('fr')));
  }

  async function enqueueDelete(kind, entityId) {
    await WatchDB.put('syncQueue', {
      id: newUuid(),
      kind,
      entityId,
      createdAt: Date.now()
    });
  }

  async function processDeleteQueue() {
    if (!FolioCloud.isSignedIn()) return;
    const jobs = (await WatchDB.getAll('syncQueue')).sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0));
    for (const job of jobs) {
      if (job.kind === 'delete-item') await FolioCloud.deleteItem(job.entityId);
      if (job.kind === 'delete-folder') await FolioCloud.deleteFolder(job.entityId);
      await WatchDB.del('syncQueue', job.id);
    }
  }

  async function clearFolderPending(folderId) {
    const current = await WatchDB.get('folders', folderId);
    if (!current) return;
    await WatchDB.put('folders', { ...current, pendingSync: false });
  }

  async function clearItemPending(itemId) {
    const current = await WatchDB.get('watches', itemId);
    if (!current) return;
    await WatchDB.put('watches', { ...current, pendingSync: false });
  }

  async function saveLocalSettings({ miscExpenses = state.miscExpenses, updatedAt = Date.now(), pendingSync = true } = {}) {
    const next = {
      id: 'main',
      miscExpenses: Math.max(0, Number(miscExpenses) || 0),
      updatedAt: Number(updatedAt) || Date.now(),
      pendingSync: !!pendingSync
    };
    await WatchDB.put('settings', next);
    state.miscExpenses = next.miscExpenses;
    state.miscExpensesUpdatedAt = next.updatedAt;
    state.miscExpensesPendingSync = next.pendingSync;
    return next;
  }

  async function clearSettingsPending() {
    const current = await WatchDB.get('settings', 'main');
    if (!current) return;
    await WatchDB.put('settings', { ...current, pendingSync: false });
    state.miscExpensesPendingSync = false;
  }

  async function syncSettingsRecord(settings, { quiet=false } = {}) {
    if (!FolioCloud.isSignedIn()) return false;
    try {
      setSyncStatus('syncing');
      await FolioCloud.upsertSettings(settings);
      await clearSettingsPending();
      setSyncStatus('synced');
      return true;
    } catch (err) {
      console.error(err);
      setSyncStatus('error', err.message);
      if (!quiet) toast('Frais divers enregistrés localement · synchronisation en attente');
      return false;
    }
  }

  async function syncFolderRecord(folder, { quiet=false } = {}) {
    if (!FolioCloud.isSignedIn()) return false;
    try {
      setSyncStatus('syncing');
      await FolioCloud.upsertFolder(folder);
      await clearFolderPending(folder.id);
      setSyncStatus('synced');
      return true;
    } catch (err) {
      console.error(err);
      setSyncStatus('error', err.message);
      if (!quiet) toast('Enregistré localement · synchronisation en attente');
      return false;
    }
  }

  async function syncItemRecord(item, { full=true, quiet=false } = {}) {
    if (!FolioCloud.isSignedIn()) return false;
    try {
      setSyncStatus('syncing');
      const folder = item.folderId ? await WatchDB.get('folders', item.folderId) : null;
      if (folder?.pendingSync) {
        await FolioCloud.upsertFolder(folder);
        await clearFolderPending(folder.id);
      }
      if (full) await FolioCloud.saveItemWithPhotos(item);
      else await FolioCloud.upsertItem(item);
      await clearItemPending(item.id);
      setSyncStatus('synced');
      return true;
    } catch (err) {
      console.error(err);
      setSyncStatus('error', err.message);
      if (!quiet) toast('Enregistré localement · synchronisation en attente');
      return false;
    }
  }

  async function markAllPendingFull() {
    const folders = await WatchDB.getAll('folders');
    const watches = await WatchDB.getAll('watches');
    for (const f of folders) await WatchDB.put('folders', { ...f, pendingSync: true });
    for (const w of watches) await WatchDB.put('watches', { ...w, pendingSync: 'full' });
    const settings = await WatchDB.get('settings', 'main');
    if (settings) await WatchDB.put('settings', { ...settings, pendingSync: true });
  }


  async function reconcileLocalFoldersWithRemote(remote) {
    if (!remote?.folders?.length) return;
    const localFolders = await WatchDB.getAll('folders');
    const localWatches = await WatchDB.getAll('watches');
    const remoteById = new Map(remote.folders.map(f => [f.id, f]));
    const remoteByName = new Map(remote.folders.map(f => [String(f.name || '').trim().toLocaleLowerCase('fr'), f]));
    let changed = false;

    for (const local of localFolders) {
      if (remoteById.has(local.id)) continue;
      const match = remoteByName.get(String(local.name || '').trim().toLocaleLowerCase('fr'));
      if (!match) continue;

      for (const w of localWatches.filter(x => x.folderId === local.id)) {
        await WatchDB.put('watches', {
          ...w,
          folderId: match.id,
          updatedAt: Date.now(),
          pendingSync: w.pendingSync === 'full' ? 'full' : 'meta'
        });
      }
      await WatchDB.del('folders', local.id);
      const existingRemoteFolder = await WatchDB.get('folders', match.id);
      if (!existingRemoteFolder) {
        await WatchDB.put('folders', {
          id: match.id,
          name: match.name || local.name,
          order: Number(match.sort_order) || 0,
          createdAt: remoteTime(match.created_at),
          updatedAt: remoteTime(match.updated_at),
          pendingSync: false
        });
      }
      changed = true;
    }
    if (changed) await loadData();
  }

  async function pushPending() {
    const folders = await WatchDB.getAll('folders');
    for (const f of folders.filter(x => x.pendingSync)) {
      await FolioCloud.upsertFolder(f);
      await clearFolderPending(f.id);
    }
    const watches = await WatchDB.getAll('watches');
    for (const w of watches.filter(x => x.pendingSync)) {
      if (w.pendingSync === 'meta') await FolioCloud.upsertItem(w);
      else await FolioCloud.saveItemWithPhotos(w);
      await clearItemPending(w.id);
    }
    const settings = await WatchDB.get('settings', 'main');
    if (settings?.pendingSync) {
      await FolioCloud.upsertSettings(settings);
      await clearSettingsPending();
    }
  }

  function remoteTime(value) {
    const n = Date.parse(value || '');
    return Number.isFinite(n) ? n : Date.now();
  }

  async function mapWithConcurrency(list, limit, fn) {
    const out = new Array(list.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= list.length) break;
        out[i] = await fn(list[i], i);
      }
    });
    await Promise.all(workers);
    return out;
  }

  async function applyRemoteLibrary(remote) {
    const existing = new Map((await WatchDB.getAll('watches')).map(w => [w.id, w]));
    const photosByItem = new Map();
    for (const row of remote.photos || []) {
      if (!photosByItem.has(row.item_id)) photosByItem.set(row.item_id, []);
      photosByItem.get(row.item_id).push(row);
    }
    for (const rows of photosByItem.values()) rows.sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0));

    const localItems = await mapWithConcurrency(remote.items || [], 4, async row => {
      const rows = photosByItem.get(row.id) || [];
      const old = existing.get(row.id);
      const updatedAt = remoteTime(row.updated_at);
      let photos = null;
      if (old && !old.pendingSync && Math.abs((Number(old.updatedAt) || 0) - updatedAt) < 1000 && (old.photos || []).length === rows.length) {
        photos = old.photos || [];
      } else {
        try {
          photos = await mapWithConcurrency(rows, 4, r => FolioCloud.downloadPhoto(r.storage_path));
        } catch (err) {
          console.warn('Folio: certaines photos n’ont pas pu être téléchargées', err);
          photos = old?.photos || [];
        }
      }
      return {
        id: row.id,
        folderId: row.folder_id,
        name: row.name || '',
        description: row.description || '',
        buyPrice: row.purchase_price === null ? null : Number(row.purchase_price),
        sellPrice: row.sale_price === null ? null : Number(row.sale_price),
        fees: row.fees === null ? 0 : Number(row.fees),
        order: Number(row.sort_order) || 0,
        photos,
        createdAt: remoteTime(row.created_at),
        updatedAt,
        pendingSync: false
      };
    });

    const localFolders = (remote.folders || []).map(row => ({
      id: row.id,
      name: row.name || '',
      order: Number(row.sort_order) || 0,
      createdAt: remoteTime(row.created_at),
      updatedAt: remoteTime(row.updated_at),
      pendingSync: false
    }));

    await WatchDB.clear('watches');
    await WatchDB.clear('folders');
    for (const f of localFolders) await WatchDB.put('folders', f);
    for (const w of localItems) await WatchDB.put('watches', w);
    if (remote.settings) {
      await WatchDB.put('settings', {
        id: 'main',
        miscExpenses: Number(remote.settings.misc_expenses) || 0,
        updatedAt: remoteTime(remote.settings.updated_at),
        pendingSync: false
      });
    }
    await loadData();
  }

  async function syncNow({ silent=false } = {}) {
    if (!FolioCloud.isSignedIn()) {
      setSyncStatus('local');
      if (!silent) showLoginSheet();
      return false;
    }
    if (state.syncBusy) return false;
    state.syncBusy = true;
    setSyncStatus('syncing');
    try {
      await normalizeLocalIds();
      await loadData();
      await processDeleteQueue();

      let remote = await FolioCloud.fetchLibrary();
      const remoteHasData = (remote.folders?.length || 0) + (remote.items?.length || 0) > 0;
      if (remoteHasData) await reconcileLocalFoldersWithRemote(remote);

      if (remoteHasData && defaultFolderNamesOnly()) {
        // Sur un nouvel appareil, ne pousse pas trois dossiers locaux vides devant une bibliothèque existante.
        await applyRemoteLibrary(remote);
      } else {
        if (!remoteHasData) await markAllPendingFull();
        await pushPending();
        remote = await FolioCloud.fetchLibrary();
        if ((remote.folders?.length || 0) + (remote.items?.length || 0) > 0) await applyRemoteLibrary(remote);
      }

      if (!state.folders.length) {
        await initDefaults();
        await loadData();
        await pushPending();
      }

      setSyncStatus('synced');
      render();
      if (!silent) toast('Folio synchronisé');
      return true;
    } catch (err) {
      console.error(err);
      setSyncStatus('error', err.message);
      if (!silent) alert(`Synchronisation impossible : ${err.message}`);
      return false;
    } finally {
      state.syncBusy = false;
    }
  }

  function showLoginSheet() {
    openSheet(`
      <h2 class="sheet-title">Connexion Folio</h2>
      <form id="loginForm" class="form">
        <div class="login-note">Connecte ton Mac et ton téléphone avec le même compte pour retrouver automatiquement la même bibliothèque.</div>
        <div class="field"><label>Adresse e-mail</label><input id="loginEmail" type="email" autocomplete="username" required></div>
        <div class="field"><label>Mot de passe</label><input id="loginPassword" type="password" autocomplete="current-password" required></div>
        <div class="form-actions"><button type="button" class="btn secondary" data-close>Plus tard</button><button class="btn primary">Se connecter</button></div>
      </form>`);
    els.sheetContent.querySelector('[data-close]').addEventListener('click', closeSheet);
    els.sheetContent.querySelector('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const button = e.currentTarget.querySelector('.btn.primary');
      button.disabled = true;
      button.textContent = 'Connexion…';
      try {
        const email = els.sheetContent.querySelector('#loginEmail').value.trim();
        const password = els.sheetContent.querySelector('#loginPassword').value;
        await FolioCloud.signIn(email, password);
        closeSheet();
        await syncNow({ silent:false });
      } catch (err) {
        console.error(err);
        alert(`Connexion impossible : ${err.message}`);
        button.disabled = false;
        button.textContent = 'Se connecter';
      }
    });
  }

  function showSyncMenu() {
    if (!FolioCloud.isSignedIn()) return showLoginSheet();
    const user = FolioCloud.getUser();
    openSheet(`
      <h2 class="sheet-title">Synchronisation</h2>
      <div class="account-card">Compte Folio :<br><strong>${esc(user?.email || 'Utilisateur connecté')}</strong></div>
      <div class="sheet-list" style="margin-top:10px;">
        <button class="sheet-action" data-sync="now"><strong>Synchroniser maintenant</strong><small>Récupère les changements faits sur tes autres appareils.</small></button>
        <button class="sheet-action" data-sync="logout"><strong>Se déconnecter</strong><small>Les données déjà téléchargées restent disponibles localement sur cet appareil.</small></button>
      </div>`);
    els.sheetContent.querySelector('[data-sync="now"]').addEventListener('click', async () => { closeSheet(); await syncNow({ silent:false }); });
    els.sheetContent.querySelector('[data-sync="logout"]').addEventListener('click', async () => {
      await FolioCloud.signOut();
      closeSheet();
      setSyncStatus('local');
      toast('Synchronisation déconnectée');
    });
  }

  async function syncImportedLibrary() {
    if (!FolioCloud.isSignedIn()) return;
    await normalizeLocalIds();
    await markAllPendingFull();
    await loadData();
    syncNow({ silent:true });
  }

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
    let buy = 0, sell = 0, fees = 0, profit = 0;
    for (const w of watches) {
      buy += num(w.buyPrice) || 0;
      fees += num(w.fees) || 0;
      if (num(w.sellPrice) !== null) sell += num(w.sellPrice) || 0;
      const p = watchProfit(w);
      if (p !== null) profit += p;
    }
    return { buy, sell, fees, profit };
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

  function homeSummaryHtml(t) {
    const misc = Number(state.miscExpenses) || 0;
    const treasury = t.sell - t.buy - t.fees - misc;
    return `
      <section class="summary home-summary">
        <div class="summary-title">Total général</div>
        <div class="summary-grid summary-grid-home">
          <div class="metric"><div class="metric-label">Achat</div><div class="metric-value">${euro(t.buy)}</div></div>
          <div class="metric"><div class="metric-label">Recette</div><div class="metric-value">${euro(t.sell)}</div></div>
          <div class="metric"><div class="metric-label">Trésorerie</div><div class="metric-value ${profitClass(treasury)}">${euro(treasury)}</div></div>
          <div class="metric"><div class="metric-label">Bénéfice</div><div class="metric-value ${profitClass(t.profit)}">${euro(t.profit)}</div></div>
        </div>
        <div class="misc-expense-row">
          <label for="miscExpensesInput">Frais divers</label>
          <div class="misc-expense-input-wrap">
            <input id="miscExpensesInput" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(String(misc))}" aria-label="Frais divers">
            <span>€</span>
          </div>
        </div>
        <div class="treasury-hint">Trésorerie = recettes − achats − frais des fiches − frais divers</div>
      </section>`;
  }

  async function initDefaults() {
    const folders = await WatchDB.getAll('folders');
    if (folders.length) return;
    const now = Date.now();
    const defaults = ['En vente', 'Vendus', 'Collection'];
    for (let i = 0; i < defaults.length; i++) {
      await WatchDB.put('folders', {
        id: newUuid(),
        name: defaults[i],
        order: i,
        createdAt: now + i,
        updatedAt: now + i,
        pendingSync: true
      });
    }
  }

  async function loadData() {
    state.folders = (await WatchDB.getAll('folders')).sort((a,b) => a.createdAt - b.createdAt);
    state.watches = (await WatchDB.getAll('watches')).sort((a,b) => b.createdAt - a.createdAt);
    const settings = await WatchDB.get('settings', 'main');
    state.miscExpenses = Number(settings?.miscExpenses) || 0;
    state.miscExpensesUpdatedAt = Number(settings?.updatedAt) || 0;
    state.miscExpensesPendingSync = !!settings?.pendingSync;
  }

  function folderWatches(folderId) {
    return state.watches
      .filter(w => w.folderId === folderId)
      .sort((a, b) => {
        const ao = Number(a.order);
        const bo = Number(b.order);
        const ah = Number.isFinite(ao);
        const bh = Number.isFinite(bo);
        if (ah && bh && ao !== bo) return ao - bo;
        if (ah !== bh) return ah ? -1 : 1;
        return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
      });
  }

  function topOrderForFolder(folderId, excludeId = null) {
    const orders = state.watches
      .filter(w => w.folderId === folderId && w.id !== excludeId)
      .map(w => Number(w.order))
      .filter(Number.isFinite);
    return orders.length ? Math.min(...orders) - 1 : -1;
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
    els.subtitle.textContent = `${state.watches.length} objet${state.watches.length > 1 ? 's' : ''}`;
    els.fab.setAttribute('aria-label', 'Ajouter un objet');
    const t = totals(state.watches);
    let html = homeSummaryHtml(t);
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
    const watches = folderWatches(folderId);
    els.subtitle.textContent = folder.name;
    const t = totals(watches);
    let html = summaryHtml(t, folder.name);
    html += `<div class="section-head"><div class="section-title">${watches.length} objet${watches.length > 1 ? 's' : ''}</div><button class="text-btn" data-action="folder-menu">Gérer</button></div>`;
    if (!watches.length) {
      html += `<div class="empty"><span class="big">⌚</span>Aucun objet dans ce dossier.<br>Appuie sur ＋ pour en ajouter un.</div>`;
    } else {
      html += `<div class="watch-order-hint">Glisse un objet pour changer sa place. Sur téléphone : appui prolongé puis déplace-le.</div>`;
      html += `<div class="watch-grid" data-watch-grid>${watches.map(watchCardHtml).join('')}</div>`;
    }
    els.main.innerHTML = html;
    bindCommon();
    bindWatchSorting(folderId);
  }

  function watchCardHtml(w) {
    const p = watchProfit(w);
    const first = Array.isArray(w.photos) && w.photos.length ? w.photos[0] : null;
    const photo = first ? `<img class="watch-photo" src="${blobUrl(first)}" alt="${esc(w.name)}">` : `<div class="photo-placeholder">⌚</div>`;
    return `
      <div class="watch-card" data-watch-id="${w.id}" draggable="true" role="button" tabindex="0" aria-label="Ouvrir ${esc(w.name || 'Sans nom')}">
        <div class="watch-drag-handle" aria-hidden="true">≡</div>
        ${photo}
        <div class="watch-body">
          <div class="watch-name">${esc(w.name || 'Sans nom')}</div>
          <div class="watch-money">
            <div><span>Achat</span><strong>${euro(w.buyPrice)}</strong></div>
            <div><span>Vente</span><strong>${num(w.sellPrice) === null ? '—' : euro(w.sellPrice)}</strong></div>
            <div><span>Bénéf.</span><strong class="${p === null ? '' : profitClass(p)}">${p === null ? '—' : euro(p)}</strong></div>
          </div>
        </div>
      </div>`;
  }

  async function persistWatchOrder(folderId, orderedIds) {
    const now = Date.now();
    const byId = new Map(state.watches.filter(w => w.folderId === folderId).map(w => [w.id, w]));
    const changed = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const w = byId.get(orderedIds[i]);
      if (!w) continue;
      const next = { ...w, order: i, updatedAt: now + i, pendingSync: 'meta' };
      await WatchDB.put('watches', next);
      changed.push(next);
    }
    await loadData();
    if (FolioCloud.isSignedIn()) {
      for (const w of changed) await syncItemRecord(w, { full:false, quiet:true });
      await loadData();
    }
  }

  async function moveWatchInFolder(folderId, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const ids = folderWatches(folderId).map(w => w.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    await persistWatchOrder(folderId, ids);
  }

  function bindWatchSorting(folderId) {
    const root = document.querySelector('[data-watch-grid]');
    if (!root) return;
    let draggedId = null;

    root.querySelectorAll('.watch-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        draggedId = card.dataset.watchId;
        state.suppressWatchClickUntil = Date.now() + 600;
        card.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', draggedId); } catch (_) {}
        }
      });
      card.addEventListener('dragover', e => {
        e.preventDefault();
        if (draggedId && draggedId !== card.dataset.watchId) card.classList.add('drag-target');
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-target'));
      card.addEventListener('drop', async e => {
        e.preventDefault();
        e.stopPropagation();
        const fromId = draggedId || e.dataTransfer?.getData('text/plain');
        const toId = card.dataset.watchId;
        state.suppressWatchClickUntil = Date.now() + 700;
        await moveWatchInFolder(folderId, fromId, toId);
        renderFolder(folderId);
        toast('Ordre enregistré');
      });
      card.addEventListener('dragend', () => {
        draggedId = null;
        root.querySelectorAll('.watch-card').forEach(el => el.classList.remove('is-dragging','drag-target'));
      });
    });

    let pressTimer = null;
    let sortingCard = null;
    let pointerId = null;
    let orderChanged = false;

    const stopSort = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
      sortingCard?.classList.remove('is-touch-sorting');
      sortingCard = null;
      pointerId = null;
      root.classList.remove('is-sorting');
    };

    root.querySelectorAll('.watch-card').forEach(card => {
      card.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse') return;
        pointerId = e.pointerId;
        orderChanged = false;
        pressTimer = setTimeout(() => {
          sortingCard = card;
          sortingCard.classList.add('is-touch-sorting');
          root.classList.add('is-sorting');
          state.suppressWatchClickUntil = Date.now() + 1200;
          try { card.setPointerCapture(pointerId); } catch (_) {}
          if (navigator.vibrate) navigator.vibrate(20);
        }, 300);
      });

      card.addEventListener('pointermove', e => {
        if (!sortingCard || e.pointerId !== pointerId) return;
        e.preventDefault();
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.watch-card');
        if (!target || !root.contains(target) || target === sortingCard) return;
        const cards = [...root.querySelectorAll('.watch-card')];
        const from = cards.indexOf(sortingCard);
        const to = cards.indexOf(target);
        if (from < 0 || to < 0) return;
        if (from < to) target.after(sortingCard);
        else target.before(sortingCard);
        orderChanged = true;
      });

      ['pointerup','pointercancel'].forEach(type => card.addEventListener(type, async e => {
        if (e.pointerId !== pointerId) return;
        const changed = orderChanged && !!sortingCard;
        const ids = changed ? [...root.querySelectorAll('.watch-card')].map(el => el.dataset.watchId) : [];
        if (!sortingCard) clearTimeout(pressTimer);
        stopSort();
        if (changed) {
          state.suppressWatchClickUntil = Date.now() + 800;
          await persistWatchOrder(folderId, ids);
          renderFolder(folderId);
          toast('Ordre enregistré');
        }
      }));
    });
  }

  function renderWatch(watchId) {
    const w = state.watches.find(x => x.id === watchId);
    if (!w) return setView('home');
    const folder = state.folders.find(f => f.id === w.folderId);
    els.subtitle.textContent = folder?.name || 'Objet';
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
    document.querySelectorAll('[data-watch-id]').forEach(el => {
      el.addEventListener('click', () => {
        if (Date.now() < state.suppressWatchClickUntil) return;
        setView('watch', el.dataset.watchId);
      });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setView('watch', el.dataset.watchId);
        }
      });
    });
    document.querySelectorAll('[data-action="new-folder"]').forEach(el => el.addEventListener('click', showNewFolder));
    document.querySelectorAll('[data-action="folder-menu"]').forEach(el => el.addEventListener('click', showFolderMenu));
    document.querySelectorAll('[data-action="edit-watch"]').forEach(el => el.addEventListener('click', () => showWatchForm(state.view.id)));
    document.querySelectorAll('[data-action="delete-watch"]').forEach(el => el.addEventListener('click', deleteCurrentWatch));
    const miscInput = document.getElementById('miscExpensesInput');
    if (miscInput) {
      const commitMiscExpenses = async () => {
        const value = Math.max(0, Number(String(miscInput.value).replace(',', '.')) || 0);
        if (Math.abs(value - (Number(state.miscExpenses) || 0)) < 0.005) return;
        const settings = await saveLocalSettings({ miscExpenses: value, updatedAt: Date.now(), pendingSync: true });
        render();
        syncSettingsRecord(settings, { quiet:true });
      };
      miscInput.addEventListener('change', commitMiscExpenses);
      miscInput.addEventListener('blur', commitMiscExpenses);
    }
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
      const now = Date.now();
      const folder = { id: newUuid(), name, order: state.folders.length, createdAt: now, updatedAt: now, pendingSync: true };
      await WatchDB.put('folders', folder);
      await loadData(); closeSheet(); render(); toast('Dossier créé');
      syncFolderRecord(folder, { quiet:true });
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
      const next = { ...folder, name, updatedAt: Date.now(), pendingSync: true };
      await WatchDB.put('folders', next);
      await loadData(); closeSheet(); render(); toast('Dossier renommé');
      syncFolderRecord(next, { quiet:true });
    });
  }

  async function deleteFolder(folder) {
    const watches = state.watches.filter(w => w.folderId === folder.id);
    if (watches.length) {
      alert('Ce dossier contient des objets. Déplace-les ou supprime-les avant de supprimer le dossier.');
      return;
    }
    if (!confirm(`Supprimer le dossier « ${folder.name} » ?`)) return;
    await WatchDB.del('folders', folder.id);
    if (FolioCloud.isSignedIn()) {
      try { await FolioCloud.deleteFolder(folder.id); setSyncStatus('synced'); }
      catch (err) { console.error(err); await enqueueDelete('delete-folder', folder.id); setSyncStatus('error', err.message); }
    } else {
      await enqueueDelete('delete-folder', folder.id);
    }
    await loadData(); closeSheet(); setView('home'); toast('Dossier supprimé');
  }

  function showWatchForm(watchId=null) {
    if (!state.folders.length) { showNewFolder(); return; }
    const w = watchId ? state.watches.find(x => x.id === watchId) : null;
    state.editingWatchId = w?.id || null;
    state.draftPhotos = w?.photos ? [...w.photos] : [];
    const folderId = w?.folderId || (state.view.type === 'folder' ? state.view.id : state.folders[0].id);
    openSheet(`
      <h2 class="sheet-title">${w ? 'Modifier l’objet' : 'Ajouter un objet'}</h2>
      <form id="watchForm" class="form">
        <div class="field"><label>Nom / modèle</label><input id="watchName" value="${esc(w?.name || '')}" placeholder="Ex. Seiko Lord Matic" required></div>
        <div class="field"><label>Dossier</label><select id="watchFolder">${state.folders.map(f=>`<option value="${f.id}" ${f.id===folderId?'selected':''}>${esc(f.name)}</option>`).join('')}</select></div>
        <div id="photoDropZone" class="photo-input-wrap" tabindex="0">
          <label class="btn secondary" style="display:inline-block;">Ajouter des photos<input id="watchPhotos" type="file" accept="image/*" multiple hidden></label>
          <div class="drop-hint">Sur Mac/PC, tu peux aussi glisser tes photos ici.</div>
          <div class="photo-order-hint">Fais glisser les photos pour changer leur ordre. La première est la photo principale.</div>
          <div id="photoPreview" class="photo-preview-grid" aria-label="Photos de l’objet"></div>
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
    const addImageFiles = files => {
      const images = [...files].filter(f => {
        if (!f) return false;
        if (f.type?.startsWith('image/')) return true;
        return /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(f.name || '');
      });
      if (!images.length) return;
      state.draftPhotos.push(...images);
      renderPhotoPreview();
    };

    q('#watchPhotos').addEventListener('change', e => {
      addImageFiles(e.target.files || []);
      e.target.value = '';
    });

    const dropZone = q('#photoDropZone');
    ['dragenter','dragover'].forEach(type => dropZone.addEventListener(type, e => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      dropZone.classList.add('drag-over');
    }));
    ['dragleave','drop'].forEach(type => dropZone.addEventListener(type, e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    }));
    dropZone.addEventListener('drop', e => addImageFiles(e.dataTransfer?.files || []));

    ['#buyPrice','#fees','#sellPrice'].forEach(s => q(s).addEventListener('input', updateProfitPreview));
    q('#watchForm').addEventListener('submit', saveWatchForm);
    renderPhotoPreview();
    updateProfitPreview();
  }

  function moveDraftPhoto(from, to) {
    from = Number(from); to = Number(to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return;
    if (from < 0 || to < 0 || from >= state.draftPhotos.length || to >= state.draftPhotos.length) return;
    const [photo] = state.draftPhotos.splice(from, 1);
    state.draftPhotos.splice(to, 0, photo);
  }

  function renderPhotoPreview() {
    const root = els.sheetContent.querySelector('#photoPreview');
    if (!root) return;
    const old = root.querySelectorAll('img[data-preview-url]');
    old.forEach(img => URL.revokeObjectURL(img.dataset.previewUrl));
    root.innerHTML = state.draftPhotos.map((blob,i) => {
      const url = URL.createObjectURL(blob);
      return `<div class="preview-item" draggable="true" data-photo-item="${i}" aria-label="Photo ${i+1}${i===0?', principale':''}">
        <img src="${url}" data-preview-url="${url}" alt="Photo ${i+1}" draggable="false">
        <button type="button" class="remove-photo" data-remove-photo="${i}" aria-label="Supprimer la photo ${i+1}">×</button>
        <div class="photo-drag-handle" aria-hidden="true">≡</div>
        ${i===0?'<div class="primary-photo-label">Principale</div>':''}
      </div>`;
    }).join('');

    root.querySelectorAll('[data-remove-photo]').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      state.draftPhotos.splice(Number(btn.dataset.removePhoto), 1);
      renderPhotoPreview();
    }));

    let draggedIndex = null;
    root.querySelectorAll('.preview-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        draggedIndex = Number(item.dataset.photoItem);
        item.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', String(draggedIndex)); } catch (_) {}
        }
      });
      item.addEventListener('dragover', e => {
        e.preventDefault();
        item.classList.add('drag-target');
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      });
      item.addEventListener('dragleave', () => item.classList.remove('drag-target'));
      item.addEventListener('drop', e => {
        // Un fichier venant du Finder doit être traité par la zone d’ajout parente.
        if (e.dataTransfer?.files?.length) return;
        e.preventDefault();
        e.stopPropagation();
        const to = Number(item.dataset.photoItem);
        const fromText = e.dataTransfer?.getData('text/plain');
        const from = draggedIndex ?? (fromText === '' ? NaN : Number(fromText));
        moveDraftPhoto(from, to);
        renderPhotoPreview();
      });
      item.addEventListener('dragend', () => {
        draggedIndex = null;
        root.querySelectorAll('.preview-item').forEach(el => el.classList.remove('is-dragging','drag-target'));
      });
    });

    // Réorganisation tactile : appui prolongé puis déplacement sur une autre photo.
    let pressTimer = null;
    let sortingItem = null;
    let sortingIndex = null;
    let pointerId = null;
    let touchOrderChanged = false;

    const stopTouchSort = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
      sortingItem?.classList.remove('is-touch-sorting');
      sortingItem = null;
      sortingIndex = null;
      pointerId = null;
      root.classList.remove('is-sorting');
    };

    root.querySelectorAll('.preview-item').forEach(item => {
      item.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' || e.target.closest('.remove-photo')) return;
        pointerId = e.pointerId;
        sortingIndex = Number(item.dataset.photoItem);
        pressTimer = setTimeout(() => {
          sortingItem = item;
          sortingItem.classList.add('is-touch-sorting');
          root.classList.add('is-sorting');
          try { item.setPointerCapture(pointerId); } catch (_) {}
          if (navigator.vibrate) navigator.vibrate(20);
        }, 260);
      });

      item.addEventListener('pointermove', e => {
        if (!sortingItem || e.pointerId !== pointerId) return;
        e.preventDefault();
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.preview-item');
        if (!target || !root.contains(target)) return;
        const targetIndex = Number(target.dataset.photoItem);
        if (!Number.isInteger(targetIndex) || targetIndex === sortingIndex) return;
        moveDraftPhoto(sortingIndex, targetIndex);

        if (sortingIndex < targetIndex) target.after(sortingItem);
        else target.before(sortingItem);

        [...root.querySelectorAll('.preview-item')].forEach((el, index) => {
          el.dataset.photoItem = String(index);
        });
        sortingIndex = targetIndex;
        touchOrderChanged = true;
      });

      ['pointerup','pointercancel'].forEach(type => item.addEventListener(type, e => {
        if (e.pointerId !== pointerId) return;
        const changed = touchOrderChanged;
        touchOrderChanged = false;
        if (!sortingItem) clearTimeout(pressTimer);
        stopTouchSort();
        if (changed) renderPhotoPreview();
      }));
    });
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
      id: old?.id || newUuid(),
      name: q('#watchName').value.trim(),
      folderId: q('#watchFolder').value,
      description: q('#watchDescription').value.trim(),
      buyPrice: num(q('#buyPrice').value),
      fees: num(q('#fees').value),
      sellPrice: num(q('#sellPrice').value),
      photos: [...state.draftPhotos],
      order: old && old.folderId === q('#watchFolder').value ? old.order : topOrderForFolder(q('#watchFolder').value, old?.id || null),
      createdAt: old?.createdAt || Date.now(),
      updatedAt: Date.now(),
      pendingSync: 'full'
    };
    await WatchDB.put('watches', data);
    await loadData();
    const id = data.id;
    closeSheet();
    setView('watch', id);
    toast(old ? 'Objet modifié' : 'Objet ajouté');
    syncItemRecord(data, { full:true, quiet:true }).then(loadData).catch(console.error);
  }

  async function deleteCurrentWatch() {
    const w = state.watches.find(x => x.id === state.view.id);
    if (!w) return;
    if (!confirm(`Supprimer « ${w.name || 'cet objet'} » ?`)) return;
    const folderId = w.folderId;
    await WatchDB.del('watches', w.id);
    if (FolioCloud.isSignedIn()) {
      try { await FolioCloud.deleteItem(w.id); setSyncStatus('synced'); }
      catch (err) { console.error(err); await enqueueDelete('delete-item', w.id); setSyncStatus('error', err.message); }
    } else {
      await enqueueDelete('delete-item', w.id);
    }
    await loadData();
    setView('folder', folderId);
    toast('Objet supprimé');
  }

  function showMainMenu() {
    const connected = FolioCloud.isSignedIn();
    openSheet(`
      <h2 class="sheet-title">Menu</h2>
      <div class="sheet-list">
        <button class="sheet-action" data-menu="sync"><strong>${connected ? 'Synchroniser Folio' : 'Activer la synchronisation'}</strong><small>${connected ? 'Récupère les changements faits sur le Mac ou le téléphone.' : 'Connecte cette installation à ta bibliothèque privée.'}</small></button>
        <button class="sheet-action" data-menu="export">Exporter Folio</button>
        <button class="sheet-action" data-menu="import">Importer sur cet appareil</button>
        <button class="sheet-action" data-menu="new-folder">Créer un dossier</button>
      </div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-top:14px;">
        Les données sont conservées localement et, une fois connecté, synchronisées avec ton espace privé Supabase. L’export .folio reste une sauvegarde indépendante.
      </div>`);
    els.sheetContent.querySelector('[data-menu="sync"]').addEventListener('click', showSyncMenu);
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
    if (dataURL instanceof Blob) return dataURL;
    if (typeof dataURL !== 'string' || !dataURL.startsWith('data:')) return null;
    const [meta, data] = dataURL.split(',');
    const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'application/octet-stream';
    const bin = atob(data); const arr = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], {type:mime});
  }

  function safeStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  async function buildBackupPayload() {
    const items = [];
    for (const w of state.watches) {
      const photos = [];
      for (const p of (w.photos || [])) photos.push(await blobToDataURL(p));
      items.push({ ...w, photos });
    }
    return {
      format: 'folio-backup',
      version: 4,
      app: 'Folio',
      exportedAt: new Date().toISOString(),
      settings: {
        miscExpenses: Number(state.miscExpenses) || 0,
        updatedAt: Number(state.miscExpensesUpdatedAt) || Date.now()
      },
      folders: state.folders,
      items
    };
  }

  function downloadPayload(payload, filename) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function exportBackup({ close = true, prefix = 'Folio' } = {}) {
    try {
      const payload = await buildBackupPayload();
      downloadPayload(payload, `${prefix}-${safeStamp()}.folio`);
      if (close) closeSheet();
      toast('Sauvegarde Folio exportée');
      return true;
    } catch (err) {
      console.error(err);
      alert('Impossible de créer la sauvegarde Folio.');
      return false;
    }
  }

  function normalizeImportedBackup(data) {
    const items = Array.isArray(data?.items) ? data.items : data?.watches;
    if (!data || !Array.isArray(data.folders) || !Array.isArray(items)) throw new Error('Format incorrect');
    return {
      version: Number(data.version) || 1,
      exportedAt: data.exportedAt || null,
      settings: data.settings && typeof data.settings === 'object' ? {
        miscExpenses: Math.max(0, Number(data.settings.miscExpenses) || 0),
        updatedAt: Number(data.settings.updatedAt) || 0
      } : null,
      folders: data.folders.filter(f => f && f.id && typeof f.name === 'string'),
      items: items.filter(w => w && w.id)
    };
  }

  async function hydrateImportedItem(w, folderIdMap = new Map()) {
    const photos = (w.photos || []).map(dataURLToBlob).filter(Boolean);
    return {
      ...w,
      folderId: folderIdMap.get(w.folderId) || w.folderId,
      photos,
      createdAt: Number(w.createdAt) || Date.now(),
      updatedAt: Number(w.updatedAt) || Number(w.createdAt) || Date.now()
    };
  }

  function showImportChoice(data, filename) {
    const dateText = data.exportedAt ? new Date(data.exportedAt).toLocaleString('fr-FR') : 'date inconnue';
    const localIds = new Set(state.watches.map(w => w.id));
    const newCount = data.items.filter(w => !localIds.has(w.id)).length;
    openSheet(`
      <h2 class="sheet-title">Importer Folio</h2>
      <div class="import-summary">
        <strong>${esc(filename || 'Sauvegarde Folio')}</strong>
        <span>${data.folders.length} dossier${data.folders.length > 1 ? 's' : ''} · ${data.items.length} objet${data.items.length > 1 ? 's' : ''}</span>
        <span>${newCount} nouvel${newCount > 1 ? 's' : ''} objet${newCount > 1 ? 's' : ''} absent${newCount > 1 ? 's' : ''} de cet appareil</span>
        <span>Sauvegarde : ${esc(dateText)}</span>
      </div>
      <div class="sheet-list">
        <button class="sheet-action import-primary" data-import="new-only"><strong>Nouveaux uniquement</strong><small>Ajoute seulement les objets absents. Aucun objet déjà présent n’est modifié.</small></button>
        <button class="sheet-action" data-import="merge"><strong>Fusionner</strong><small>Ajoute les nouveaux objets et met à jour les objets existants si la sauvegarde est plus récente.</small></button>
        <button class="sheet-action danger" data-import="replace"><strong>Remplacer la collection</strong><small>Une sauvegarde de sécurité de cet appareil sera exportée avant le remplacement.</small></button>
        <button class="sheet-action" data-import="cancel">Annuler</button>
      </div>`);
    els.sheetContent.querySelector('[data-import="new-only"]').addEventListener('click', () => importNewOnly(data));
    els.sheetContent.querySelector('[data-import="merge"]').addEventListener('click', () => mergeBackup(data));
    els.sheetContent.querySelector('[data-import="replace"]').addEventListener('click', () => replaceBackup(data));
    els.sheetContent.querySelector('[data-import="cancel"]').addEventListener('click', closeSheet);
  }

  async function importNewOnly(data) {
    try {
      const localFolders = await WatchDB.getAll('folders');
      const localItems = await WatchDB.getAll('watches');
      const localIds = new Set(localItems.map(w => w.id));
      const newItems = data.items.filter(w => !localIds.has(w.id));

      if (!newItems.length) {
        closeSheet();
        toast('Aucun nouvel objet à importer');
        return;
      }

      const neededFolderIds = new Set(newItems.map(w => w.folderId).filter(Boolean));
      const foldersById = new Map(localFolders.map(f => [f.id, f]));
      const foldersByName = new Map(localFolders.map(f => [String(f.name).trim().toLocaleLowerCase('fr'), f]));
      const incomingFoldersById = new Map(data.folders.map(f => [f.id, f]));
      const folderIdMap = new Map();
      let addedFolders = 0;

      for (const incomingId of neededFolderIds) {
        const incoming = incomingFoldersById.get(incomingId);
        if (!incoming) continue;
        const sameId = foldersById.get(incoming.id);
        const sameName = foldersByName.get(String(incoming.name).trim().toLocaleLowerCase('fr'));
        if (sameId) {
          folderIdMap.set(incoming.id, sameId.id);
        } else if (sameName) {
          folderIdMap.set(incoming.id, sameName.id);
        } else {
          const next = {
            ...incoming,
            createdAt: Number(incoming.createdAt) || Date.now(),
            updatedAt: Number(incoming.updatedAt) || Number(incoming.createdAt) || Date.now()
          };
          await WatchDB.put('folders', next);
          folderIdMap.set(incoming.id, next.id);
          foldersById.set(next.id, next);
          foldersByName.set(String(next.name).trim().toLocaleLowerCase('fr'), next);
          addedFolders++;
        }
      }

      // Dans un dossier déjà présent, les nouveaux objets sont ajoutés à la fin
      // afin de ne pas modifier l’ordre des fiches existantes.
      const nextOrderByFolder = new Map();
      for (const f of localFolders) {
        const existing = localItems.filter(w => w.folderId === f.id);
        const maxOrder = existing.map(w => Number(w.order)).filter(Number.isFinite);
        nextOrderByFolder.set(f.id, maxOrder.length ? Math.max(...maxOrder) + 1 : existing.length);
      }

      let addedItems = 0;
      for (const incoming of newItems) {
        const next = await hydrateImportedItem(incoming, folderIdMap);
        if (!next.folderId || !foldersById.has(next.folderId)) continue;
        const existingFolderWasLocal = localFolders.some(f => f.id === next.folderId);
        if (existingFolderWasLocal) {
          const order = nextOrderByFolder.get(next.folderId) ?? 0;
          next.order = order;
          nextOrderByFolder.set(next.folderId, order + 1);
        }
        await WatchDB.put('watches', next);
        addedItems++;
      }

      await loadData();
      closeSheet();
      setView('home');
      toast(`${addedItems} nouvel${addedItems > 1 ? 's' : ''} objet${addedItems > 1 ? 's' : ''} importé${addedItems > 1 ? 's' : ''}`);
      syncImportedLibrary();
    } catch (err) {
      console.error(err);
      alert('Impossible d’importer uniquement les nouveaux objets.');
    }
  }

  async function mergeBackup(data) {
    try {
      const localFolders = await WatchDB.getAll('folders');
      const localItems = await WatchDB.getAll('watches');
      const foldersById = new Map(localFolders.map(f => [f.id, f]));
      const foldersByName = new Map(localFolders.map(f => [String(f.name).trim().toLocaleLowerCase('fr'), f]));
      const folderIdMap = new Map();
      let addedFolders = 0, updatedFolders = 0, addedItems = 0, updatedItems = 0;

      for (const incoming of data.folders) {
        const sameId = foldersById.get(incoming.id);
        const key = String(incoming.name).trim().toLocaleLowerCase('fr');
        const sameName = foldersByName.get(key);
        if (sameId) {
          folderIdMap.set(incoming.id, sameId.id);
          const localTime = Number(sameId.updatedAt) || Number(sameId.createdAt) || 0;
          const incomingTime = Number(incoming.updatedAt) || Number(incoming.createdAt) || 0;
          if (incomingTime > localTime) {
            const next = { ...sameId, ...incoming, updatedAt: incomingTime || Date.now() };
            await WatchDB.put('folders', next);
            foldersById.set(next.id, next);
            foldersByName.set(String(next.name).trim().toLocaleLowerCase('fr'), next);
            updatedFolders++;
          }
        } else if (sameName) {
          folderIdMap.set(incoming.id, sameName.id);
        } else {
          const next = { ...incoming, createdAt: Number(incoming.createdAt) || Date.now(), updatedAt: Number(incoming.updatedAt) || Number(incoming.createdAt) || Date.now() };
          await WatchDB.put('folders', next);
          folderIdMap.set(incoming.id, next.id);
          foldersById.set(next.id, next);
          foldersByName.set(key, next);
          addedFolders++;
        }
      }

      const itemsById = new Map(localItems.map(w => [w.id, w]));
      for (const incoming of data.items) {
        const next = await hydrateImportedItem(incoming, folderIdMap);
        const local = itemsById.get(next.id);
        if (!local) {
          await WatchDB.put('watches', next);
          itemsById.set(next.id, next);
          addedItems++;
          continue;
        }
        const localTime = Number(local.updatedAt) || Number(local.createdAt) || 0;
        const incomingTime = Number(next.updatedAt) || Number(next.createdAt) || 0;
        if (incomingTime > localTime) {
          await WatchDB.put('watches', next);
          itemsById.set(next.id, next);
          updatedItems++;
        }
      }

      if (data.settings) {
        const localSettings = await WatchDB.get('settings', 'main');
        const localTime = Number(localSettings?.updatedAt) || 0;
        const incomingTime = Number(data.settings.updatedAt) || 0;
        if (!localSettings || incomingTime > localTime) {
          await saveLocalSettings({ miscExpenses: data.settings.miscExpenses, updatedAt: incomingTime || Date.now(), pendingSync: true });
        }
      }
      await loadData();
      closeSheet();
      setView('home');
      toast(`Fusion terminée · ${addedItems} ajouté${addedItems > 1 ? 's' : ''}, ${updatedItems} mis à jour`);
      syncImportedLibrary();
    } catch (err) {
      console.error(err);
      alert('Impossible de fusionner cette sauvegarde.');
    }
  }

  async function replaceBackup(data) {
    try {
      const hasLocalData = state.folders.length || state.watches.length;
      if (hasLocalData) {
        const ok = await exportBackup({ close: false, prefix: 'Folio-securite-avant-import' });
        if (!ok) return;
      }

      await WatchDB.clear('watches');
      await WatchDB.clear('folders');
      await WatchDB.clear('settings');
      const folderIds = new Set();
      for (const f of data.folders) {
        const next = { ...f, createdAt: Number(f.createdAt) || Date.now(), updatedAt: Number(f.updatedAt) || Number(f.createdAt) || Date.now() };
        await WatchDB.put('folders', next);
        folderIds.add(next.id);
      }
      for (const w of data.items) {
        const next = await hydrateImportedItem(w);
        if (folderIds.has(next.folderId)) await WatchDB.put('watches', next);
      }
      await saveLocalSettings({
        miscExpenses: data.settings?.miscExpenses || 0,
        updatedAt: data.settings?.updatedAt || Date.now(),
        pendingSync: true
      });

      await loadData();
      closeSheet();
      setView('home');
      toast('Collection remplacée');
      syncImportedLibrary();
    } catch (err) {
      console.error(err);
      alert('Impossible de remplacer la collection. Les données locales n’ont pas été modifiées volontairement après l’erreur.');
    }
  }

  async function importBackup(file) {
    try {
      const data = normalizeImportedBackup(JSON.parse(await file.text()));
      showImportChoice(data, file.name);
    } catch (err) {
      console.error(err);
      alert('Ce fichier n’est pas une sauvegarde Folio valide.');
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
  els.syncBadge?.addEventListener('click', showSyncMenu);
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
    await normalizeLocalIds();
    await loadData();

    const restored = await FolioCloud.restoreSession();
    if (restored) {
      setSyncStatus('syncing');
      if (!state.folders.length) await initDefaults();
      await loadData();
      render();
      await syncNow({ silent:true });
    } else {
      if (!state.folders.length) await initDefaults();
      await loadData();
      setSyncStatus('local');
      render();
      setTimeout(() => showLoginSheet(), 350);
    }
  })();

  window.addEventListener('online', () => {
    if (FolioCloud.isSignedIn()) syncNow({ silent:true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && FolioCloud.isSignedIn()) syncNow({ silent:true });
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine && FolioCloud.isSignedIn()) syncNow({ silent:true });
  }, 60000);
})();
