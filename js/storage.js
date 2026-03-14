'use strict';

const Storage = (() => {

  const KEY        = 'wishlist_v1';
  const ROUTES_KEY = 'wishlist_routes_v1';

  // ── localStorage helpers ────────────────────────────────────────────────────

  function _lsGet()        { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
  function _lsSet(items)   { localStorage.setItem(KEY, JSON.stringify(items)); }
  function _lsGetR()       { try { return JSON.parse(localStorage.getItem(ROUTES_KEY) || '[]'); } catch { return []; } }
  function _lsSetR(routes) { localStorage.setItem(ROUTES_KEY, JSON.stringify(routes)); }

  // ── Backend sync layer ──────────────────────────────────────────────────────

  const Backend = (() => {
    let _ok   = false;
    const _base = 'api/';   // relative — works at any subdirectory depth

    /** Ping the PHP backend. Returns true when it is reachable and configured. */
    async function detect() {
      try {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2500);
        const res   = await fetch(_base + 'ping.php', { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) return false;
        const j = await res.json();
        _ok = j.ok === true;
      } catch {
        _ok = false;
      }
      return _ok;
    }

    /**
     * Called once on app start (await it before first render).
     * If backend is available → load server data into localStorage so that
     * all synchronous reads see fresh data from the DB.
     */
    async function init() {
      if (!await detect()) return;
      try {
        const [wishes, routes] = await Promise.all([
          fetch(_base + 'wishes.php').then(r => r.json()),
          fetch(_base + 'routes.php').then(r => r.json()),
        ]);
        if (Array.isArray(wishes)) _lsSet(wishes);
        if (Array.isArray(routes)) _lsSetR(routes);
      } catch (e) {
        console.warn('[Storage] Backend init failed, using localStorage cache:', e);
      }
    }

    /** Fire-and-forget write — failures are silent, localStorage stays as truth. */
    function push(endpoint, method, body, qs = '') {
      if (!_ok) return;
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body !== null) opts.body = JSON.stringify(body);
      fetch(_base + endpoint + '.php' + qs, opts).catch(() => {});
    }

    /** Replace ALL data on backend (used by JSON import). */
    async function syncAll(items, routes) {
      if (!_ok) return;
      try {
        await fetch(_base + 'sync.php', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ items, routes }),
        });
      } catch { /* silent */ }
    }

    return { init, push, syncAll, isAvailable: () => _ok };
  })();

  // ── Public API: reads ───────────────────────────────────────────────────────
  // Always synchronous from localStorage (instant, no latency).

  function getAll()         { return _lsGet(); }
  function getById(id)      { return _lsGet().find(i => i.id === id) || null; }
  function getAllRoutes()    { return _lsGetR(); }
  function getRouteById(id) { return _lsGetR().find(r => r.id === id) || null; }

  // ── Public API: writes ──────────────────────────────────────────────────────
  // Update localStorage first (UI never waits), then sync to backend async.

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
    Backend.push('wishes', 'DELETE', null, '?id=' + encodeURIComponent(id));
  }

  function addVisit(wishId, visit) {
    const items = _lsGet();
    const item  = items.find(i => i.id === wishId);
    if (!item) return null;
    if (!Array.isArray(item.visits)) item.visits = [];
    item.visits.unshift(visit);
    _lsSet(items);
    Backend.push('wishes', 'POST', item);   // visits are embedded inside the item
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
    Backend.push('routes', 'DELETE', null, '?id=' + encodeURIComponent(id));
  }

  // ── Bulk import ─────────────────────────────────────────────────────────────

  async function importAll(items, routes) {
    _lsSet(items);
    _lsSetR(routes);
    await Backend.syncAll(items, routes);
  }

  // ── Pure helpers (no storage) ───────────────────────────────────────────────

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

  // ── Exports ─────────────────────────────────────────────────────────────────

  // init() must be awaited once before the first render.
  return {
    init: Backend.init.bind(Backend),
    isBackend: Backend.isAvailable,
    getAll, getById, save, remove, addVisit, removeVisit, genId,
    avgRating, hasIssue, latestIssue, wasVisited,
    getAllRoutes, saveRoute, removeRoute, getRouteById,
    importAll,
  };

})();
