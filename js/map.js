'use strict';

const MapModule = (() => {
  // --- State ---
  let mainMap = null;
  let routeMap = null;
  let locationMap = null;
  let locationMarker = null;
  let mainMarkers = {}; // id → L.Marker
  let routeControl = null;
  let selectedForRoute = []; // array of wish ids
  let onRouteSelectionChange = null; // callback

  // --- Marker icons ---
  function createIcon(cls, emoji) {
    return L.divIcon({
      className: '',
      html: `<div class="map-marker ${cls}"><div class="map-marker-inner">${emoji}</div></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -34],
    });
  }

  const ICONS = {
    place_new: () => createIcon('marker-place', '📍'),
    place_visited: () => createIcon('marker-visited', '📍'),
    place_selected: () => createIcon('marker-selected', '🧭'),
    experience_new: () => createIcon('marker-experience', '✨'),
    experience_visited: () => createIcon('marker-visited', '✨'),
    experience_selected: () => createIcon('marker-selected', '✨'),
  };

  function iconFor(item) {
    const sel = selectedForRoute.includes(item.id);
    const visited = Storage.wasVisited(item);
    const cat = item.category;
    if (sel) return ICONS[`${cat}_selected`] ? ICONS[`${cat}_selected`]() : ICONS['place_selected']();
    if (visited) return ICONS[`${cat}_visited`] ? ICONS[`${cat}_visited`]() : ICONS['place_visited']();
    return ICONS[`${cat}_new`] ? ICONS[`${cat}_new`]() : ICONS['place_new']();
  }

  // --- Init main map ---
  function initMainMap() {
    if (mainMap) return mainMap;
    mainMap = L.map('main-map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mainMap);
    mainMap.setView([55.751244, 37.618423], 11); // default: Moscow
    return mainMap;
  }

  // --- Init route map ---
  function initRouteMap() {
    if (routeMap) return routeMap;
    routeMap = L.map('route-map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(routeMap);
    routeMap.setView([55.751244, 37.618423], 11);
    return routeMap;
  }

  // --- Init location picker map (in modal) ---
  function initLocationMap(onPick) {
    if (locationMap) {
      locationMap.invalidateSize();
      return locationMap;
    }
    locationMap = L.map('location-map', { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(locationMap);
    locationMap.setView([55.751244, 37.618423], 11);

    locationMap.on('click', async (e) => {
      const { lat, lng } = e.latlng;
      setLocationMarker(lat, lng);
      const address = await reverseGeocode(lat, lng);
      if (onPick) onPick(lat, lng, address);
    });

    return locationMap;
  }

  function setLocationMarker(lat, lng) {
    if (locationMap) {
      if (locationMarker) locationMarker.remove();
      locationMarker = L.marker([lat, lng]).addTo(locationMap);
      locationMap.setView([lat, lng], 15);
    }
  }

  function clearLocationMarker() {
    if (locationMarker) { locationMarker.remove(); locationMarker = null; }
  }

  function resizeLocationMap() {
    if (locationMap) setTimeout(() => locationMap.invalidateSize(), 50);
  }

  // --- Popup HTML ---
  function popupHtml(item) {
    const avg = Storage.avgRating(item);
    const stars = avg ? renderStarsHtml(avg) : '';
    const issue = Storage.hasIssue(item) ? `<div style="color:#E74C3C;font-size:12px;margin-top:4px;">⚠️ ${Storage.latestIssue(item)}</div>` : '';
    const visitedText = Storage.wasVisited(item) ? `<span style="color:#7F8C8D;font-size:11px;">Был ${item.visits.length} раз(а)</span>` : '';
    const inRoute = selectedForRoute.includes(item.id);
    const routeBtnText = inRoute ? '✓ В маршруте' : '+ В маршрут';
    const routeBtnClass = inRoute ? 'btn-card btn-card-secondary' : 'btn-card btn-card-primary';

    return `<div class="map-popup">
      <div class="map-popup-title">${escHtml(item.title)}</div>
      <div class="map-popup-meta">${stars} ${visitedText}${issue}</div>
      <div class="map-popup-actions">
        <button class="${routeBtnClass}" onclick="MapModule.toggleRouteSelect('${item.id}');this.closest('.leaflet-popup').querySelector('.leaflet-popup-close-button').click();">
          ${routeBtnText}
        </button>
        <button class="btn-card btn-card-secondary" onclick="App.openEditModal('${item.id}');this.closest('.leaflet-popup').querySelector('.leaflet-popup-close-button').click();">
          Изменить
        </button>
      </div>
    </div>`;
  }

  function renderStarsHtml(avg) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += `<span style="color:${i <= Math.round(avg) ? '#F39C12' : '#ddd'}">★</span>`;
    }
    return html;
  }

  // --- Render markers on main map ---
  function renderMarkers(items) {
    if (!mainMap) return;
    // Remove old markers
    Object.values(mainMarkers).forEach(m => m.remove());
    mainMarkers = {};

    const located = items.filter(i => i.location && (i.category === 'place' || i.category === 'experience'));
    located.forEach(item => {
      const marker = L.marker([item.location.lat, item.location.lng], { icon: iconFor(item) })
        .addTo(mainMap)
        .bindPopup(popupHtml(item), { maxWidth: 260 });
      mainMarkers[item.id] = marker;
    });

    // Fit bounds if markers exist
    if (located.length > 0 && Object.keys(mainMarkers).length > 0) {
      const group = L.featureGroup(Object.values(mainMarkers));
      mainMap.fitBounds(group.getBounds().pad(0.2), { maxZoom: 15 });
    }
  }

  function updateMarkerIcon(id) {
    const item = Storage.getById(id);
    if (!item || !mainMarkers[id]) return;
    mainMarkers[id].setIcon(iconFor(item));
    mainMarkers[id].setPopupContent(popupHtml(item));
  }

  // --- Route selection ---
  function toggleRouteSelect(id) {
    const idx = selectedForRoute.indexOf(id);
    if (idx >= 0) {
      selectedForRoute.splice(idx, 1);
    } else {
      selectedForRoute.push(id);
    }
    // Update marker icons on both maps
    updateMarkerIcon(id);
    if (onRouteSelectionChange) onRouteSelectionChange([...selectedForRoute]);
  }

  function removeFromRoute(id) {
    const idx = selectedForRoute.indexOf(id);
    if (idx >= 0) selectedForRoute.splice(idx, 1);
    updateMarkerIcon(id);
    if (onRouteSelectionChange) onRouteSelectionChange([...selectedForRoute]);
  }

  function clearRouteSelection() {
    const prev = [...selectedForRoute];
    selectedForRoute = [];
    prev.forEach(id => updateMarkerIcon(id));
    if (onRouteSelectionChange) onRouteSelectionChange([]);
  }

  function getSelected() {
    return [...selectedForRoute];
  }

  function setOnRouteChange(cb) {
    onRouteSelectionChange = cb;
  }

  // --- Build route on route map ---
  function buildRoute(items) {
    if (!routeMap) initRouteMap();

    const located = items
      .filter(i => i.location)
      .filter(i => selectedForRoute.includes(i.id));

    if (located.length < 2) return;

    if (routeControl) { routeControl.remove(); routeControl = null; }

    const waypoints = located.map(i => L.latLng(i.location.lat, i.location.lng));

    routeControl = L.Routing.control({
      waypoints,
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      showAlternatives: false,
      lineOptions: { styles: [{ color: '#27AE60', weight: 5, opacity: 0.8 }] },
      createMarker: (i, wp) => {
        const item = located[i];
        if (!item) return null;
        return L.marker(wp.latLng, { icon: iconFor(item) }).bindPopup(item.title);
      },
    }).addTo(routeMap);

    routeControl.on('routesfound', (e) => {
      const route = e.routes[0];
      const dist = (route.summary.totalDistance / 1000).toFixed(1);
      const mins = Math.round(route.summary.totalTime / 60);
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      const timeStr = hours > 0 ? `${hours} ч ${remMins} мин` : `${remMins} мин`;
      const infoEl = document.getElementById('route-info');
      if (infoEl) infoEl.textContent = `Расстояние: ${dist} км · Время: ${timeStr}`;
    });

    routeControl.on('routingerror', () => {
      const infoEl = document.getElementById('route-info');
      if (infoEl) infoEl.textContent = 'Не удалось построить маршрут';
    });
  }

  function clearRoute() {
    if (routeControl) { routeControl.remove(); routeControl = null; }
    const infoEl = document.getElementById('route-info');
    if (infoEl) infoEl.textContent = '';
  }

  function getGoogleMapsUrl() {
    const items = Storage.getAll();
    const located = items
      .filter(i => i.location && selectedForRoute.includes(i.id));
    if (located.length < 2) return null;
    const coords = located.map(i => `${i.location.lat},${i.location.lng}`);
    const dest = coords.pop();
    const origin = coords.shift();
    const waypoints = coords.join('|');
    let url = `https://www.google.com/maps/dir/${origin}/${dest}`;
    if (waypoints) url += `?waypoints=${waypoints}`;
    return url;
  }

  // --- Geocoding ---
  async function geocode(query) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=ru`;
    const res = await fetch(url, { headers: { 'User-Agent': 'WishlistMapMVP/1.0' } });
    return res.json();
  }

  async function reverseGeocode(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ru`;
    const res = await fetch(url, { headers: { 'User-Agent': 'WishlistMapMVP/1.0' } });
    const data = await res.json();
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  function invalidateMainMap() {
    if (mainMap) setTimeout(() => mainMap.invalidateSize(), 50);
  }

  function invalidateRouteMap() {
    if (routeMap) setTimeout(() => routeMap.invalidateSize(), 50);
  }

  // --- Utils ---
  function escHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  return {
    initMainMap,
    initRouteMap,
    initLocationMap,
    setLocationMarker,
    clearLocationMarker,
    resizeLocationMap,
    renderMarkers,
    updateMarkerIcon,
    toggleRouteSelect,
    removeFromRoute,
    clearRouteSelection,
    getSelected,
    setOnRouteChange,
    buildRoute,
    clearRoute,
    getGoogleMapsUrl,
    geocode,
    reverseGeocode,
    invalidateMainMap,
    invalidateRouteMap,
  };
})();
