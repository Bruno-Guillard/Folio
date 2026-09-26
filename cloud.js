const FolioCloud = (() => {
  'use strict';

  const SUPABASE_URL = 'https://busesheskvlgpuewlskj.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_H1S2zvSN61JJ1nzl8-jOww_8JuynSJP';
  const BUCKET = 'folio-photos';
  const SESSION_KEY = 'folio-supabase-session-v1';

  let session = null;
  let refreshPromise = null;

  const encodePath = path => String(path).split('/').map(encodeURIComponent).join('/');

  function saveSession(next) {
    session = next || null;
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  function loadStoredSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.access_token || !parsed?.refresh_token) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function sessionFromAuthPayload(data, fallbackRefreshToken = null) {
    const expiresIn = Number(data?.expires_in) || 3600;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || fallbackRefreshToken,
      expires_at: Date.now() + Math.max(30, expiresIn - 30) * 1000,
      user: data.user || session?.user || null
    };
  }

  async function authFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('apikey', PUBLISHABLE_KEY);
    if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData) && !(options.body instanceof Blob)) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  }

  async function signIn(email, password) {
    const response = await authFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.msg || data?.error_description || data?.message || 'Connexion impossible');
    saveSession(sessionFromAuthPayload(data));
    return session;
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;
    if (!session?.refresh_token) throw new Error('Session expirée');
    refreshPromise = (async () => {
      const response = await authFetch('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        saveSession(null);
        throw new Error(data?.msg || data?.error_description || data?.message || 'Session expirée');
      }
      saveSession(sessionFromAuthPayload(data, session?.refresh_token));
      return session;
    })();
    try { return await refreshPromise; }
    finally { refreshPromise = null; }
  }

  async function getUser() {
    if (!session?.access_token) return null;
    const response = await authFetch('/auth/v1/user', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (response.status === 401) {
      await refreshSession();
      return getUser();
    }
    if (!response.ok) return null;
    const user = await response.json();
    session.user = user;
    saveSession(session);
    return user;
  }

  async function restoreSession() {
    session = loadStoredSession();
    if (!session) return null;
    try {
      if (!session.expires_at || Date.now() >= session.expires_at) await refreshSession();
      const user = await getUser();
      if (!user) {
        saveSession(null);
        return null;
      }
      return session;
    } catch (_) {
      saveSession(null);
      return null;
    }
  }

  async function signOut() {
    if (session?.access_token) {
      try {
        await authFetch('/auth/v1/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
      } catch (_) {}
    }
    saveSession(null);
  }

  async function apiFetch(path, options = {}, retry = true) {
    if (!session?.access_token) throw new Error('Non connecté');
    if (session.expires_at && Date.now() >= session.expires_at) await refreshSession();

    const headers = new Headers(options.headers || {});
    headers.set('apikey', PUBLISHABLE_KEY);
    headers.set('Authorization', `Bearer ${session.access_token}`);
    if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData) && !(options.body instanceof Blob)) {
      headers.set('Content-Type', 'application/json');
    }

    let response;
    try {
      response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
    } catch (err) {
      throw new Error('Connexion réseau indisponible');
    }

    if (response.status === 401 && retry) {
      await refreshSession();
      return apiFetch(path, options, false);
    }
    return response;
  }

  async function jsonRequest(path, options = {}) {
    const response = await apiFetch(path, options);
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch (_) { data = text; }
    }
    if (!response.ok) {
      const message = data?.message || data?.msg || data?.error || data?.hint || `Erreur ${response.status}`;
      throw new Error(message);
    }
    return data;
  }

  function requireUserId() {
    const id = session?.user?.id;
    if (!id) throw new Error('Utilisateur introuvable');
    return id;
  }

  function toIso(value, fallback = Date.now()) {
    const n = Number(value);
    return new Date(Number.isFinite(n) ? n : fallback).toISOString();
  }

  function folderPayload(folder) {
    return {
      id: folder.id,
      user_id: requireUserId(),
      name: folder.name || '',
      sort_order: Number.isFinite(Number(folder.order)) ? Number(folder.order) : 0,
      created_at: toIso(folder.createdAt),
      updated_at: toIso(folder.updatedAt || folder.createdAt)
    };
  }

  function itemPayload(item) {
    return {
      id: item.id,
      user_id: requireUserId(),
      folder_id: item.folderId || null,
      name: item.name || '',
      description: item.description || '',
      purchase_price: item.buyPrice === '' || item.buyPrice === null || item.buyPrice === undefined ? null : Number(item.buyPrice),
      sale_price: item.sellPrice === '' || item.sellPrice === null || item.sellPrice === undefined ? null : Number(item.sellPrice),
      fees: item.fees === '' || item.fees === null || item.fees === undefined ? 0 : Number(item.fees),
      sort_order: Number.isFinite(Number(item.order)) ? Number(item.order) : 0,
      created_at: toIso(item.createdAt),
      updated_at: toIso(item.updatedAt || item.createdAt)
    };
  }

  async function upsertFolder(folder) {
    await jsonRequest('/rest/v1/folio_folders?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([folderPayload(folder)])
    });
  }

  async function upsertItem(item) {
    await jsonRequest('/rest/v1/folio_items?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([itemPayload(item)])
    });
  }

  async function getPhotoRowsForItem(itemId) {
    return await jsonRequest(`/rest/v1/folio_photos?select=*&item_id=eq.${encodeURIComponent(itemId)}&order=sort_order.asc,created_at.asc`) || [];
  }

  function extensionForBlob(blob) {
    const type = String(blob?.type || '').toLowerCase();
    if (type.includes('png')) return 'png';
    if (type.includes('webp')) return 'webp';
    if (type.includes('gif')) return 'gif';
    if (type.includes('avif')) return 'avif';
    if (type.includes('heic')) return 'heic';
    if (type.includes('heif')) return 'heif';
    return 'jpg';
  }

  async function uploadBlob(path, blob) {
    const response = await apiFetch(`/storage/v1/object/${BUCKET}/${encodePath(path)}`, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'application/octet-stream'
      },
      body: blob
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || data?.error || `Impossible d’envoyer une photo (${response.status})`);
    }
  }

  async function removeStoragePaths(paths) {
    const clean = [...new Set((paths || []).filter(Boolean))];
    if (!clean.length) return;
    const response = await apiFetch(`/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      body: JSON.stringify({ prefixes: clean })
    });
    if (!response.ok) {
      // Le nettoyage d’anciens fichiers ne doit pas bloquer une fiche déjà enregistrée.
      console.warn('Folio: nettoyage Storage incomplet', await response.text().catch(() => ''));
    }
  }

  async function replaceItemPhotos(itemId, blobs) {
    const oldRows = await getPhotoRowsForItem(itemId);
    const userId = requireUserId();
    const uploaded = [];
    const rows = [];

    for (let i = 0; i < (blobs || []).length; i++) {
      const blob = blobs[i];
      if (!(blob instanceof Blob)) continue;
      const ext = extensionForBlob(blob);
      const fileId = crypto.randomUUID();
      const path = `${userId}/${itemId}/${String(i).padStart(3, '0')}-${fileId}.${ext}`;
      await uploadBlob(path, blob);
      uploaded.push(path);
      rows.push({
        id: crypto.randomUUID(),
        user_id: userId,
        item_id: itemId,
        storage_path: path,
        sort_order: i,
        created_at: new Date().toISOString()
      });
    }

    try {
      await jsonRequest(`/rest/v1/folio_photos?item_id=eq.${encodeURIComponent(itemId)}`, { method: 'DELETE' });
      if (rows.length) {
        await jsonRequest('/rest/v1/folio_photos', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(rows)
        });
      }
    } catch (err) {
      await removeStoragePaths(uploaded).catch(() => {});
      throw err;
    }

    await removeStoragePaths(oldRows.map(r => r.storage_path));
  }

  async function saveItemWithPhotos(item) {
    await upsertItem(item);
    await replaceItemPhotos(item.id, item.photos || []);
  }

  async function deleteItem(itemId) {
    const rows = await getPhotoRowsForItem(itemId);
    await jsonRequest(`/rest/v1/folio_items?id=eq.${encodeURIComponent(itemId)}`, { method: 'DELETE' });
    await removeStoragePaths(rows.map(r => r.storage_path));
  }

  async function deleteFolder(folderId) {
    await jsonRequest(`/rest/v1/folio_folders?id=eq.${encodeURIComponent(folderId)}`, { method: 'DELETE' });
  }

  async function fetchLibrary() {
    const [folders, items, photos] = await Promise.all([
      jsonRequest('/rest/v1/folio_folders?select=*&order=sort_order.asc,created_at.asc'),
      jsonRequest('/rest/v1/folio_items?select=*&order=folder_id.asc,sort_order.asc,created_at.asc'),
      jsonRequest('/rest/v1/folio_photos?select=*&order=item_id.asc,sort_order.asc,created_at.asc')
    ]);
    return { folders: folders || [], items: items || [], photos: photos || [] };
  }

  async function downloadPhoto(path) {
    const response = await apiFetch(`/storage/v1/object/authenticated/${BUCKET}/${encodePath(path)}`, { method: 'GET' });
    if (!response.ok) throw new Error(`Photo inaccessible (${response.status})`);
    return await response.blob();
  }

  return {
    restoreSession,
    signIn,
    signOut,
    isSignedIn: () => !!session?.access_token,
    getSession: () => session,
    getUser: () => session?.user || null,
    upsertFolder,
    upsertItem,
    saveItemWithPhotos,
    replaceItemPhotos,
    deleteItem,
    deleteFolder,
    fetchLibrary,
    downloadPhoto,
    getPhotoRowsForItem
  };
})();
