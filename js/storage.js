'use strict';

const Storage = (() => {

  // localStorage keys are scoped per list so switching lists doesn't mix data
  let _listId   = null;
  const _lsKey  = () => _listId ? `wishlist_v1_${_listId}`        : 'wishlist_v1';
  const _lsKeyR = () => _listId ? `wishlist_routes_v1_${_listId}` : 'wishlist_routes_v1';
  const _lsKeyT = () => 'tripplan_templates';
  const _lsKeyTr= () => 'tripplan_trips';

  // ── Active user (hardcoded test users) ─────────────────────────────────────

  const USERS = {
    alice: { id: 'alice', name: 'Alice', avatar: '🧡' },
    bob:   { id: 'bob',   name: 'Bob',   avatar: '💙' },
  };

  function getActiveUser() {
    const id = localStorage.getItem('active_user') || 'alice';
    return USERS[id] || USERS.alice;
  }

  function setActiveUser(id) {
    localStorage.setItem('active_user', id);
  }

  // ── localStorage helpers ────────────────────────────────────────────────────

  function _lsGet()        { try { return JSON.parse(localStorage.getItem(_lsKey())  || '[]'); } catch { return []; } }
  function _lsSet(items)   { localStorage.setItem(_lsKey(),  JSON.stringify(items)); }
  function _lsGetR()       { try { return JSON.parse(localStorage.getItem(_lsKeyR()) || '[]'); } catch { return []; } }
  function _lsSetR(routes) { localStorage.setItem(_lsKeyR(), JSON.stringify(routes)); }
  function _lsGetT()       { try { return JSON.parse(localStorage.getItem(_lsKeyT()) || '[]'); } catch { return []; } }
  function _lsSetT(ts)     { localStorage.setItem(_lsKeyT(), JSON.stringify(ts)); }
  function _lsGetTr()      { try { return JSON.parse(localStorage.getItem(_lsKeyTr())|| '[]'); } catch { return []; } }
  function _lsSetTr(trips) { localStorage.setItem(_lsKeyTr(), JSON.stringify(trips)); }

  // ── Place migration: old → new model ───────────────────────────────────────

  function _migratePlaceOnRead(item) {
    if (item._migrated_v2) return item;

    // name ← title (old field)
    item.name = item.name || item.title || '';

    // type ← placeType or category
    if (!item.type) {
      if (item.category === 'place')      item.type = item.placeType || 'other';
      else if (item.category === 'experience') item.type = 'experience';
      else if (item.category === 'material')   item.type = 'material';
      else item.type = item.placeType || 'other';
    }

    // status
    if (!item.status) {
      item.status = (Array.isArray(item.visits) && item.visits.length > 0) ? 'visited' : 'wishlist';
    }

    // coordinates ← location
    if (!item.coordinates && item.location) {
      item.coordinates = { lat: item.location.lat, lng: item.location.lng };
    }
    if (!item.address && item.location) {
      item.address = item.location.address || '';
    }

    // new optional fields
    item.metro_stations = item.metro_stations || [];
    item.flags          = item.flags          || [];
    item.comment        = item.comment        || item.description || '';
    item.price_range    = item.price_range    || null;
    item.price_note     = item.price_note     || item.priceText   || '';
    item.added_by       = item.added_by       || 'alice';

    // rating cache — avg of visits
    if (item.rating === undefined || item.rating === null) {
      const visits = item.visits || [];
      const rated  = visits.filter(v => v.rating);
      item.rating  = rated.length
        ? rated.reduce((s, v) => s + v.rating, 0) / rated.length
        : null;
    }

    item._migrated_v2 = true;
    return item;
  }

  // ── Backend sync layer (kept for compatibility, no-op in localStorage mode) ─

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
        Auth.init();
      }
    }

    async function init() {
      if (!_listId) return;
      _ok = true;
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

  // ── Public API: Place reads ─────────────────────────────────────────────────

  function getAll()    { return _lsGet().map(_migratePlaceOnRead); }
  function getById(id) { const item = _lsGet().find(i => i.id === id); return item ? _migratePlaceOnRead(item) : null; }

  function getAllRoutes()    { return _lsGetR(); }
  function getRouteById(id) { return _lsGetR().find(r => r.id === id) || null; }

  // ── Public API: Place writes ────────────────────────────────────────────────

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
    // Update status and rating cache
    item.status = 'visited';
    const rated = item.visits.filter(v => v.rating);
    item.rating = rated.length ? rated.reduce((s, v) => s + v.rating, 0) / rated.length : null;
    _lsSet(items);
    Backend.push('wishes', 'POST', item);
    return _migratePlaceOnRead(item);
  }

  function removeVisit(wishId, visitId) {
    const items = _lsGet();
    const item  = items.find(i => i.id === wishId);
    if (!item || !Array.isArray(item.visits)) return null;
    item.visits = item.visits.filter(v => v.id !== visitId);
    if (item.visits.length === 0) item.status = 'wishlist';
    _lsSet(items);
    Backend.push('wishes', 'POST', item);
    return _migratePlaceOnRead(item);
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

  // ── Templates CRUD ──────────────────────────────────────────────────────────

  function getAllTemplates()    { return _lsGetT(); }
  function getTemplateById(id) { return _lsGetT().find(t => t.id === id) || null; }

  function saveTemplate(template) {
    const ts  = _lsGetT();
    const idx = ts.findIndex(t => t.id === template.id);
    if (idx >= 0) ts[idx] = template; else ts.unshift(template);
    _lsSetT(ts);
    return template;
  }

  function removeTemplate(id) {
    _lsSetT(_lsGetT().filter(t => t.id !== id));
  }

  // ── Trips CRUD ──────────────────────────────────────────────────────────────

  function getAllTrips()    { return _lsGetTr(); }
  function getTripById(id) { return _lsGetTr().find(t => t.id === id) || null; }

  function saveTrip(trip) {
    const trips = _lsGetTr();
    const idx   = trips.findIndex(t => t.id === trip.id);
    if (idx >= 0) trips[idx] = trip; else trips.unshift(trip);
    _lsSetTr(trips);
    return trip;
  }

  function removeTrip(id) {
    _lsSetTr(_lsGetTr().filter(t => t.id !== id));
  }

  function addTripItem(tripId, dayId, item) {
    const trips = _lsGetTr();
    const trip  = trips.find(t => t.id === tripId);
    if (!trip) return null;
    const day   = trip.days.find(d => d.id === dayId);
    if (!day) return null;
    item.id = item.id || genId();
    item.added_by = item.added_by || getActiveUser().id;
    item.votes = item.votes || [];
    item.order = day.items.length;
    day.items.push(item);
    _lsSetTr(trips);
    return trip;
  }

  function removeTripItem(tripId, dayId, itemId) {
    const trips = _lsGetTr();
    const trip  = trips.find(t => t.id === tripId);
    if (!trip) return null;
    const day = trip.days.find(d => d.id === dayId);
    if (!day) return null;
    day.items = day.items.filter(i => i.id !== itemId);
    day.items.forEach((i, idx) => { i.order = idx; });
    _lsSetTr(trips);
    return trip;
  }

  function voteTripItem(tripId, dayId, itemId) {
    const trips  = _lsGetTr();
    const trip   = trips.find(t => t.id === tripId);
    if (!trip) return null;
    const day    = trip.days.find(d => d.id === dayId);
    if (!day) return null;
    const item   = day.items.find(i => i.id === itemId);
    if (!item) return null;
    const userId = getActiveUser().id;
    if (!Array.isArray(item.votes)) item.votes = [];
    const existing = item.votes.findIndex(v => v.user_id === userId);
    if (existing >= 0) item.votes.splice(existing, 1);
    else item.votes.push({ user_id: userId, value: 1 });
    _lsSetTr(trips);
    return trip;
  }

  function addAccommodation(tripId, acc) {
    const trips = _lsGetTr();
    const trip  = trips.find(t => t.id === tripId);
    if (!trip) return null;
    if (!Array.isArray(trip.accommodations)) trip.accommodations = [];
    acc.id = acc.id || genId();
    trip.accommodations.push(acc);
    _lsSetTr(trips);
    return trip;
  }

  function removeAccommodation(tripId, accId) {
    const trips = _lsGetTr();
    const trip  = trips.find(t => t.id === tripId);
    if (!trip) return null;
    trip.accommodations = (trip.accommodations || []).filter(a => a.id !== accId);
    _lsSetTr(trips);
    return trip;
  }

  // ── List switching ──────────────────────────────────────────────────────────

  async function setListId(id) {
    _listId = id;
    await Backend.init();
  }

  // ── Bulk import ─────────────────────────────────────────────────────────────

  async function importAll(items, routes) {
    // Support versioned export format
    if (items && items.version === 2) {
      const data = items;
      _lsSet((data.items || []).map(i => { delete i._migrated_v2; return i; }));
      _lsSetR(data.routes || []);
      if (data.templates) _lsSetT(data.templates);
      if (data.trips)     _lsSetTr(data.trips);
    } else {
      _lsSet(Array.isArray(items) ? items : []);
      _lsSetR(Array.isArray(routes) ? routes : []);
    }
    await Backend.syncAll(_lsGet(), _lsGetR());
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  async function init(listId = null) {
    _listId = listId;
    if (!listId) return;
    Backend.setAvailable(true);
    await Backend.init();
  }

  // ── Pure helpers ─────────────────────────────────────────────────────────────

  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function avgRating(item) {
    if (!item.visits || !item.visits.length) return 0;
    const rated = item.visits.filter(v => v.rating);
    return rated.length ? rated.reduce((s, v) => s + v.rating, 0) / rated.length : 0;
  }

  function hasIssue(item) {
    if (Array.isArray(item.flags) && item.flags.length > 0) return true;
    return Array.isArray(item.visits) && item.visits.some(v => v.issue);
  }
  function wasVisited(item) { return item.status === 'visited' || (Array.isArray(item.visits) && item.visits.length > 0); }

  function latestIssue(item) {
    if (!Array.isArray(item.visits)) return null;
    const v = item.visits.find(v => v.issue);
    return v ? v.issue : null;
  }

  return {
    init, setListId, importAll,
    isBackend: Backend.isAvailable,
    // Users
    getActiveUser, setActiveUser, USERS,
    // Places
    getAll, getById, save, remove, addVisit, removeVisit, genId,
    avgRating, hasIssue, latestIssue, wasVisited,
    // Routes
    getAllRoutes, saveRoute, removeRoute, getRouteById,
    // Templates
    getAllTemplates, getTemplateById, saveTemplate, removeTemplate,
    // Trips
    getAllTrips, getTripById, saveTrip, removeTrip,
    addTripItem, removeTripItem, voteTripItem,
    addAccommodation, removeAccommodation,
  };

})();
