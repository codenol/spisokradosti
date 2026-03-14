'use strict';

const App = (() => {
  let currentView = 'list';
  let currentFilter = 'all';
  let mapTypeFilters = new Set(); // empty = show all
  let issuePopupTimer = null;

  // Lucide icon helper
  function icon(name, cls = '') {
    return `<i data-lucide="${name}" class="icon${cls ? ' ' + cls : ''}"></i>`;
  }

  function icons() { if (window.lucide) lucide.createIcons(); }

  // ===================== VIEWS =====================

  function switchView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const viewEl = document.getElementById(`view-${name}`);
    if (viewEl) viewEl.classList.add('active');

    const navBtn = document.querySelector(`.nav-btn[data-view="${name}"]`);
    if (navBtn) navBtn.classList.add('active');

    currentView = name;

    const titles = { list: 'Список желаний', map: 'Карта', route: 'Маршруты', walk: 'Гуляю' };
    document.getElementById('view-title').textContent = titles[name] || '';

    if (name === 'map') {
      MapModule.invalidateMainMap();
      renderFilteredMarkers();
    }
    if (name === 'route') {
      MapModule.invalidateRouteMap();
      renderRoutePanel();
    }
    if (name === 'walk') {
      MapModule.invalidateWalkMap();
      MapModule.renderWalkMarkers(Storage.getAll());
      MapModule.startLocating(
        (lat, lng) => renderNearbyPanel(lat, lng),
        (err) => {
          const locEl = document.getElementById('walk-locating');
          if (locEl) locEl.innerHTML = `<p class="walk-error">${icon('circle-x', 'icon-sm')} ${escHtml(err)}</p>`;
        }
      );
    }
  }

  // ===================== MAP FILTERS =====================

  function renderFilteredMarkers() {
    const all = Storage.getAll();
    let items;
    if (mapTypeFilters.size === 0) {
      items = all;
    } else {
      items = all.filter(i => {
        if (i.category === 'experience') return mapTypeFilters.has('experience');
        if (i.category === 'place') return mapTypeFilters.has(i.placeType || 'other');
        return false;
      });
    }
    MapModule.renderMarkers(items);
  }

  function toggleMapFilter(type) {
    if (type === 'all') {
      mapTypeFilters.clear();
    } else {
      if (mapTypeFilters.has(type)) {
        mapTypeFilters.delete(type);
      } else {
        mapTypeFilters.add(type);
      }
    }
    // Sync chip active states
    document.querySelectorAll('.map-filter-chip').forEach(chip => {
      const t = chip.dataset.type;
      if (t === 'all') {
        chip.classList.toggle('active', mapTypeFilters.size === 0);
      } else {
        chip.classList.toggle('active', mapTypeFilters.has(t));
      }
    });
    renderFilteredMarkers();
  }

  // ===================== LIST RENDER =====================

  const placeTypeIcons = {
    museum: 'landmark', mansion: 'castle', cafe: 'coffee',
    restaurant: 'utensils', park: 'tree-pine', shop: 'shopping-bag', other: 'map-pin',
  };

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
    icons();
    bindCardEvents();
  }

  function cardHtml(item) {
    const avg = Storage.avgRating(item);
    const visited = Storage.wasVisited(item);
    const issue = Storage.hasIssue(item);
    const visits = item.visits || [];

    const categoryLabels = {
      place: `${icon('map-pin', 'icon-sm')} Место`,
      experience: `${icon('sparkles', 'icon-sm')} Впечатление`,
      material: `${icon('gift', 'icon-sm')} Вещь`,
    };
    const categoryBadgeClass = { place: 'badge-place', experience: 'badge-experience', material: 'badge-material' };
    const priorityDots = { 1: 'p1', 2: 'p2', 3: 'p3' };
    const placeTypeLabels = {
      museum: `${icon('landmark', 'icon-sm')} Музей`,
      mansion: `${icon('castle', 'icon-sm')} Особняк/Усадьба`,
      cafe: `${icon('coffee', 'icon-sm')} Кафе`,
      restaurant: `${icon('utensils', 'icon-sm')} Ресторан`,
      park: `${icon('tree-pine', 'icon-sm')} Парк`,
      shop: `${icon('shopping-bag', 'icon-sm')} Магазин`,
      other: `${icon('map-pin', 'icon-sm')} Другое`,
    };

    let imageHtml = '';
    if (item.category === 'material' && item.imageUrl) {
      imageHtml = `<img class="card-image" src="${escHtml(item.imageUrl)}" alt="${escHtml(item.title)}" loading="lazy" onerror="this.style.display='none'">`;
    }

    let metaItems = [];
    if (item.category === 'material') {
      if (item.price) metaItems.push(`${icon('banknote', 'meta-icon')} ${formatPrice(item.price)} ₽`);
      if (item.shopUrl) metaItems.push(`<a href="${escHtml(item.shopUrl)}" target="_blank" rel="noopener">${icon('shopping-cart', 'meta-icon')} Магазин</a>`);
    } else if (item.category === 'place') {
      if (item.placeType) metaItems.push(placeTypeLabels[item.placeType] || item.placeType);
      if (item.priceText) metaItems.push(`${icon('banknote', 'meta-icon')} ${escHtml(item.priceText)}`);
      if (item.website) metaItems.push(`<a href="${escHtml(item.website)}" target="_blank" rel="noopener">${icon('globe', 'meta-icon')} Сайт</a>`);
      if (item.location) metaItems.push(`<span style="color:var(--color-place)">${icon('map-pin', 'meta-icon')} ${escHtml(shortAddr(item.location.address))}</span>`);
    } else if (item.category === 'experience') {
      if (item.priceText) metaItems.push(`${icon('banknote', 'meta-icon')} ${escHtml(item.priceText)}`);
      if (item.website) metaItems.push(`<a href="${escHtml(item.website)}" target="_blank" rel="noopener">${icon('globe', 'meta-icon')} Сайт</a>`);
      if (item.location) metaItems.push(`<span style="color:var(--color-experience)">${icon('map-pin', 'meta-icon')} ${escHtml(shortAddr(item.location.address))}</span>`);
    }

    const starsHtml = avg > 0 ? `<span class="stars">${renderStars(avg)}</span> ` : '';
    const visitCountHtml = visited ? `<span class="visit-count">${visitLabel(visits.length)}</span>` : '';

    const visitsHtml = visits.length > 0 ? `
      <div class="visits-accordion">
        <button class="visits-toggle" data-id="${item.id}" onclick="App.toggleVisits('${item.id}',this)">
          ${icon('chevron-right', 'arrow')} История (${visits.length})
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
            ${issue ? `<span class="badge badge-issue" onclick="App.showIssuePopup('${item.id}')" title="Нажмите, чтобы увидеть проблему">${icon('triangle-alert')}</span>` : ''}
            <span class="badge ${categoryBadgeClass[item.category] || ''}">${categoryLabels[item.category] || item.category}</span>
            <span class="priority-dot ${priorityDots[item.priority] || 'p2'}" title="Приоритет: ${item.priority}"></span>
          </div>
        </div>
        ${item.description ? `<div class="card-description">${escHtml(item.description)}</div>` : ''}
        ${metaItems.length > 0 ? `<div class="card-meta">${metaItems.join(' · ')}</div>` : ''}
        ${starsHtml || visitCountHtml ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">${starsHtml}${visitCountHtml}</div>` : ''}
        <div class="card-footer">
          <button class="btn-card btn-card-primary btn-sm" onclick="App.openVisitModal('${item.id}')">
            ${visited ? `${icon('check', 'icon-sm')} Отметить снова` : `${icon('plus', 'icon-sm')} Отметить`}
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
      ${v.issue ? `<div class="visit-issue">${icon('triangle-alert', 'icon-sm')} ${escHtml(v.issue)}</div>` : ''}
    </div>`;
  }

  function renderStars(avg) {
    const rounded = Math.round(avg);
    return Array.from({length: 5}, (_, i) =>
      `<i data-lucide="star" class="icon star-display${i < rounded ? ' filled' : ''}"></i>`
    ).join('');
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
    popup.innerHTML = `${icon('triangle-alert', 'icon-sm')} ${escHtml(issue)}`;
    icons();
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
    el.value = value;
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
    if (cat === 'place' || cat === 'experience') {
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
    renderFilteredMarkers();
    if (currentView === 'route') renderRoutePanel();
    if (currentView === 'walk') {
      MapModule.renderWalkMarkers(mapItems);
      const loc = MapModule.getUserLocation();
      if (loc) renderNearbyPanel(loc.lat, loc.lng);
    }
  }

  function handleDeleteWish() {
    const id = document.querySelector('input[name="id"]').value;
    if (!id) return;
    if (!confirm('Удалить это желание?')) return;
    Storage.remove(id);
    closeModal('modal');
    renderList();
    renderFilteredMarkers();
    MapModule.removeFromRoute(id);
    MapModule.removeWalkItem(id);
    if (currentView === 'route') renderRoutePanel();
    if (currentView === 'walk') {
      MapModule.renderWalkMarkers(Storage.getAll());
      const loc = MapModule.getUserLocation();
      if (loc) renderNearbyPanel(loc.lat, loc.lng);
    }
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
      resultsEl.innerHTML = results.map((r) =>
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
    const routes = Storage.getAllRoutes();
    const selected = MapModule.getSelected();
    const activeId = MapModule.getActiveRouteId();

    const isEmpty = routes.length === 0 && selected.length === 0;
    document.getElementById('routes-all-empty').classList.toggle('hidden', !isEmpty);
    document.getElementById('routes-has-content').classList.toggle('hidden', isEmpty);
    updateRouteBadge(routes.length + selected.length);

    if (isEmpty) {
      document.getElementById('saved-route-info').textContent = '';
      return;
    }

    // --- Saved routes ---
    const savedList = document.getElementById('saved-routes-list');
    savedList.innerHTML = routes.map(r => {
      const active = r.id === activeId;
      const stops = r.placeNames ? r.placeNames.length : 0;
      const stopWord = stops === 1 ? 'место' : stops < 5 ? 'места' : 'мест';
      return `<div class="saved-route-item${active ? ' active' : ''}" onclick="App.loadSavedRoute('${r.id}')">
        <div class="saved-route-icon">${icon('route', 'icon-lg')}</div>
        <div class="saved-route-body">
          <div class="saved-route-name">${escHtml(r.name)}</div>
          <div class="saved-route-meta">${stops} ${stopWord}</div>
        </div>
        <button class="btn-remove-from-route" onclick="event.stopPropagation();App.deleteSavedRoute('${r.id}')" title="Удалить">${icon('x', 'icon-sm')}</button>
      </div>`;
    }).join('');

    // --- Manual selection from map ---
    const items = Storage.getAll();
    const selectedItems = selected.map(id => items.find(i => i.id === id)).filter(Boolean);
    const manualSection = document.getElementById('manual-route-section');

    if (selectedItems.length === 0) {
      manualSection.classList.add('hidden');
    } else {
      manualSection.classList.remove('hidden');
      document.getElementById('route-selected-list').innerHTML = selectedItems.map((item, i) => `
        <div class="route-selected-item">
          <div class="route-item-num">${i + 1}</div>
          <div style="flex:1">
            <div class="route-item-name">${escHtml(item.title)}</div>
            ${item.location ? `<div class="route-item-addr">${escHtml(shortAddr(item.location.address))}</div>` : ''}
          </div>
          <button class="btn-remove-from-route" onclick="MapModule.removeFromRoute('${item.id}');App.renderRoutePanel();" title="Убрать">${icon('x', 'icon-sm')}</button>
        </div>`).join('');
    }
    icons();
  }

  function loadSavedRoute(id) {
    const route = Storage.getRouteById(id);
    if (!route) return;
    MapModule.loadSavedRoute(route);
    renderRoutePanel();
  }

  function deleteSavedRoute(id) {
    Storage.removeRoute(id);
    if (MapModule.getActiveRouteId() === id) MapModule.clearActiveRoute();
    renderRoutePanel();
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

  // ===================== WALK MODE =====================

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function renderNearbyPanel(userLat, userLng) {
    const locEl = document.getElementById('walk-locating');
    const contentEl = document.getElementById('walk-content');
    if (locEl) locEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');

    const placeTypeEmoji = placeTypeIcons; // reuse icon name map

    const items = Storage.getAll().filter(i => i.location && (i.category === 'place' || i.category === 'experience'));

    const withDist = items.map(item => ({
      ...item,
      dist: haversine(userLat, userLng, item.location.lat, item.location.lng),
    })).sort((a, b) => a.dist - b.dist);

    const listEl = document.getElementById('walk-nearby-list');
    if (!listEl) return;

    if (withDist.length === 0) {
      listEl.innerHTML = '<p class="walk-empty">В списке нет мест с адресом.<br>Добавьте места через «+».</p>';
    } else {
      const walkSel = MapModule.getWalkSelected();
      listEl.innerHTML = withDist.map(item => {
        const dist = item.dist;
        const distStr = dist < 1000 ? `${Math.round(dist)} м` : `${(dist / 1000).toFixed(1)} км`;
        const walkMins = Math.round(dist / 83.3);
        const timeStr = walkMins >= 60
          ? `${Math.floor(walkMins / 60)} ч ${walkMins % 60} мин`
          : `${walkMins} мин`;
        const typeIcon = item.category === 'experience'
          ? icon('sparkles', 'icon-sm') : icon(placeTypeEmoji[item.placeType] || 'map-pin', 'icon-sm');
        const inWalk = walkSel.includes(item.id);
        const nearTag = dist <= 500 ? '<span class="walk-near-tag">Рядом</span>' : '';
        return `<div class="walk-nearby-item${inWalk ? ' selected' : ''}" data-id="${item.id}">
          <div class="walk-nearby-left">
            <div class="walk-nearby-name">${typeIcon} ${escHtml(item.title)} ${nearTag}</div>
            <div class="walk-nearby-dist">${icon('map-pin', 'meta-icon')} ${distStr} · ${icon('footprints', 'meta-icon')} ~${timeStr}</div>
          </div>
          <button class="walk-nearby-btn${inWalk ? ' active' : ''}" onclick="App.toggleWalkItem('${item.id}')">
            ${inWalk ? icon('check') : icon('plus')}
          </button>
        </div>`;
      }).join('');
      icons();
    }

    renderWalkRouteSection();
  }

  function renderWalkRouteSection() {
    const selected = MapModule.getWalkSelected();
    const routeSection = document.getElementById('walk-route-section');
    const routePlaces = document.getElementById('walk-route-places');
    if (!routeSection || !routePlaces) return;

    if (selected.length === 0) {
      routeSection.classList.add('hidden');
      return;
    }

    routeSection.classList.remove('hidden');
    const items = Storage.getAll();
    const selectedItems = selected.map(id => items.find(i => i.id === id)).filter(Boolean);

    routePlaces.innerHTML = selectedItems.map((item, i) => `
      <div class="route-selected-item">
        <div class="route-item-num">${i + 1}</div>
        <div style="flex:1">
          <div class="route-item-name">${escHtml(item.title)}</div>
          ${item.location ? `<div class="route-item-addr">${escHtml(shortAddr(item.location.address))}</div>` : ''}
        </div>
        <button class="btn-remove-from-route" onclick="App.removeFromWalk('${item.id}')" title="Убрать">✕</button>
      </div>`).join('');
  }

  function buildAndSaveWalkRoute() {
    const walkSel = MapModule.getWalkSelected();
    if (walkSel.length === 0) return;
    const userLoc = MapModule.getUserLocation();
    if (!userLoc) return;

    const items = Storage.getAll();
    const selectedItems = walkSel.map(id => items.find(i => i.id === id)).filter(i => i && i.location);
    if (selectedItems.length === 0) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const route = {
      id: Storage.genId(),
      name: `Гуляем ${dateStr} ${timeStr}`,
      createdAt: Date.now(),
      userLocation: userLoc,
      placeIds: selectedItems.map(i => i.id),
      placeNames: selectedItems.map(i => i.title),
      waypoints: [
        { lat: userLoc.lat, lng: userLoc.lng },
        ...selectedItems.map(i => ({ lat: i.location.lat, lng: i.location.lng })),
      ],
    };

    Storage.saveRoute(route);
    MapModule.clearWalkSelection();
    MapModule.clearWalkRoute();

    switchView('route');
    setTimeout(() => {
      MapModule.loadSavedRoute(route);
      renderRoutePanel();
    }, 150);
  }

  function toggleWalkItem(id) {
    MapModule.toggleWalkSelect(id);
    const loc = MapModule.getUserLocation();
    if (loc) renderNearbyPanel(loc.lat, loc.lng);
    else renderWalkRouteSection();
  }

  function removeFromWalk(id) {
    MapModule.removeWalkItem(id);
    MapModule.clearWalkRoute();
    const loc = MapModule.getUserLocation();
    if (loc) renderNearbyPanel(loc.lat, loc.lng);
    else renderWalkRouteSection();
  }

  // ===================== WALK ADD =====================

  let walkAddRating = 0;
  let walkAddLocation = null;

  function openWalkAddModal() {
    walkAddRating = 0;
    walkAddLocation = null;
    document.getElementById('walk-add-title').value = '';
    document.getElementById('walk-add-desc').value = '';
    document.getElementById('walk-add-review').value = '';
    document.getElementById('walk-add-place-type').value = 'other';
    document.getElementById('walk-add-location-text').textContent = 'Определяем адрес…';
    setWalkAddStars(0);
    switchWalkAddTab('info');
    openModal('walk-add-modal');

    const loc = MapModule.getUserLocation();
    if (!loc) {
      document.getElementById('walk-add-location-text').textContent = 'Местоположение неизвестно';
      return;
    }
    walkAddLocation = { lat: loc.lat, lng: loc.lng, address: '' };
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lng}&format=json`)
      .then(r => r.json())
      .then(data => {
        walkAddLocation.address = data.display_name || '';
        document.getElementById('walk-add-location-text').textContent =
          shortAddr(walkAddLocation.address) || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
      })
      .catch(() => {
        document.getElementById('walk-add-location-text').textContent =
          `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
      });
  }

  function switchWalkAddTab(tab) {
    document.querySelectorAll('.modal-tab').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.tab === tab));
    document.getElementById('walk-add-tab-info').classList.toggle('hidden', tab !== 'info');
    document.getElementById('walk-add-tab-rating').classList.toggle('hidden', tab !== 'rating');
  }

  function setWalkAddStars(val) {
    walkAddRating = val;
    document.querySelectorAll('#walk-add-stars .star').forEach(btn =>
      btn.classList.toggle('active', parseInt(btn.dataset.value, 10) <= val));
  }

  function saveWalkAddItem() {
    const title = document.getElementById('walk-add-title').value.trim();
    if (!title) {
      switchWalkAddTab('info');
      document.getElementById('walk-add-title').focus();
      return;
    }
    const placeType = document.getElementById('walk-add-place-type').value;
    const description = document.getElementById('walk-add-desc').value.trim();
    const review = document.getElementById('walk-add-review').value.trim();

    const item = {
      id: Storage.genId(),
      category: 'place',
      title,
      description,
      placeType,
      location: walkAddLocation || null,
      priority: 2,
      createdAt: new Date().toISOString(),
    };
    Storage.save(item);

    if (walkAddRating > 0 || review) {
      Storage.addVisit(item.id, {
        id: Storage.genId(),
        date: Date.now(),
        rating: walkAddRating || null,
        review,
        issue: null,
      });
    }

    closeModal('walk-add-modal');
    renderList(); // also calls MapModule.renderMarkers internally
    const loc = MapModule.getUserLocation();
    if (loc) renderNearbyPanel(loc.lat, loc.lng);

    showWalkToast('Место добавлено');
  }

  function showWalkToast(msg) {
    let el = document.getElementById('walk-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'walk-toast';
      el.className = 'walk-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ===================== THEME =====================

  function applyTheme(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('wishlist_theme', dark ? 'dark' : 'light');
    const toggle = document.getElementById('toggle-dark-mode');
    if (toggle) toggle.checked = dark;
  }

  function initTheme() {
    const saved = localStorage.getItem('wishlist_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved ? saved === 'dark' : prefersDark);
  }

  // ===================== SETTINGS =====================

  function openSettingsModal() {
    document.getElementById('settings-status').classList.add('hidden');
    openModal('settings-modal');
  }

  function exportData() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      items: JSON.parse(localStorage.getItem('wishlist_v1') || '[]'),
      routes: JSON.parse(localStorage.getItem('wishlist_routes_v1') || '[]'),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wishlist_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSettingsStatus('Файл сохранён', 'success');
  }

  function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.items || !Array.isArray(data.items)) throw new Error('bad format');
        const itemCount = data.items.length;
        const routeCount = (data.routes || []).length;
        const msg = `Найдено: ${itemCount} мест${routeCount ? ` и ${routeCount} маршрутов` : ''}.\nТекущие данные будут заменены. Продолжить?`;
        if (!confirm(msg)) return;
        localStorage.setItem('wishlist_v1', JSON.stringify(data.items));
        localStorage.setItem('wishlist_routes_v1', JSON.stringify(data.routes || []));
        closeModal('settings-modal');
        renderList();
        renderFilteredMarkers();
        if (currentView === 'route') renderRoutePanel();
        if (currentView === 'walk') MapModule.renderWalkMarkers(mapItems);
        showSettingsStatus(`Загружено: ${itemCount} мест`, 'success');
      } catch {
        showSettingsStatus('Ошибка: неверный формат файла', 'error');
      }
    };
    reader.readAsText(file);
    // reset so same file can be re-selected
    document.getElementById('input-import').value = '';
  }

  function clearAllData() {
    if (!confirm('Удалить ВСЕ данные? Это действие нельзя отменить.')) return;
    localStorage.removeItem('wishlist_v1');
    localStorage.removeItem('wishlist_routes_v1');
    MapModule.clearRouteSelection();
    MapModule.clearWalkSelection();
    MapModule.clearActiveRoute();
    closeModal('settings-modal');
    renderList();
    MapModule.renderMarkers([]);
    if (currentView === 'route') renderRoutePanel();
  }

  function showSettingsStatus(msg, type) {
    const el = document.getElementById('settings-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `settings-status settings-status-${type}`;
    setTimeout(() => el.classList.add('hidden'), 3500);
  }

  // ===================== UTILS =====================

  function escHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ===================== INIT =====================

  function init() {
    // Map filter chips
    document.querySelectorAll('.map-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => toggleMapFilter(chip.dataset.type));
    });

    // Settings
    document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
    document.getElementById('btn-settings-close').addEventListener('click', () => closeModal('settings-modal'));
    document.getElementById('settings-modal-overlay').addEventListener('click', () => closeModal('settings-modal'));
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('input-import').addEventListener('change', e => handleImportFile(e.target.files[0]));
    document.getElementById('btn-clear-all').addEventListener('click', clearAllData);
    document.getElementById('toggle-dark-mode').addEventListener('change', e => applyTheme(e.target.checked));

    // Walk add modal
    document.getElementById('btn-walk-add-close').addEventListener('click', () => closeModal('walk-add-modal'));
    document.getElementById('walk-add-modal-overlay').addEventListener('click', () => closeModal('walk-add-modal'));
    document.getElementById('btn-walk-add-save').addEventListener('click', saveWalkAddItem);
    document.querySelectorAll('.modal-tab').forEach(btn =>
      btn.addEventListener('click', () => switchWalkAddTab(btn.dataset.tab)));
    document.querySelectorAll('#walk-add-stars .star').forEach(btn =>
      btn.addEventListener('click', () => setWalkAddStars(parseInt(btn.dataset.value, 10))));

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

    // Walk buttons
    document.getElementById('btn-walk-build').addEventListener('click', buildAndSaveWalkRoute);
    document.getElementById('btn-walk-clear').addEventListener('click', () => {
      MapModule.clearWalkSelection();
      MapModule.clearWalkRoute();
      const loc = MapModule.getUserLocation();
      if (loc) renderNearbyPanel(loc.lat, loc.lng);
      else renderWalkRouteSection();
    });

    // Map route selection callback
    MapModule.setOnRouteChange((selected) => {
      updateRouteBadge(selected.length);
      if (currentView === 'route') renderRoutePanel();
    });

    // Walk selection callback
    MapModule.setOnWalkSelectionChange(() => {
      if (currentView === 'walk') {
        const loc = MapModule.getUserLocation();
        if (loc) renderNearbyPanel(loc.lat, loc.lng);
        else renderWalkRouteSection();
      }
    });

    // Init maps lazily
    MapModule.initLocationMap((lat, lng, address) => {
      locationPickResult = { lat, lng, address };
      updateLocationDisplay(locationPickResult);
    });

    // Hide map hint after 4s
    setTimeout(() => {
      const hint = document.getElementById('map-hint');
      if (hint) hint.classList.add('hidden');
    }, 4000);

    // Theme
    initTheme();

    // Initial render
    renderList();
    icons();
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
    toggleWalkItem,
    removeFromWalk,
    renderRoutePanel,
    loadSavedRoute,
    deleteSavedRoute,
    openWalkAddModal,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  MapModule.initMainMap();
  MapModule.initRouteMap();
  MapModule.initWalkMap();
  App.init();
});
