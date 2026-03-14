'use strict';

const Storage = (() => {
  const KEY = 'wishlist_v1';

  function getAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveAll(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
  }

  function getById(id) {
    return getAll().find(i => i.id === id) || null;
  }

  // Add or update
  function save(item) {
    const items = getAll();
    const idx = items.findIndex(i => i.id === item.id);
    if (idx >= 0) {
      items[idx] = item;
    } else {
      items.unshift(item); // newest first
    }
    saveAll(items);
    return item;
  }

  function remove(id) {
    saveAll(getAll().filter(i => i.id !== id));
  }

  function addVisit(wishId, visit) {
    const items = getAll();
    const item = items.find(i => i.id === wishId);
    if (!item) return null;
    if (!Array.isArray(item.visits)) item.visits = [];
    item.visits.unshift(visit); // newest first
    saveAll(items);
    return item;
  }

  function removeVisit(wishId, visitId) {
    const items = getAll();
    const item = items.find(i => i.id === wishId);
    if (!item || !Array.isArray(item.visits)) return null;
    item.visits = item.visits.filter(v => v.id !== visitId);
    saveAll(items);
    return item;
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // Helpers
  function avgRating(item) {
    if (!item.visits || item.visits.length === 0) return 0;
    const rated = item.visits.filter(v => v.rating);
    if (rated.length === 0) return 0;
    return rated.reduce((s, v) => s + v.rating, 0) / rated.length;
  }

  function hasIssue(item) {
    return Array.isArray(item.visits) && item.visits.some(v => v.issue);
  }

  function latestIssue(item) {
    if (!Array.isArray(item.visits)) return null;
    const v = item.visits.find(v => v.issue);
    return v ? v.issue : null;
  }

  function wasVisited(item) {
    return Array.isArray(item.visits) && item.visits.length > 0;
  }

  // --- Saved routes ---
  const ROUTES_KEY = 'wishlist_routes_v1';

  function getAllRoutes() {
    try { return JSON.parse(localStorage.getItem(ROUTES_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function saveRoute(route) {
    const routes = getAllRoutes();
    const idx = routes.findIndex(r => r.id === route.id);
    if (idx >= 0) routes[idx] = route; else routes.unshift(route);
    localStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
    return route;
  }

  function removeRoute(id) {
    localStorage.setItem(ROUTES_KEY, JSON.stringify(getAllRoutes().filter(r => r.id !== id)));
  }

  function getRouteById(id) {
    return getAllRoutes().find(r => r.id === id) || null;
  }

  return { getAll, getById, save, remove, addVisit, removeVisit, genId, avgRating, hasIssue, latestIssue, wasVisited, getAllRoutes, saveRoute, removeRoute, getRouteById };
})();
