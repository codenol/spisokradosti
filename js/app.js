'use strict';

const App = (() => {
  let currentView = 'list';
  let currentFilter = 'all';
  let issuePopupTimer = null;

  // ===================== VIEWS =====================

  function switchView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const viewEl = document.getElementById(`view-${name}`);
    if (viewEl) viewEl.classList.add('active');

    const navBtn = document.querySelector(`.nav-btn[data-view="${name}"]`);
    if (navBtn) navBtn.classList.add('active');

    currentView = name;

    const titles = { list: 'Список желаний', map: 'Карта', route: 'Маршрут' };
    document.getElementById('view-title').textContent = titles[name] || '';

    if (name === 'map') {
      MapModule.invalidateMainMap();
      const items = Storage.getAll();
      MapModule.renderMarkers(items);
    }
    if (name === 'route') {
      MapModule.invalidateRouteMap();
      renderRoutePanel();
    }
  }

  // ===================== LIST RENDER =====================

  function renderList() {
    const items = Storage.getAll();
    const filtered = currentFilter === 'all' ? items : items.filter(i => i.category === currentFilter);
    const listEl = document.getElementById('wish-list');
    const emptyEl = document.getElementById('empty-state');

    if (filtered.length === 0) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    listEl.innerHTML = filtered.map(cardHtml).join('');
    bindCardEvents();
  }

  function cardHtml(item) {
    const avg = Storage.avgRating(item);
    const visited = Storage.wasVisited(item);
    const issue = Storage.hasIssue(item);
    const visits = item.visits || [];

    const categoryLabels = { place: '📍 Место', experience: '✨ Впечатление', material: '🎁 Вещь' };
    const categoryBadgeClass = { place: 'badge-place', experience: 'badge-experience', material: 'badge-material' };
    const priorityDots = { 1: 'p1', 2: 'p2', 3: 'p3' };
    const placeTypeLabels = { museum: '🏛 Музей', cafe: '☕ Кафе', restaurant: '🍽 Ресторан', park: '🌳 Парк', shop: '🛍 Магазин', other: '📌 Другое' };

    let imageHtml = '';
    if (item.category === 'material' && item.imageUrl) {
      imageHtml = `<img class="card-image" src="${escHtml(item.imageUrl)}" alt="${escHtml(item.title)}" loading="lazy" onerror="this.style.display='none'">`;
    }

    let metaItems = [];
    if (item.category === 'material') {
      if (item.price) metaItems.push(`💰 ${formatPrice(item.price)} ₽`);
      if (item.shopUrl) metaItems.push(`<a href="${escHtml(item.shopUrl)}" target="_blank" rel="noopener">🛒 Магазин</a>`);
    } else if (item.category === 'place') {
      if (item.placeType) metaItems.push(placeTypeLabels[item.placeType] || item.placeType);
      if (item.priceText) metaItems.push(`💰 ${escHtml(item.priceText)}`);
      if (item.website) metaItems.push(`<a href="${escHtml(item.website)}" target="_blank" rel="noopener">🌐 Сайт</a>`);
      if (item.location) metaItems.push(`<span style="color:#27AE60">📍 ${escHtml(shortAddr(item.location.address))}</span>`);
    } else if (item.category === 'experience') {
      if (item.priceText) metaItems.push(`💰 ${escHtml(item.priceText)}`);
      if (item.website) metaItems.push(`<a href="${escHtml(item.website)}" target="_blank" rel="noopener">🌐 Сайт</a>`);
      if (item.location) metaItems.push(`<span style="color:#9B59B6">📍 ${escHtml(shortAddr(item.location.address))}</span>`);
    }

    const starsHtml = avg > 0 ? `<span class="stars">${renderStars(avg)}</span> ` : '';
    const visitCountHtml = visited ? `<span class="visit-count">${visitLabel(visits.length)}</span>` : '';

    const visitsHtml = visits.length > 0 ? `
      <div class="visits-accordion">
        <button class="visits-toggle" data-id="${item.id}" onclick="App.toggleVisits('${item.id}',this)">
          <span class="arrow">▶</span> История (${visits.length})
        </button>
        <div class="visits-list" id="visits-${item.id}">
          ${visits.map(v => visitItemHtml(v)).join('')}
        </div>
      </div>` : '';

    return `<div class="wish-card" data-id="${item.id}">
      ${imageHtml}
      <div class="card-body">
        <div class="card-header">
          <span class="card-title${visited ? ' visited' : ''}">${escHtml(item.title)}</span>
          <div class="card-badges">
            ${issue ? `<span class="badge badge-issue" onclick="App.showIssuePopup('${item.id}')" title="Нажмите, чтобы увидеть проблему">⚠️</span>` : ''}
            <span class="badge ${categoryBadgeClass[item.category] || ''}">${categoryLabels[item.category] || item.category}</span>
            <span class="priority-dot ${priorityDots[item.priority] || 'p2'}" title="Приоритет: ${item.priority}"></span>
          </div>
        </div>
        ${item.description ? `<div class="card-description">${escHtml(item.description)}</div>` : ''}
        ${metaItems.length > 0 ? `<div class="card-meta">${metaItems.join(' · ')}</div>` : ''}
        ${starsHtml || visitCountHtml ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">${starsHtml}${visitCountHtml}</div>` : ''}
        <div class="card-footer">
          <button class="btn-card btn-card-primary btn-sm" onclick="App.openVisitModal('${item.id}')">
            ${visited ? '✓ Отметить снова' : '+ Отметить'}
          </button>
          <button class="btn-card btn-card-secondary btn-sm" onclick="App.openEditModal('${item.id}')">Изменить</button>
        </div>
        ${visitsHtml}
      </div>
    </div>`;
  }

  function visitItemHtml(v) {
    const date = new Date(v.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    const stars = v.rating ? renderStars(v.rating) : '';
    return `<div class="visit-item">
      <div class="visit-item-header">
        <span class="stars" style="font-size:13px;">${stars}</span>
        <span class="visit-date">${date}</span>
      </div>
      ${v.review ? `<div class="visit-review">${escHtml(v.review)}</div>` : ''}
      ${v.issue ? `<div class="visit-issue">⚠️ ${escHtml(v.issue)}</div>` : ''}
    </div>`;
  }

  function renderStars(avg) {
    let html = '';
    const rounded = Math.round(avg);
    for (let i = 1; i <= 5; i++) {
      html += `<span class="${i <= rounded ? '' : 'empty'}">★</span>`;
    }
    return html;
  }

  function visitLabel(n) {
    if (n === 1) return 'Был 1 раз';
    if (n >= 2 && n <= 4) return `Был ${n} раза`;
    return `Был ${n} раз`;
  }

  function shortAddr(addr) {
    if (!addr) return '';
    const parts = addr.split(',');
    return parts.slice(0, 2).join(',').trim();
  }

  function formatPrice(p) {
    return Number(p).toLocaleString('ru-RU');
  }

  function bindCardEvents() {
    // no dynamic binding needed — all via onclick attributes
  }

  function toggleVisits(id, btn) {
    const list = document.getElementById(`visits-${id}`);
    if (!list) return;
    const open = list.classList.toggle('open');
    btn.classList.toggle('open', open);
  }

  function showIssuePopup(id) {
    const item = Storage.getById(id);
    if (!item) return;
    const issue = Storage.latestIssue(item);
    if (!issue) return;

    clearTimeout(issuePopupTimer);
    let popup = document.getElementById('issue-popup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'issue-popup';
      popup.className = 'issue-popup';
      document.body.appendChild(popup);
    }
    popup.textContent = `⚠️ ${issue}`;
    popup.style.display = 'block';
    issuePopupTimer = setTimeout(() => { popup.style.display = 'none'; }, 3500);
  }

  // ===================== ADD/EDIT MODAL =====================

  let locationPickResult = null; // { lat, lng, address }

  function openAddModal() {
    locationPickResult = null;
    const form = document.getElementById('wish-form');
    form.reset();
    document.querySelector('input[name="id"]').value = '';
    document.querySelector('input[name="priority"][value="2"]').checked = true;
    document.getElementById('modal-title').textContent = 'Новое желание';
    document.getElementById('btn-delete-wish').classList.add('hidden');
    selectCategory('material');
    updateLocationDisplay(null);
    MapModule.clearLocationMarker();
    openModal('modal');
    setTimeout(() => MapModule.resizeLocationMap(), 300);
  }

  function openEditModal(id) {
    const item = Storage.getById(id);
    if (!item) return;
    locationPickResult = item.location || null;

    const form = document.getElementById('wish-form');
    form.reset();

    document.querySelector('input[name="id"]').value = item.id;
    document.querySelector('input[name="title"]').value = item.title || '';
    document.querySelector('textarea[name="description"]').value = item.description || '';
    document.querySelector('input[name="priority"][value="' + (item.priority || 2) + '"]').checked = true;

    document.getElementById('modal-title').textContent = 'Изменить желание';
    document.getElementById('btn-delete-wish').classList.remove('hidden');

    selectCategory(item.category);

    if (item.category === 'material') {
      setField(form, 'shopUrl', item.shopUrl || '');
      setField(form, 'price', item.price || '');
      setField(form, 'imageUrl', item.imageUrl || '');
    } else if (item.category === 'place') {
      setField(form, 'placeType', item.placeType || 'other');
      setField(form, 'priceText', item.priceText || '');
      setField(form, 'website', item.website || '');
    } else if (item.category === 'experience') {
      setField(form, 'priceText', item.priceText || '');
      setField(form, 'website', item.website || '');
    }

    if (item.location) {
      updateLocationDisplay(item.location);
      MapModule.setLocationMarker(item.location.lat, item.location.lng);
    } else {
      updateLocationDisplay(null);
      MapModule.clearLocationMarker();
    }

    openModal('modal');
    setTimeout(() => MapModule.resizeLocationMap(), 300);
  }

  function setField(form, name, value) {
    const el = form.elements[name];
    if (!el) return;
    if (el.tagName === 'SELECT') {
      el.value = value;
    } else {
      el.value = value;
    }
  }

  function selectCategory(cat) {
    document.querySelector('input[name="category"]').value = cat;
    document.querySelectorAll('.cat-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    document.querySelectorAll('.form-fields').forEach(el => el.classList.add('hidden'));
    const fieldsEl = document.querySelector(`.fields-${cat}`);
    if (fieldsEl) fieldsEl.classList.remove('hidden');

    const locSection = document.getElementById('location-section');
    if (cat === 'place') {
      locSection.classList.remove('hidden');
    } else if (cat === 'experience') {
      locSection.classList.remove('hidden');
    } else {
      locSection.classList.add('hidden');
    }
    setTimeout(() => MapModule.resizeLocationMap(), 100);
  }

  function updateLocationDisplay(loc) {
    const display = document.getElementById('location-display');
    const text = document.getElementById('location-text');
    if (loc) {
      display.classList.remove('hidden');
      text.textContent = shortAddr(loc.address) || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
      document.querySelector('input[name="locationLat"]').value = loc.lat;
      document.querySelector('input[name="locationLng"]').value = loc.lng;
      document.querySelector('input[name="locationAddress"]').value = loc.address || '';
    } else {
      display.classList.add('hidden');
      document.querySelector('input[name="locationLat"]').value = '';
      document.querySelector('input[name="locationLng"]').value = '';
      document.querySelector('input[name="locationAddress"]').value = '';
    }
  }

  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    document.body.style.overflow = '';
  }

  // --- Form submit ---
  function handleWishFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.title || !data.title.trim()) {
      form.elements.title.focus();
      return;
    }

    const cat = data.category;

    // Validate location for 'place'
    if (cat === 'place' && !data.locationLat) {
      alert('Пожалуйста, укажите местоположение для места на карте.');
      return;
    }

    const item = {
      id: data.id || Storage.genId(),
      category: cat,
      title: data.title.trim(),
      description: (data.description || '').trim(),
      priority: parseInt(data.priority, 10) || 2,
      createdAt: data.id ? (Storage.getById(data.id) || {}).createdAt || Date.now() : Date.now(),
      visits: data.id ? (Storage.getById(data.id) || {}).visits || [] : [],
    };

    if (cat === 'material') {
      item.shopUrl = (data.shopUrl || '').trim();
      item.price = data.price ? parseFloat(data.price) : null;
      item.imageUrl = (data.imageUrl || '').trim();
    } else if (cat === 'place') {
      item.placeType = data.placeType || 'other';
      item.priceText = (data.priceText || '').trim();
      item.website = (data.website || '').trim();
      item.location = {
        lat: parseFloat(data.locationLat),
        lng: parseFloat(data.locationLng),
        address: data.locationAddress || '',
      };
    } else if (cat === 'experience') {
      item.priceText = (data.priceText || '').trim();
      item.website = (data.website || '').trim();
      item.location = data.locationLat ? {
        lat: parseFloat(data.locationLat),
        lng: parseFloat(data.locationLng),
        address: data.locationAddress || '',
      } : null;
    }

    Storage.save(item);
    closeModal('modal');
    renderList();

    const mapItems = Storage.getAll();
    MapModule.renderMarkers(mapItems);
    if (currentView === 'route') renderRoutePanel();
  }

  function handleDeleteWish() {
    const id = document.querySelector('input[name="id"]').value;
    if (!id) return;
    if (!confirm('Удалить это желание?')) return;
    Storage.remove(id);
    closeModal('modal');
    renderList();
    MapModule.renderMarkers(Storage.getAll());
    MapModule.removeFromRoute(id);
    if (currentView === 'route') renderRoutePanel();
  }

  // ===================== VISIT MODAL =====================

  let starRating = 0;

  function openVisitModal(wishId) {
    const item = Storage.getById(wishId);
    if (!item) return;

    starRating = 0;
    const form = document.getElementById('visit-form');
    form.reset();
    document.querySelector('#visit-form input[name="wishId"]').value = wishId;
    document.querySelector('#visit-form input[name="visitId"]').value = '';
    document.querySelector('#visit-form input[name="rating"]').value = '';
    document.getElementById('visit-modal-title').textContent =
      item.category === 'material' ? 'Отметить покупку' : 'Отметить посещение';

    setStarDisplay(0);
    document.getElementById('issue-group').classList.add('hidden');
    document.getElementById('hasIssue').checked = false;

    openModal('visit-modal');
  }

  function setStarDisplay(val) {
    starRating = val;
    document.querySelectorAll('#star-input .star').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.value, 10) <= val);
    });
    document.querySelector('#visit-form input[name="rating"]').value = val || '';
  }

  function handleVisitFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.rating) {
      alert('Пожалуйста, поставьте оценку.');
      return;
    }

    const visit = {
      id: data.visitId || Storage.genId(),
      date: Date.now(),
      rating: parseInt(data.rating, 10),
      review: (data.review || '').trim(),
      issue: data.hasIssue ? (data.issue || '').trim() : null,
    };

    Storage.addVisit(data.wishId, visit);
    closeModal('visit-modal');
    renderList();
    MapModule.updateMarkerIcon(data.wishId);
    if (currentView === 'route') renderRoutePanel();
  }

  // ===================== GEOCODING =====================

  let geocodeDebounce = null;

  async function handleGeoSearch() {
    const query = document.getElementById('location-search').value.trim();
    if (!query) return;
    const resultsEl = document.getElementById('geocode-results');
    resultsEl.innerHTML = '<div class="geocode-result-item">Поиск...</div>';
    resultsEl.classList.remove('hidden');
    try {
      const results = await MapModule.geocode(query);
      if (!results.length) {
        resultsEl.innerHTML = '<div class="geocode-result-item">Ничего не найдено</div>';
        return;
      }
      resultsEl.innerHTML = results.map((r, i) =>
        `<div class="geocode-result-item" data-lat="${r.lat}" data-lng="${r.lon}" data-addr="${escHtml(r.display_name)}">${escHtml(r.display_name)}</div>`
      ).join('');
      resultsEl.querySelectorAll('.geocode-result-item[data-lat]').forEach(el => {
        el.addEventListener('click', () => {
          const lat = parseFloat(el.dataset.lat);
          const lng = parseFloat(el.dataset.lng);
          const addr = el.dataset.addr;
          locationPickResult = { lat, lng, address: addr };
          updateLocationDisplay(locationPickResult);
          MapModule.setLocationMarker(lat, lng);
          resultsEl.classList.add('hidden');
          document.getElementById('location-search').value = '';
        });
      });
    } catch {
      resultsEl.innerHTML = '<div class="geocode-result-item">Ошибка поиска</div>';
    }
  }

  // ===================== ROUTE PANEL =====================

  function renderRoutePanel() {
    const selected = MapModule.getSelected();
    const items = Storage.getAll();
    const selectedItems = selected.map(id => items.find(i => i.id === id)).filter(Boolean);

    const emptyEl = document.getElementById('route-empty');
    const actionsEl = document.getElementById('route-actions');
    const listEl = document.getElementById('route-selected-list');

    updateRouteBadge(selected.length);

    if (selectedItems.length === 0) {
      emptyEl.classList.remove('hidden');
      actionsEl.classList.add('hidden');
      listEl.innerHTML = '';
      return;
    }

    emptyEl.classList.add('hidden');
    actionsEl.classList.remove('hidden');

    listEl.innerHTML = selectedItems.map((item, i) => `
      <div class="route-selected-item">
        <div class="route-item-num">${i + 1}</div>
        <div style="flex:1">
          <div class="route-item-name">${escHtml(item.title)}</div>
          ${item.location ? `<div class="route-item-addr">${escHtml(shortAddr(item.location.address))}</div>` : ''}
        </div>
        <button class="btn-remove-from-route" onclick="MapModule.removeFromRoute('${item.id}');App.renderRoutePanel();" title="Убрать">✕</button>
      </div>`).join('');
  }

  function updateRouteBadge(count) {
    const badge = document.getElementById('route-badge');
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // ===================== UTILS =====================

  function escHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ===================== INIT =====================

  function init() {
    // Nav
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Add button
    document.getElementById('btn-add').addEventListener('click', openAddModal);

    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        renderList();
      });
    });

    // Modal close
    document.getElementById('btn-modal-close').addEventListener('click', () => closeModal('modal'));
    document.getElementById('modal-overlay').addEventListener('click', () => closeModal('modal'));

    // Visit modal close
    document.getElementById('btn-visit-close').addEventListener('click', () => closeModal('visit-modal'));
    document.getElementById('visit-modal-overlay').addEventListener('click', () => closeModal('visit-modal'));

    // Wish form
    document.getElementById('wish-form').addEventListener('submit', handleWishFormSubmit);
    document.getElementById('btn-delete-wish').addEventListener('click', handleDeleteWish);

    // Category tabs
    document.querySelectorAll('.cat-tab').forEach(btn => {
      btn.addEventListener('click', () => selectCategory(btn.dataset.cat));
    });

    // Location search
    document.getElementById('btn-geo-search').addEventListener('click', handleGeoSearch);
    document.getElementById('location-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); handleGeoSearch(); }
    });

    // Clear location
    document.getElementById('btn-clear-location').addEventListener('click', () => {
      locationPickResult = null;
      updateLocationDisplay(null);
      MapModule.clearLocationMarker();
    });

    // Visit form
    document.getElementById('visit-form').addEventListener('submit', handleVisitFormSubmit);

    // Star input
    document.querySelectorAll('#star-input .star').forEach(btn => {
      btn.addEventListener('click', () => setStarDisplay(parseInt(btn.dataset.value, 10)));
    });

    // Issue checkbox
    document.getElementById('hasIssue').addEventListener('change', function () {
      document.getElementById('issue-group').classList.toggle('hidden', !this.checked);
    });

    // Route buttons
    document.getElementById('btn-build-route').addEventListener('click', () => {
      MapModule.initRouteMap();
      MapModule.buildRoute(Storage.getAll());
    });
    document.getElementById('btn-google-maps').addEventListener('click', () => {
      const url = MapModule.getGoogleMapsUrl();
      if (url) window.open(url, '_blank');
    });
    document.getElementById('btn-clear-route').addEventListener('click', () => {
      MapModule.clearRouteSelection();
      MapModule.clearRoute();
      renderRoutePanel();
    });

    // Map route selection callback
    MapModule.setOnRouteChange((selected) => {
      updateRouteBadge(selected.length);
      if (currentView === 'route') renderRoutePanel();
    });

    // Init maps lazily (location map init on first modal open, others on view switch)
    MapModule.initLocationMap((lat, lng, address) => {
      locationPickResult = { lat, lng, address };
      updateLocationDisplay(locationPickResult);
    });

    // Hide map hint after 4s
    setTimeout(() => {
      const hint = document.getElementById('map-hint');
      if (hint) hint.classList.add('hidden');
    }, 4000);

    // Initial render
    renderList();
  }

  // Public
  return {
    init,
    switchView,
    renderList,
    renderRoutePanel,
    openAddModal,
    openEditModal,
    openVisitModal,
    toggleVisits,
    showIssuePopup,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  MapModule.initMainMap();
  MapModule.initRouteMap();
  App.init();
});
