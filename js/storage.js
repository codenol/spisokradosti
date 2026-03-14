'use strict';

const Storage = (() => {

  // localStorage keys are scoped per list so switching lists doesn't mix data
  let _listId   = null;
  const _lsKey  = () => _listId ? `wishlist_v1_${_listId}`        : 'wishlist_v1';
  const _lsKeyR = () => _listId ? `wishlist_routes_v1_${_listId}` : 'wishlist_routes_v1';

  // ── localStorage helpers ────────────────────────────────────────────────────

  function _lsGet()        { try { return JSON.parse(localStorage.getItem(_lsKey())  || '[]'); } catch { return []; } }
  function _lsSet(items)   { localStorage.setItem(_lsKey(),  JSON.stringify(items)); }
  function _lsGetR()       { try { return JSON.parse(localStorage.getItem(_lsKeyR()) || '[]'); } catch { return []; } }
  function _lsSetR(routes) { localStorage.setItem(_lsKeyR(), JSON.stringify(routes)); }

  // ── Backend sync layer ──────────────────────────────────────────────────────

  const Backend = (() => {
    let _ok     = false;
    const _base = 'api/';

    function _fetchOpts(method, body) {
      const opts = { method, credentials: 'include', headers: {} };
      if (body !== null) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      return opts;
    }

    function _handle401(res) {
      if (res.status === 401 && typeof Auth !== 'undefined') {
        Auth.init();  // re-show login modal
      }
    }

    /**
     * Called once on app start (after Auth.init() resolved with a user).
     * Loads all data for the current list_id from DB into localStorage cache.
     */
    async function init() {
      if (!_listId) return;
      _ok = true;  // we already know backend is up (Auth.init did the ping)
      try {
        const qs = '?list_id=' + encodeURIComponent(_listId);
        const [wishes, routes] = await Promise.all([
          fetch(_base + 'wishes.php' + qs, { credentials: 'include' }).then(r => {
            _handle401(r); return r.ok ? r.json() : [];
          }),
          fetch(_base + 'routes.php' + qs, { credentials: 'include' }).then(r => {
            _handle401(r); return r.ok ? r.json() : [];
          }),
        ]);
        if (Array.isArray(wishes)) _lsSet(wishes);
        if (Array.isArray(routes)) _lsSetR(routes);
      } catch (e) {
        console.warn('[Storage] Backend init failed, using localStorage cache:', e);
      }
    }

    /** Fire-and-forget — localStorage is always written first so UI is instant. */
    function push(endpoint, method, body, qs = '') {
      if (!_ok || !_listId) return;
      const payload = (body && method !== 'DELETE')
        ? { ...body, list_id: _listId }
        : body;
      fetch(_base + endpoint + '.php' + qs, _fetchOpts(method, payload)).catch(() => {});
    }

    async function syncAll(items, routes) {
      if (!_ok || !_listId) return;
      try {
        await fetch(_base + 'sync.php', _fetchOpts('POST', { list_id: _listId, items, routes }));
      } catch { /* silent */ }
    }

    function setAvailable(val) { _ok = val; }

    return { init, push, syncAll, setAvailable, isAvailable: () => _ok };
  })();

  // ── Public API: reads ───────────────────────────────────────────────────────

  function getAll()         { return _lsGet(); }
  function getById(id)      { return _lsGet().find(i => i.id === id) || null; }
  function getAllRoutes()    { return _lsGetR(); }
  function getRouteById(id) { return _lsGetR().find(r => r.id === id) || null; }

  // ── Public API: writes ──────────────────────────────────────────────────────

  function save(item) {
    const items = _lsGet();
    const idx   = items.findIndex(i => i.id === item.id);
    if (idx >= 0) items[idx] = item; else items.unshift(item);
    _lsSet(items);
    Backend.push('wishes', 'POST', item);
    return item;
  }

  function remove(id) {
    _lsSet(_lsGet().filter(i => i.id !== id));
    const qs = `?id=${encodeURIComponent(id)}&list_id=${encodeURIComponent(_listId || '')}`;
    Backend.push('wishes', 'DELETE', null, qs);
  }

  function addVisit(wishId, visit) {
    const items = _lsGet();
    const item  = items.find(i => i.id === wishId);
    if (!item) return null;
    if (!Array.isArray(item.visits)) item.visits = [];
    item.visits.unshift(visit);
    _lsSet(items);
    Backend.push('wishes', 'POST', item);
    return item;
  }

  function removeVisit(wishId, visitId) {
    const items = _lsGet();
    const item  = items.find(i => i.id === wishId);
    if (!item || !Array.isArray(item.visits)) return null;
    item.visits = item.visits.filter(v => v.id !== visitId);
    _lsSet(items);
    Backend.push('wishes', 'POST', item);
    return item;
  }

  function saveRoute(route) {
    const routes = _lsGetR();
    const idx    = routes.findIndex(r => r.id === route.id);
    if (idx >= 0) routes[idx] = route; else routes.unshift(route);
    _lsSetR(routes);
    Backend.push('routes', 'POST', route);
    return route;
  }

  function removeRoute(id) {
    _lsSetR(_lsGetR().filter(r => r.id !== id));
    const qs = `?id=${encodeURIComponent(id)}&list_id=${encodeURIComponent(_listId || '')}`;
    Backend.push('routes', 'DELETE', null, qs);
  }

  // ── List switching ──────────────────────────────────────────────────────────

  /** Set active list and reload data from backend for that list. */
  async function setListId(id) {
    _listId = id;
    await Backend.init();
  }

  // ── Bulk import ─────────────────────────────────────────────────────────────

  async function importAll(items, routes) {
    _lsSet(items);
    _lsSetR(routes);
    await Backend.syncAll(items, routes);
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  /**
   * Call after Auth.init() resolved.
   * Pass listId = null for guest mode (pure localStorage).
   */
  async function init(listId = null) {
    _listId = listId;
    if (!listId) return;          // guest mode — nothing to fetch
    Backend.setAvailable(true);   // Auth already pinged backend successfully
    await Backend.init();
  }

  // ── Pure helpers ─────────────────────────────────────────────────────────────

  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function avgRating(item) {
    if (!item.visits || !item.visits.length) return 0;
    const rated = item.visits.filter(v => v.rating);
    return rated.length ? rated.reduce((s, v) => s + v.rating, 0) / rated.length : 0;
  }

  function hasIssue(item)   { return Array.isArray(item.visits) && item.visits.some(v => v.issue); }
  function wasVisited(item) { return Array.isArray(item.visits) && item.visits.length > 0; }

  function latestIssue(item) {
    if (!Array.isArray(item.visits)) return null;
    const v = item.visits.find(v => v.issue);
    return v ? v.issue : null;
  }

  return {
    init, setListId, importAll,
    isBackend: Backend.isAvailable,
    getAll, getById, save, remove, addVisit, removeVisit, genId,
    avgRating, hasIssue, latestIssue, wasVisited,
    getAllRoutes, saveRoute, removeRoute, getRouteById,
  };

})();
