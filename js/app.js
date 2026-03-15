'use strict';

const App = (() => {
  let currentView = 'places';
  let placesStatusFilter = 'all';
  let placesTypeFilter = 'all';
  let walkRadiusMeters = 2000;
  let issuePopupTimer = null;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function icon(name, cls = '') {
    return `<i data-lucide="${name}" class="icon${cls ? ' ' + cls : ''}"></i>`;
  }

  function icons() { if (window.lucide) lucide.createIcons(); }

  function escHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function shortAddr(addr) {
    if (!addr) return '';
    return addr.split(',').slice(0, 2).join(',').trim();
  }

  function formatPrice(p) { return Number(p).toLocaleString('ru-RU'); }

  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    document.body.style.overflow = '';
  }

  // ── View switching ────────────────────────────────────────────────────────────

  function switchView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const viewEl = document.getElementById(`view-${name}`);
    if (viewEl) viewEl.classList.add('active');

    const navBtn = document.querySelector(`.nav-btn[data-view="${name}"]`);
    if (navBtn) navBtn.classList.add('active');

    currentView = name;

    const titles = {
      places:    'Мои места',
      templates: 'Шаблоны',
      trips:     'Поездки',
      walk:      'Гуляю',
    };
    document.getElementById('view-title').textContent = titles[name] || '';

    // Toggle add button visibility
    const btnAdd = document.getElementById('btn-add');
    if (btnAdd) btnAdd.classList.toggle('hidden', name !== 'places');

    if (name === 'places') renderPlacesList();
    if (name === 'templates' && typeof TemplatesModule !== 'undefined') TemplatesModule.renderTemplatesList();
    if (name === 'trips'     && typeof TripsModule     !== 'undefined') TripsModule.renderTripsList();

    if (name === 'walk') {
      // Reset POI layer toggles
      document.querySelectorAll('.poi-chip').forEach(b => b.classList.remove('poi-chip--active'));
      MapModule.clearPOILayers('walk');
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

  // ── Places list ───────────────────────────────────────────────────────────────

  const placeTypeLabels = {
    museum:     'Музей',
    cafe:       'Кафе',
    restaurant: 'Ресторан',
    park:       'Парк',
    hotel:      'Отель',
    other:      'Место',
    experience: 'Впечатление',
    material:   'Вещь',
    mansion:    'Особняк',
    shop:       'Магазин',
  };

  const placeTypeIcons = {
    museum: 'landmark', cafe: 'coffee', restaurant: 'utensils',
    park: 'tree-pine', hotel: 'hotel', other: 'map-pin',
    experience: 'sparkles', material: 'gift', mansion: 'castle', shop: 'shopping-bag',
  };

  const flagDefs = {
    booking_required: { emoji: '📅', label: 'Нужна бронь' },
    seasonal:         { emoji: '🌿', label: 'Сезонное' },
    crowded:          { emoji: '👥', label: 'Бывает людно' },
    closed:           { emoji: '❌', label: 'Закрыто / изменилось' },
    expensive:        { emoji: '💸', label: 'Дороже ожиданий' },
    note:             { emoji: 'ℹ️', label: 'Нюанс' },
  };

  function flagIconsHtml(flags, withLabel = false) {
    if (!flags || !flags.length) return '';
    return flags.map(f => {
      const def = flagDefs[f];
      if (!def) return '';
      return withLabel
        ? `<span class="flag-item"><span class="flag-emoji">${def.emoji}</span><span class="flag-label">${escHtml(def.label)}</span></span>`
        : `<span class="flag-emoji" title="${escHtml(def.label)}">${def.emoji}</span>`;
    }).join('');
  }

  function metroStationsHtml(stations) {
    if (!stations || !stations.length) return '';
    return `<div class="metro-stations-row">${stations.map(s => `
      <span class="metro-station">
        <span class="metro-dot" style="background:${escHtml(s.line_color || '#888')}"></span>
        <span class="metro-name">${escHtml(s.name)}</span>
        ${s.exit ? `<span class="metro-exit">вых.${escHtml(s.exit)}</span>` : ''}
      </span>`).join('')}</div>`;
  }

  function renderStars(avg) {
    const rounded = Math.round(avg);
    return Array.from({ length: 5 }, (_, i) =>
      `<i data-lucide="star" class="icon star-display${i < rounded ? ' filled' : ''}"></i>`
    ).join('');
  }

  function visitLabel(n) {
    if (n === 1) return 'Был 1 раз';
    if (n >= 2 && n <= 4) return `Был ${n} раза`;
    return `Был ${n} раз`;
  }

  function renderPlacesList() {
    let items = Storage.getAll();

    // Status filter
    if (placesStatusFilter !== 'all') {
      items = items.filter(i => i.status === placesStatusFilter);
    }

    // Type filter
    if (placesTypeFilter !== 'all') {
      items = items.filter(i => i.type === placesTypeFilter);
    }

    // Sort: wishlist first, then visited; within each group by priority desc
    items.sort((a, b) => {
      const sa = a.status === 'wishlist' ? 0 : 1;
      const sb = b.status === 'wishlist' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return (b.priority || 2) - (a.priority || 2);
    });

    const listEl = document.getElementById('wish-list');
    const emptyEl = document.getElementById('empty-state');

    if (items.length === 0) {
      if (listEl) listEl.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    if (listEl) {
      listEl.innerHTML = items.map(placeCardHtml).join('');
      icons();
    }
  }

  function placeCardHtml(item) {
    const avg      = Storage.avgRating(item);
    const visited  = item.status === 'visited';
    const flags    = item.flags || [];
    const typeLabel = placeTypeLabels[item.type] || item.type || '';
    const typeIconName = placeTypeIcons[item.type] || 'map-pin';
    const addr     = item.address || (item.location && item.location.address) || '';
    const starsHtml = avg > 0 ? `<span class="stars">${renderStars(avg)}</span>` : '';
    const flagsHtml = flagIconsHtml(flags);
    const statusBadge = visited
      ? `<span class="badge badge-visited">Был</span>`
      : `<span class="badge badge-wishlist">Хочу</span>`;
    const metroHtml = item.metro_stations && item.metro_stations.length
      ? metroStationsHtml(item.metro_stations) : '';

    const visits = item.visits || [];
    const visitsHtml = visits.length > 0 ? `
      <div class="visits-accordion">
        <button class="visits-toggle" onclick="App.toggleVisits('${item.id}',this)">
          ${icon('chevron-right', 'arrow')} История (${visits.length})
        </button>
        <div class="visits-list" id="visits-${item.id}">
          ${visits.map(visitItemHtml).join('')}
        </div>
      </div>` : '';

    return `<div class="wish-card" data-id="${item.id}" onclick="App.openPlaceDetail('${item.id}')">
      <div class="card-body">
        <div class="card-header">
          <span class="card-title${visited ? ' visited' : ''}">${escHtml(item.name || item.title || '')}</span>
          <div class="card-badges">
            ${statusBadge}
            <span class="priority-dot p${item.priority || 2}" title="Приоритет: ${item.priority || 2}"></span>
          </div>
        </div>
        <div class="card-type-row">
          ${icon(typeIconName, 'icon-sm meta-icon')} <span class="card-type-label">${escHtml(typeLabel)}</span>
          ${addr ? `· <span class="card-addr">${escHtml(shortAddr(addr))}</span>` : ''}
        </div>
        ${metroHtml}
        ${starsHtml ? `<div class="card-rating">${starsHtml}</div>` : ''}
        ${flagsHtml ? `<div class="card-flags">${flagsHtml}</div>` : ''}
        ${item.comment ? `<div class="card-description">${escHtml(item.comment)}</div>` : ''}
        ${visitsHtml}
        <div class="card-footer" onclick="event.stopPropagation()">
          <button class="btn-card btn-card-primary btn-sm" onclick="App.openVisitModal('${item.id}')">
            ${icon('star', 'icon-sm')} Оценить
          </button>
          <button class="btn-card btn-card-secondary btn-sm btn-icon-only" onclick="App.openEditModal('${item.id}')" title="Изменить">
            ${icon('pencil', 'icon-sm')}
          </button>
        </div>
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

  function toggleVisits(id, btn) {
    const list = document.getElementById(`visits-${id}`);
    if (!list) return;
    const open = list.classList.toggle('open');
    btn.classList.toggle('open', open);
    icons();
  }

  // ── Place detail ──────────────────────────────────────────────────────────────

  function openPlaceDetail(id) {
    const item = Storage.getById(id);
    if (!item) return;

    const avg   = Storage.avgRating(item);
    const flags = item.flags || [];
    const addr  = item.address || (item.location && item.location.address) || '';
    const lat   = item.coordinates ? item.coordinates.lat : (item.location && item.location.lat);
    const lng   = item.coordinates ? item.coordinates.lng : (item.location && item.location.lng);

    const starsHtml = avg > 0 ? `<div class="detail-rating">${renderStars(avg)} <span class="rating-num">${avg.toFixed(1)}</span></div>` : '';

    const flagsSection = flags.length ? `
      <div class="detail-section">
        <div class="detail-section-title">Флаги</div>
        <div class="flags-list">${flagIconsHtml(flags, true)}</div>
      </div>` : '';

    const metroSection = (item.metro_stations && item.metro_stations.length) ? `
      <div class="detail-section">
        <div class="detail-section-title">Метро</div>
        ${metroStationsHtml(item.metro_stations)}
      </div>` : '';

    const commentSection = item.comment ? `
      <div class="detail-section">
        <div class="detail-section-title">Комментарий</div>
        <div class="detail-comment">${escHtml(item.comment)}</div>
      </div>` : '';

    const priceSection = (item.price_note || item.price_range) ? `
      <div class="detail-section">
        <div class="detail-section-title">Цены</div>
        <div class="detail-price">
          ${item.price_range ? `<span class="price-range-badge pr-${item.price_range}">${{'budget':'₽ Бюджетно','mid':'₽₽ Средне','expensive':'₽₽₽ Дорого'}[item.price_range] || ''}</span>` : ''}
          ${item.price_note ? `<span class="price-note">${escHtml(item.price_note)}</span>` : ''}
        </div>
      </div>` : '';

    const mapSection = (lat && lng) ? `
      <div class="detail-section">
        <div id="place-detail-map" class="place-detail-map"></div>
        <div class="detail-map-links">
          <a href="https://maps.google.com/?q=${lat},${lng}" target="_blank" rel="noopener" class="btn-ghost-small">Google Maps</a>
          <a href="https://yandex.ru/maps/?pt=${lng},${lat}&z=17" target="_blank" rel="noopener" class="btn-ghost-small">Яндекс Карты</a>
        </div>
      </div>` : '';

    const visits = item.visits || [];
    const historySection = visits.length ? `
      <div class="detail-section">
        <div class="detail-section-title">История посещений</div>
        ${visits.map(visitItemHtml).join('')}
      </div>` : '';

    const typeLabel = placeTypeLabels[item.type] || item.type || '';

    document.getElementById('place-detail-title').textContent = item.name || item.title || '';
    document.getElementById('place-detail-body').innerHTML = `
      <div class="detail-meta">
        ${icon(placeTypeIcons[item.type] || 'map-pin', 'icon-sm meta-icon')} ${escHtml(typeLabel)}
        ${addr ? `· ${escHtml(shortAddr(addr))}` : ''}
      </div>
      ${starsHtml}
      ${flagsSection}
      ${metroSection}
      ${commentSection}
      ${priceSection}
      ${mapSection}
      ${historySection}
      <div class="detail-actions">
        <button class="btn-primary btn-sm" onclick="App.openVisitModal('${item.id}')">
          ${icon('star', 'icon-sm')} Отметить посещение
        </button>
        <button class="btn-secondary btn-sm" onclick="App.openEditModal('${item.id}');App.closeModal('place-detail-modal')">
          ${icon('pencil', 'icon-sm')} Изменить
        </button>
        ${typeof TemplatesModule !== 'undefined' ? `<button class="btn-ghost btn-sm" onclick="TemplatesModule.addPlaceToTemplate('${item.id}')">+ В шаблон</button>` : ''}
        ${typeof TripsModule !== 'undefined' ? `<button class="btn-ghost btn-sm" onclick="TripsModule.addPlaceToTrip('${item.id}')">+ В поездку</button>` : ''}
      </div>
    `;

    openModal('place-detail-modal');
    icons();

    // Init mini-map after modal opens
    if (lat && lng) {
      setTimeout(() => {
        const mapEl = document.getElementById('place-detail-map');
        if (mapEl && !mapEl._leaflet_id) {
          const miniMap = L.map('place-detail-map', { zoomControl: false, dragging: false, scrollWheelZoom: false }).setView([lat, lng], 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(miniMap);
          L.marker([lat, lng]).addTo(miniMap);
          mapEl.addEventListener('click', () => {
            window.open(`https://maps.google.com/?q=${lat},${lng}`, '_blank');
          });
        }
      }, 300);
    }
  }

  // ── Add/Edit modal ────────────────────────────────────────────────────────────

  let locationPickResult = null;
  let _metroStations = []; // metro stations being edited

  function openAddModal() {
    locationPickResult = null;
    _metroStations = [];
    const form = document.getElementById('wish-form');
    form.reset();
    document.querySelector('input[name="id"]').value = '';
    document.querySelector('input[name="priority"][value="2"]').checked = true;
    document.getElementById('modal-title').textContent = 'Новое место';
    document.getElementById('btn-delete-wish').classList.add('hidden');
    updateLocationDisplay(null);
    MapModule.clearLocationMarker();
    renderMetroStationsList();
    openModal('modal');
    setTimeout(() => MapModule.resizeLocationMap(), 300);
  }

  function openEditModal(id) {
    const item = Storage.getById(id);
    if (!item) return;

    const lat = item.coordinates ? item.coordinates.lat : (item.location && item.location.lat);
    const lng = item.coordinates ? item.coordinates.lng : (item.location && item.location.lng);
    const addr = item.address || (item.location && item.location.address) || '';
    locationPickResult = (lat && lng) ? { lat, lng, address: addr } : null;

    _metroStations = (item.metro_stations || []).map(s => ({ ...s }));

    const form = document.getElementById('wish-form');
    form.reset();

    document.querySelector('input[name="id"]').value = item.id;
    document.querySelector('input[name="title"]').value = item.name || item.title || '';
    document.querySelector('textarea[name="comment"]').value = item.comment || item.description || '';
    document.querySelector('input[name="priority"][value="' + (item.priority || 2) + '"]').checked = true;
    document.getElementById('modal-title').textContent = 'Изменить место';
    document.getElementById('btn-delete-wish').classList.remove('hidden');

    // Type
    const typeSelect = form.elements['placeType'];
    if (typeSelect) typeSelect.value = item.type || item.placeType || 'other';

    // Price range
    const pr = item.price_range || 'mid';
    const prInput = form.querySelector(`input[name="price_range"][value="${pr}"]`);
    if (prInput) prInput.checked = true;
    const priceNoteEl = form.elements['price_note'];
    if (priceNoteEl) priceNoteEl.value = item.price_note || item.priceText || '';

    // Flags
    form.querySelectorAll('input[name="flags"]').forEach(cb => {
      cb.checked = (item.flags || []).includes(cb.value);
    });

    // Location
    if (locationPickResult) {
      updateLocationDisplay(locationPickResult);
      MapModule.setLocationMarker(lat, lng);
    } else {
      updateLocationDisplay(null);
      MapModule.clearLocationMarker();
    }

    renderMetroStationsList();
    openModal('modal');
    setTimeout(() => MapModule.resizeLocationMap(), 300);
  }

  // ── Metro station editor ──────────────────────────────────────────────────────

  function renderMetroStationsList() {
    const el = document.getElementById('metro-stations-list');
    if (!el) return;
    el.innerHTML = _metroStations.map((s, i) => `
      <div class="metro-row" data-idx="${i}">
        <input class="form-input metro-input" placeholder="Станция *" value="${escHtml(s.name || '')}" onchange="App._updateMetro(${i},'name',this.value)">
        <input class="form-input metro-input" placeholder="Линия" value="${escHtml(s.line || '')}" onchange="App._updateMetro(${i},'line',this.value)">
        <div class="metro-color-row">
          <input type="color" class="metro-color-input" value="${escHtml(s.line_color || '#888888')}" onchange="App._updateMetro(${i},'line_color',this.value)" title="Цвет линии">
          <input class="form-input metro-input metro-exit-input" placeholder="Выход" value="${escHtml(s.exit || '')}" onchange="App._updateMetro(${i},'exit',this.value)">
          <button type="button" class="btn-ghost-small metro-remove-btn" onclick="App._removeMetro(${i})">✕</button>
        </div>
      </div>`).join('');
  }

  function _updateMetro(idx, field, value) {
    if (_metroStations[idx]) _metroStations[idx][field] = value;
  }

  function _removeMetro(idx) {
    _metroStations.splice(idx, 1);
    renderMetroStationsList();
  }

  function _addMetro() {
    _metroStations.push({ name: '', line: '', line_color: '#888888', exit: '' });
    renderMetroStationsList();
    // Focus last station name input
    setTimeout(() => {
      const rows = document.querySelectorAll('.metro-row');
      if (rows.length) rows[rows.length - 1].querySelector('.metro-input')?.focus();
    }, 50);
  }

  // ── Form submit ───────────────────────────────────────────────────────────────

  function handleWishFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.title || !data.title.trim()) {
      form.elements.title.focus();
      return;
    }

    if (!data.locationLat) {
      alert('Пожалуйста, укажите местоположение на карте.');
      return;
    }

    const existingItem = data.id ? Storage.getById(data.id) : null;
    const user = Storage.getActiveUser();

    // Collect flags (checkboxes)
    const flags = Array.from(form.querySelectorAll('input[name="flags"]:checked')).map(cb => cb.value);

    // Filter out incomplete metro stations
    const metro_stations = _metroStations
      .filter(s => s.name && s.name.trim())
      .map(s => ({
        name:       s.name.trim(),
        line:       (s.line || '').trim(),
        line_color: s.line_color || '#888888',
        exit:       (s.exit || '').trim() || null,
      }));

    const item = {
      id:          data.id || Storage.genId(),
      // Legacy fields (for backward compat)
      category:    'place',
      title:       data.title.trim(),
      description: (data.comment || '').trim(),
      // New fields
      name:        data.title.trim(),
      type:        data.placeType || 'other',
      placeType:   data.placeType || 'other',
      coordinates: {
        lat: parseFloat(data.locationLat),
        lng: parseFloat(data.locationLng),
      },
      location: {
        lat:     parseFloat(data.locationLat),
        lng:     parseFloat(data.locationLng),
        address: data.locationAddress || '',
      },
      address:      data.locationAddress || '',
      metro_stations,
      flags,
      comment:      (data.comment || '').trim(),
      price_range:  data.price_range || 'mid',
      price_note:   (data.price_note || '').trim(),
      priority:     parseInt(data.priority, 10) || 2,
      status:       existingItem ? (existingItem.status || 'wishlist') : 'wishlist',
      added_by:     existingItem ? (existingItem.added_by || user.id) : user.id,
      createdAt:    existingItem ? existingItem.createdAt || Date.now() : Date.now(),
      visits:       existingItem ? (existingItem.visits || []) : [],
      _migrated_v2: true,
    };

    Storage.save(item);
    closeModal('modal');
    if (currentView === 'places') renderPlacesList();
    MapModule.renderWalkMarkers(Storage.getAll());
  }

  function handleDeleteWish() {
    const id = document.querySelector('input[name="id"]').value;
    if (!id) return;
    if (!confirm('Удалить это место?')) return;
    Storage.remove(id);
    closeModal('modal');
    if (currentView === 'places') renderPlacesList();
    MapModule.renderWalkMarkers(Storage.getAll());
  }

  function updateLocationDisplay(loc) {
    const display = document.getElementById('location-display');
    const text    = document.getElementById('location-text');
    if (loc) {
      display.classList.remove('hidden');
      text.textContent = shortAddr(loc.address) || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
      document.querySelector('input[name="locationLat"]').value  = loc.lat;
      document.querySelector('input[name="locationLng"]').value  = loc.lng;
      document.querySelector('input[name="locationAddress"]').value = loc.address || '';
    } else {
      display.classList.add('hidden');
      document.querySelector('input[name="locationLat"]').value  = '';
      document.querySelector('input[name="locationLng"]').value  = '';
      document.querySelector('input[name="locationAddress"]').value = '';
    }
  }

  // ── Visit modal ───────────────────────────────────────────────────────────────

  let starRating = 0;

  function openVisitModal(wishId) {
    const item = Storage.getById(wishId);
    if (!item) return;

    starRating = 0;
    const form = document.getElementById('visit-form');
    form.reset();
    document.querySelector('#visit-form input[name="wishId"]').value  = wishId;
    document.querySelector('#visit-form input[name="visitId"]').value = '';
    document.querySelector('#visit-form input[name="rating"]').value  = '';
    document.getElementById('visit-modal-title').textContent = 'Отметить посещение';
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

    if (!data.rating) { alert('Пожалуйста, поставьте оценку.'); return; }

    const user = Storage.getActiveUser();
    const visit = {
      id:      data.visitId || Storage.genId(),
      date:    Date.now(),
      rating:  parseInt(data.rating, 10),
      review:  (data.review || '').trim(),
      issue:   data.hasIssue ? (data.issue || '').trim() : null,
      user_id: user.id,
      trip_id: null,
    };

    Storage.addVisit(data.wishId, visit);
    closeModal('visit-modal');
    if (currentView === 'places') renderPlacesList();
  }

  // ── Geocoding ─────────────────────────────────────────────────────────────────

  async function handleGeoSearch() {
    const query    = document.getElementById('location-search').value.trim();
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
      resultsEl.innerHTML = results.map(r =>
        `<div class="geocode-result-item" data-lat="${r.lat}" data-lng="${r.lon}" data-addr="${escHtml(r.display_name)}">${escHtml(r.display_name)}</div>`
      ).join('');
      resultsEl.querySelectorAll('.geocode-result-item[data-lat]').forEach(el => {
        el.addEventListener('click', () => {
          const lat  = parseFloat(el.dataset.lat);
          const lng  = parseFloat(el.dataset.lng);
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

  // ── User switcher ─────────────────────────────────────────────────────────────

  function switchUser() {
    const current = Storage.getActiveUser();
    const nextId  = current.id === 'alice' ? 'bob' : 'alice';
    Storage.setActiveUser(nextId);
    const next = Storage.getActiveUser();
    // Update FAB
    const fab = document.getElementById('user-fab-avatar');
    if (fab) fab.textContent = next.avatar;
    // Toast
    showToast(`Вы вошли как ${next.name} ${next.avatar}`);
    // Re-render
    if (currentView === 'places') renderPlacesList();
    if (currentView === 'templates' && typeof TemplatesModule !== 'undefined') TemplatesModule.renderTemplatesList();
    if (currentView === 'trips'     && typeof TripsModule     !== 'undefined') TripsModule.renderTripsList();
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

  // ── Template/Trip delegators ──────────────────────────────────────────────────

  function openTemplateEditor(id) {
    if (typeof TemplatesModule !== 'undefined') TemplatesModule.openTemplateEditor(id);
  }

  // ── Walk mode ─────────────────────────────────────────────────────────────────

  function haversine(lat1, lon1, lat2, lon2) {
    const R  = 6371000;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function renderNearbyPanel(userLat, userLng) {
    const locEl    = document.getElementById('walk-locating');
    const contentEl= document.getElementById('walk-content');
    if (locEl) locEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');

    // Metro detection (Moscow / SPb)
    if (typeof findNearestMetroStation !== 'undefined') {
      const nearest = findNearestMetroStation(userLat, userLng, 800);
      renderMetroBanner(nearest);
    }

    // Filter places with coordinates
    const items = Storage.getAll().filter(i => {
      const lat = i.coordinates ? i.coordinates.lat : (i.location && i.location.lat);
      const lng = i.coordinates ? i.coordinates.lng : (i.location && i.location.lng);
      return lat && lng;
    });

    const withDist = items.map(item => {
      const lat = item.coordinates ? item.coordinates.lat : item.location.lat;
      const lng = item.coordinates ? item.coordinates.lng : item.location.lng;
      return { ...item, dist: haversine(userLat, userLng, lat, lng) };
    })
      .filter(i => i.dist <= walkRadiusMeters)
      .sort((a, b) => a.dist - b.dist);

    const listEl = document.getElementById('walk-nearby-list');
    if (!listEl) return;

    if (withDist.length === 0) {
      listEl.innerHTML = '<p class="walk-empty">Мест в выбранном радиусе нет.</p>';
    } else {
      const walkSel = MapModule.getWalkSelected();
      listEl.innerHTML = withDist.map(item => {
        const dist     = item.dist;
        const distStr  = dist < 1000 ? `${Math.round(dist)} м` : `${(dist / 1000).toFixed(1)} км`;
        const walkMins = Math.round(dist / 83.3);
        const timeStr  = walkMins >= 60
          ? `${Math.floor(walkMins / 60)} ч ${walkMins % 60} мин` : `${walkMins} мин`;
        const flags    = item.flags || [];
        const flagsHtml = flagIconsHtml(flags);
        const inWalk   = walkSel.includes(item.id);
        const nearTag  = dist <= 500 ? '<span class="walk-near-tag">Рядом</span>' : '';
        const typeIcon = icon(placeTypeIcons[item.type] || 'map-pin', 'icon-sm');
        return `<div class="walk-nearby-item${inWalk ? ' selected' : ''}" data-id="${item.id}">
          <label class="walk-nearby-label">
            <input type="checkbox" class="walk-nearby-check" ${inWalk ? 'checked' : ''} onchange="App.toggleWalkItem('${item.id}')">
            <div class="walk-nearby-info">
              <div class="walk-nearby-name">${typeIcon} ${escHtml(item.name || item.title || '')} ${nearTag}</div>
              <div class="walk-nearby-meta">${distStr} · ~${timeStr} пешком ${flagsHtml}</div>
            </div>
          </label>
        </div>`;
      }).join('');
      icons();
    }

    renderWalkRoutePanel();
  }

  function renderMetroBanner(station) {
    const bannerEl = document.getElementById('walk-metro-banner');
    if (!bannerEl) return;
    if (!station) {
      bannerEl.classList.add('hidden');
      return;
    }
    bannerEl.classList.remove('hidden');
    bannerEl.innerHTML = `
      <div class="metro-banner-info">
        <span class="metro-dot" style="background:${escHtml(station.line_color || '#888')}"></span>
        <span>Ближайшее метро: <strong>${escHtml(station.name)}</strong> (${station.distance} м)</span>
      </div>
      <div class="metro-banner-btns">
        <button class="btn-sm btn-ghost" onclick="App._walkOnFoot()">🚶 Пешком</button>
        <button class="btn-sm btn-primary" onclick="App._walkFromMetro('${escHtml(station.name)}',${station.lat},${station.lng})">🚇 Маршрут от станции</button>
      </div>`;
  }

  function _walkOnFoot() {
    // Already showing foot mode — just close banner
    const bannerEl = document.getElementById('walk-metro-banner');
    if (bannerEl) bannerEl.classList.add('hidden');
  }

  function _walkFromMetro(stationName, lat, lng) {
    window.open(`https://maps.google.com/?saddr=current+location&daddr=${lat},${lng}&travelmode=transit`, '_blank');
  }

  function renderWalkRoutePanel() {
    const selected    = MapModule.getWalkSelected();
    const panelEl     = document.getElementById('walk-route-panel');
    const countEl     = document.getElementById('walk-route-count');
    if (!panelEl) return;
    panelEl.classList.toggle('hidden', selected.length === 0);
    if (countEl) countEl.textContent = `Выбрано: ${selected.length}`;
  }

  function buildAndSaveWalkRoute() {
    const walkSel = MapModule.getWalkSelected();
    if (!walkSel.length) return;
    const userLoc = MapModule.getUserLocation();
    if (!userLoc) return;

    const items = Storage.getAll();
    const selectedItems = walkSel
      .map(id => items.find(i => i.id === id))
      .filter(i => i && (i.coordinates || i.location));

    if (!selectedItems.length) return;

    const getCoords = i => i.coordinates || { lat: i.location.lat, lng: i.location.lng };

    const now = new Date();
    const route = {
      id:          Storage.genId(),
      name:        `Гуляем ${now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} ${now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
      createdAt:   Date.now(),
      userLocation: userLoc,
      placeIds:    selectedItems.map(i => i.id),
      placeNames:  selectedItems.map(i => i.name || i.title || ''),
      waypoints:   [
        { lat: userLoc.lat, lng: userLoc.lng },
        ...selectedItems.map(i => getCoords(i)),
      ],
    };

    Storage.saveRoute(route);
    MapModule.clearWalkSelection();
    MapModule.clearWalkRoute();
    renderWalkRoutePanel();
    MapModule.loadSavedRoute(route);
    MapModule.buildRoute(Storage.getAll());
  }

  function toggleWalkItem(id) {
    MapModule.toggleWalkSelect(id);
    const loc = MapModule.getUserLocation();
    if (loc) renderNearbyPanel(loc.lat, loc.lng);
    else renderWalkRoutePanel();
  }

  // ── Walk add ──────────────────────────────────────────────────────────────────

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
    const placeType   = document.getElementById('walk-add-place-type').value;
    const description = document.getElementById('walk-add-desc').value.trim();
    const review      = document.getElementById('walk-add-review').value.trim();
    const user        = Storage.getActiveUser();
    const loc         = walkAddLocation || null;

    const item = {
      id:          Storage.genId(),
      category:    'place',
      title,
      name:        title,
      description,
      comment:     description,
      type:        placeType,
      placeType,
      location:    loc,
      coordinates: loc ? { lat: loc.lat, lng: loc.lng } : null,
      address:     loc ? loc.address : '',
      priority:    2,
      status:      'visited',
      flags:       [],
      metro_stations: [],
      added_by:    user.id,
      createdAt:   new Date().toISOString(),
      _migrated_v2: true,
    };
    Storage.save(item);

    if (walkAddRating > 0 || review) {
      Storage.addVisit(item.id, {
        id:      Storage.genId(),
        date:    Date.now(),
        rating:  walkAddRating || null,
        review,
        issue:   null,
        user_id: user.id,
        trip_id: null,
      });
    }

    closeModal('walk-add-modal');
    if (currentView === 'places') renderPlacesList();
    MapModule.renderWalkMarkers(Storage.getAll());
    const mapLoc = MapModule.getUserLocation();
    if (mapLoc) renderNearbyPanel(mapLoc.lat, mapLoc.lng);
    showToast('Место добавлено');
  }

  // ── Toast ─────────────────────────────────────────────────────────────────────

  function showToast(msg) {
    let el = document.getElementById('app-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-toast';
      el.className = 'walk-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ── Theme ─────────────────────────────────────────────────────────────────────

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

  // ── Settings ──────────────────────────────────────────────────────────────────

  function openSettingsModal() {
    document.getElementById('settings-status').classList.add('hidden');
    openModal('settings-modal');
  }

  function exportData() {
    const data = {
      version:    2,
      exportedAt: new Date().toISOString(),
      items:      Storage.getAll(),
      routes:     Storage.getAllRoutes(),
      templates:  Storage.getAllTemplates(),
      trips:      Storage.getAllTrips(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `planer_backup_${new Date().toISOString().slice(0, 10)}.json`;
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
        const items  = data.items  || (Array.isArray(data) ? data : []);
        const routes = data.routes || [];
        const msg = `Найдено: ${items.length} мест${routes.length ? ` и ${routes.length} маршрутов` : ''}.\nТекущие данные будут заменены. Продолжить?`;
        if (!confirm(msg)) return;
        Storage.importAll(data.version === 2 ? data : items, routes);
        closeModal('settings-modal');
        renderPlacesList();
        showSettingsStatus(`Загружено: ${items.length} мест`, 'success');
      } catch {
        showSettingsStatus('Ошибка: неверный формат файла', 'error');
      }
    };
    reader.readAsText(file);
    document.getElementById('input-import').value = '';
  }

  function clearAllData() {
    if (!confirm('Удалить ВСЕ данные? Это действие нельзя отменить.')) return;
    Object.keys(localStorage)
      .filter(k => k.startsWith('wishlist_') || k.startsWith('tripplan_'))
      .forEach(k => localStorage.removeItem(k));
    MapModule.clearWalkSelection && MapModule.clearWalkSelection();
    MapModule.clearActiveRoute  && MapModule.clearActiveRoute();
    closeModal('settings-modal');
    renderPlacesList();
    MapModule.renderWalkMarkers([]);
  }

  function showSettingsStatus(msg, type) {
    const el = document.getElementById('settings-status');
    if (!el) return;
    el.textContent  = msg;
    el.className    = `settings-status settings-status-${type}`;
    setTimeout(() => el.classList.add('hidden'), 3500);
  }

  // ── Init & event bindings ─────────────────────────────────────────────────────

  function _initSync() {
    // Nav
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Status filter tabs
    document.querySelectorAll('.status-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        placesStatusFilter = tab.dataset.status;
        renderPlacesList();
      });
    });

    // Type chips
    document.querySelectorAll('.type-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.type-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        placesTypeFilter = chip.dataset.type;
        renderPlacesList();
      });
    });

    // Walk radius chips
    document.querySelectorAll('.walk-radius-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.walk-radius-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        walkRadiusMeters = parseInt(chip.dataset.radius, 10);
        const loc = MapModule.getUserLocation();
        if (loc) renderNearbyPanel(loc.lat, loc.lng);
      });
    });

    // Subtabs (trips)
    document.querySelectorAll('.subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.subtab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (typeof TripsModule !== 'undefined') TripsModule.setFilter(btn.dataset.subtab);
      });
    });

    // Add button
    document.getElementById('btn-add').addEventListener('click', openAddModal);

    // Settings
    document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
    document.getElementById('btn-settings-close').addEventListener('click', () => closeModal('settings-modal'));
    document.getElementById('settings-modal-overlay').addEventListener('click', () => closeModal('settings-modal'));
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('input-import').addEventListener('change', e => handleImportFile(e.target.files[0]));
    document.getElementById('btn-clear-all').addEventListener('click', clearAllData);
    document.getElementById('toggle-dark-mode').addEventListener('change', e => applyTheme(e.target.checked));

    // Auth (optional)
    document.getElementById('btn-back-to-own')?.addEventListener('click', () => {
      if (typeof Auth !== 'undefined' && Auth.resetViewingList) Auth.resetViewingList();
    });
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      if (typeof Auth !== 'undefined') Auth.logout();
    });

    // Modal close
    document.getElementById('btn-modal-close').addEventListener('click', () => closeModal('modal'));
    document.getElementById('modal-overlay').addEventListener('click', () => closeModal('modal'));

    // Place detail close
    document.getElementById('btn-place-detail-close').addEventListener('click', () => closeModal('place-detail-modal'));
    document.getElementById('place-detail-overlay').addEventListener('click', () => closeModal('place-detail-modal'));

    // Visit modal
    document.getElementById('btn-visit-close').addEventListener('click', () => closeModal('visit-modal'));
    document.getElementById('visit-modal-overlay').addEventListener('click', () => closeModal('visit-modal'));
    document.getElementById('visit-form').addEventListener('submit', handleVisitFormSubmit);
    document.querySelectorAll('#star-input .star').forEach(btn => {
      btn.addEventListener('click', () => setStarDisplay(parseInt(btn.dataset.value, 10)));
    });
    document.getElementById('hasIssue').addEventListener('change', function () {
      document.getElementById('issue-group').classList.toggle('hidden', !this.checked);
    });

    // Wish form
    document.getElementById('wish-form').addEventListener('submit', handleWishFormSubmit);
    document.getElementById('btn-delete-wish').addEventListener('click', handleDeleteWish);

    // Metro add button
    document.getElementById('btn-add-metro').addEventListener('click', _addMetro);

    // Location search
    document.getElementById('btn-geo-search').addEventListener('click', handleGeoSearch);
    document.getElementById('location-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); handleGeoSearch(); }
    });
    document.getElementById('btn-clear-location').addEventListener('click', () => {
      locationPickResult = null;
      updateLocationDisplay(null);
      MapModule.clearLocationMarker();
    });

    // Walk add modal
    document.getElementById('btn-walk-add-close').addEventListener('click', () => closeModal('walk-add-modal'));
    document.getElementById('walk-add-modal-overlay').addEventListener('click', () => closeModal('walk-add-modal'));
    document.getElementById('btn-walk-add-save').addEventListener('click', saveWalkAddItem);
    document.querySelectorAll('.modal-tab').forEach(btn =>
      btn.addEventListener('click', () => switchWalkAddTab(btn.dataset.tab)));
    document.querySelectorAll('#walk-add-stars .star').forEach(btn =>
      btn.addEventListener('click', () => setWalkAddStars(parseInt(btn.dataset.value, 10))));

    // Walk route panel
    document.getElementById('btn-walk-build').addEventListener('click', buildAndSaveWalkRoute);
    document.getElementById('btn-walk-clear').addEventListener('click', () => {
      MapModule.clearWalkSelection();
      MapModule.clearWalkRoute && MapModule.clearWalkRoute();
      const loc = MapModule.getUserLocation();
      if (loc) renderNearbyPanel(loc.lat, loc.lng);
      else renderWalkRoutePanel();
    });

    // Walk selection callback
    MapModule.setOnWalkSelectionChange && MapModule.setOnWalkSelectionChange(() => {
      if (currentView === 'walk') {
        const loc = MapModule.getUserLocation();
        if (loc) renderNearbyPanel(loc.lat, loc.lng);
        else renderWalkRoutePanel();
      }
    });

    // Location map callback
    MapModule.initLocationMap((lat, lng, address) => {
      locationPickResult = { lat, lng, address };
      updateLocationDisplay(locationPickResult);
    });

    // Theme
    initTheme();

    // User FAB initial state
    const fab = document.getElementById('user-fab-avatar');
    if (fab) fab.textContent = Storage.getActiveUser().avatar;
  }

  async function init() {
    initTheme();

    // Try auth but don't block on failure
    if (typeof Auth !== 'undefined') {
      try {
        Auth.initUI && Auth.initUI();
        const user = await Auth.init();
        const listId = user ? user.list_id : null;
        await Storage.init(listId);
      } catch (e) {
        console.warn('[App] Auth/Storage init failed, using localStorage:', e);
        await Storage.init(null);
      }
    } else {
      await Storage.init(null);
    }

    _initSync();
    renderPlacesList();
    icons();
  }

  // ── POI layers ────────────────────────────────────────────────────────────────

  async function toggleWalkPOI(type) {
    const loc = MapModule.getUserLocation();
    if (!loc) { showToast('Сначала включите геолокацию'); return; }
    const btn = document.querySelector(`.poi-chip[data-type="${type}"]`);
    if (btn) btn.classList.add('poi-chip--loading');
    try {
      const map = MapModule.getWalkMapInstance();
      const visible = await MapModule.togglePOILayer(map, 'walk', type, loc.lat, loc.lng, 1500);
      if (btn) btn.classList.toggle('poi-chip--active', visible);
    } catch (e) {
      showToast('Не удалось загрузить данные');
    } finally {
      if (btn) btn.classList.remove('poi-chip--loading');
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return {
    init,
    switchView,
    renderPlacesList,
    openAddModal,
    openEditModal,
    openVisitModal,
    openPlaceDetail,
    toggleVisits,
    showIssuePopup,
    toggleWalkItem,
    openWalkAddModal,
    switchUser,
    openTemplateEditor,
    toggleWalkPOI,
    closeModal,
    // Exposed for metro editor (onclick attributes)
    _updateMetro,
    _removeMetro,
    _walkOnFoot,
    _walkFromMetro,
    // Legacy compat (map.js calls)
    renderList: renderPlacesList,
    addToRouteFromList: () => {},
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  MapModule.initLocationMap && MapModule.initLocationMap(() => {});
  MapModule.initWalkMap();
  App.init();
});
