'use strict';

const TripsModule = (() => {

  let _tripsSubFilter = 'upcoming'; // 'upcoming' | 'past'
  let _openTripId = null;

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function icon(name, cls = '') {
    return `<i data-lucide="${name}" class="icon${cls ? ' ' + cls : ''}"></i>`;
  }

  function icons() { if (window.lucide) lucide.createIcons(); }

  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    document.body.style.overflow = '';
  }

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

  const flagDefs = {
    booking_required: { emoji: '📅', label: 'Нужна бронь' },
    seasonal:         { emoji: '🌿', label: 'Сезонное' },
    crowded:          { emoji: '👥', label: 'Бывает людно' },
    closed:           { emoji: '❌', label: 'Закрыто' },
    expensive:        { emoji: '💸', label: 'Дороже ожиданий' },
    note:             { emoji: 'ℹ️', label: 'Нюанс' },
  };

  function flagsHtml(flags) {
    if (!flags || !flags.length) return '';
    return flags.map(f => {
      const d = flagDefs[f];
      return d ? `<span class="flag-emoji" title="${esc(d.label)}">${d.emoji}</span>` : '';
    }).join('');
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDateShort(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function dateRangeStr(trip) {
    if (!trip.date_start) return 'Дата не указана';
    const start = formatDateShort(trip.date_start);
    if (!trip.date_end || trip.date_end === trip.date_start) return start;
    return `${start} – ${formatDateShort(trip.date_end)}`;
  }

  function tripDaysCount(trip) {
    return (trip.days || []).length;
  }

  function tripPlacesCount(trip) {
    return (trip.days || []).reduce((s, d) => s + (d.items || []).length, 0);
  }

  function userAvatar(userId) {
    const users = Storage.USERS;
    const u = users && users[userId];
    return u ? u.avatar : '👤';
  }

  function userName(userId) {
    const users = Storage.USERS;
    const u = users && users[userId];
    return u ? u.name : userId;
  }

  const STATUS_LABELS = {
    draft:    'Черновик',
    upcoming: 'Предстоящая',
    active:   'Активная',
    done:     'Завершена',
  };

  // ── Trip list ─────────────────────────────────────────────────────────────────

  function setFilter(sub) {
    _tripsSubFilter = sub;
    renderTripsList();
  }

  function renderTripsList() {
    let trips = Storage.getAllTrips();

    if (_tripsSubFilter === 'upcoming') {
      trips = trips.filter(t => t.status !== 'done');
    } else {
      trips = trips.filter(t => t.status === 'done');
    }

    // Sort by date_start ascending
    trips.sort((a, b) => (a.date_start || 0) - (b.date_start || 0));

    const listEl  = document.getElementById('trips-list');
    const emptyEl = document.getElementById('trips-empty');
    if (!listEl) return;

    if (trips.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    listEl.innerHTML = trips.map(tripCardHtml).join('');
    icons();
  }

  function tripCardHtml(trip) {
    const days   = tripDaysCount(trip);
    const places = tripPlacesCount(trip);
    const hasAcc = trip.accommodations && trip.accommodations.length > 0;
    const parts  = trip.participants || [];
    const maxAvatars = 3;
    const avatarsHtml = parts.slice(0, maxAvatars).map(p =>
      `<span class="participant-avatar" title="${esc(userName(p.user_id))}">${userAvatar(p.user_id)}</span>`
    ).join('') + (parts.length > maxAvatars ? `<span class="participant-more">+${parts.length - maxAvatars}</span>` : '');

    return `<div class="trip-card" onclick="TripsModule.openTripDetail('${trip.id}')">
      <div class="trip-card-header">
        <div class="trip-card-title">${esc(trip.name)}</div>
        <span class="trip-status-badge status-${trip.status}">${STATUS_LABELS[trip.status] || trip.status}</span>
      </div>
      <div class="trip-card-dates">${dateRangeStr(trip)}</div>
      <div class="trip-card-meta">
        <span>${days} ${daysWord(days)}</span>
        <span>·</span>
        <span>${places} мест</span>
        ${hasAcc ? '<span>· 🏨</span>' : ''}
      </div>
      <div class="trip-card-footer">
        <div class="participants-row">${avatarsHtml}</div>
        <button class="btn-ghost btn-sm" onclick="event.stopPropagation();TripsModule.deleteTrip('${trip.id}')">Удалить</button>
      </div>
    </div>`;
  }

  function daysWord(n) {
    if (n === 1) return 'день';
    if (n >= 2 && n <= 4) return 'дня';
    return 'дней';
  }

  // ── Trip detail ───────────────────────────────────────────────────────────────

  let _detailTab = 'days'; // 'days' | 'map' | 'budget'
  let _tripMapInstance = null;

  function openTripDetail(tripId) {
    _openTripId = tripId;
    _detailTab = 'days';
    _ensureTripDetailModal();
    renderTripDetail(tripId);
    openModal('trip-detail-modal');
  }

  function _ensureTripDetailModal() {
    if (document.getElementById('trip-detail-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'trip-detail-modal';
    modal.className = 'modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal-overlay" id="trip-detail-overlay" onclick="TripsModule.closeTripDetail()"></div>
      <div class="modal-sheet modal-sheet-fullscreen">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <h2 id="trip-detail-title"></h2>
          <button class="btn-close" onclick="TripsModule.closeTripDetail()" aria-label="Закрыть"><i data-lucide="x" class="icon icon-lg"></i></button>
        </div>
        <!-- Sub-tabs -->
        <div class="modal-subtabs">
          <button class="modal-subtab active" data-tab="days" onclick="TripsModule._switchDetailTab('days')">Дни</button>
          <button class="modal-subtab" data-tab="map" onclick="TripsModule._switchDetailTab('map')">Карта</button>
          <button class="modal-subtab" data-tab="budget" onclick="TripsModule._switchDetailTab('budget')">Бюджет</button>
        </div>
        <div class="modal-body" id="trip-detail-body"></div>
      </div>`;
    document.body.appendChild(modal);
  }

  function closeTripDetail() {
    _openTripId = null;
    closeModal('trip-detail-modal');
    if (_tripMapInstance) {
      _tripMapInstance.remove();
      _tripMapInstance = null;
    }
  }

  function renderTripDetail(tripId) {
    const trip = Storage.getTripById(tripId);
    if (!trip) return;

    const titleEl = document.getElementById('trip-detail-title');
    if (titleEl) titleEl.textContent = trip.name;

    _switchDetailTab(_detailTab, trip);
    icons();
  }

  function _switchDetailTab(tab, tripArg) {
    _detailTab = tab;
    document.querySelectorAll('.modal-subtab').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.tab === tab));

    const trip = tripArg || Storage.getTripById(_openTripId);
    if (!trip) return;

    const bodyEl = document.getElementById('trip-detail-body');
    if (!bodyEl) return;

    if (tab === 'days')   { bodyEl.innerHTML = renderDaysTab(trip); icons(); bindDaysTabEvents(trip); }
    if (tab === 'map')    { bodyEl.innerHTML = '<div id="trip-detail-map" class="trip-detail-map"></div>'; _initTripMap(trip); }
    if (tab === 'budget') { bodyEl.innerHTML = renderBudgetTab(trip); icons(); bindBudgetEvents(trip); }
  }

  // ── Days tab ──────────────────────────────────────────────────────────────────

  function renderDaysTab(trip) {
    const days  = trip.days || [];
    const isOwner = (trip.created_by === Storage.getActiveUser().id) ||
                    (trip.participants || []).some(p => p.user_id === Storage.getActiveUser().id && p.role === 'owner');

    if (days.length === 0) {
      return `<div class="empty-state">
        <p>Дней пока нет. Добавьте первый день.</p>
        <button class="btn-primary" onclick="TripsModule.addDay('${trip.id}')">+ Добавить день</button>
      </div>`;
    }

    return days.map(day => `
      <div class="trip-day-section">
        <div class="trip-day-header">
          <div class="trip-day-title">
            День ${day.day_number}${day.date ? ` · ${formatDateShort(day.date)}` : ''}
            ${day.title ? ` — ${esc(day.title)}` : ''}
          </div>
          ${day.start_metro_station
            ? `<div class="day-start-metro">🚇 Старт: ${esc(day.start_metro_station)}</div>`
            : ''}
        </div>
        <div class="trip-day-items">
          ${(day.items || []).length === 0
            ? '<div class="trip-day-empty">Мест нет</div>'
            : day.items.map(item => renderTripItem(trip, day, item)).join('')}
        </div>
        <div class="trip-day-actions">
          <button class="btn-ghost btn-sm" onclick="TripsModule.openAddItemModal('${trip.id}','${day.id}')">
            ${icon('plus', 'icon-sm')} Добавить место
          </button>
          <div class="day-map-btns">
            <button class="btn-ghost btn-sm" onclick="TripsModule._switchDetailTab('map')">🗺 Карта</button>
            ${_buildGoogleMapsUrl(trip, day) ? `<a href="${_buildGoogleMapsUrl(trip, day)}" target="_blank" rel="noopener" class="btn-ghost btn-sm">Google Maps</a>` : ''}
          </div>
        </div>
      </div>
    `).join('') + `
    <div class="trip-add-day-row">
      <button class="btn-secondary btn-sm" onclick="TripsModule.addDay('${trip.id}')">+ Добавить день</button>
      ${isOwner ? `<button class="btn-ghost btn-sm" onclick="TripsModule.openTripStatusModal('${trip.id}')">Статус: ${STATUS_LABELS[trip.status]}</button>` : ''}
      <button class="btn-ghost btn-sm" onclick="TripsModule.saveAsTemplate('${trip.id}')">Сохранить как шаблон</button>
    </div>`;
  }

  function renderTripItem(trip, day, item) {
    const place = Storage.getById(item.place_id);
    const name  = place ? (place.name || place.title || '') : (item.place_id || 'Место');
    const placeFlags = place ? (place.flags || []) : [];
    const user  = Storage.getActiveUser();
    const myVote = (item.votes || []).find(v => v.user_id === user.id);
    const voteCount = (item.votes || []).length;

    return `<div class="trip-item" data-item-id="${item.id}">
      <div class="trip-item-body">
        <div class="trip-item-header">
          <span class="participant-avatar" title="${esc(userName(item.added_by))}">${userAvatar(item.added_by)}</span>
          <div class="trip-item-info">
            <div class="trip-item-name">${esc(name)}</div>
            <div class="trip-item-meta">
              ${item.time ? `<span>${esc(item.time)}</span>` : ''}
              ${item.slot ? `<span class="slot-badge">${slotLabel(item.slot)}</span>` : ''}
              ${item.duration_minutes ? `<span>${item.duration_minutes} мин</span>` : ''}
              ${flagsHtml(placeFlags)}
            </div>
            ${item.note ? `<div class="trip-item-note">${esc(item.note)}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="trip-item-actions">
        <button class="vote-btn${myVote ? ' voted' : ''}"
          onclick="TripsModule.vote('${trip.id}','${day.id}','${item.id}')">
          ❤️ ${voteCount > 0 ? voteCount : ''}
        </button>
        <button class="btn-ghost-small" onclick="TripsModule.removeTripItem('${trip.id}','${day.id}','${item.id}')">✕</button>
      </div>
    </div>`;
  }

  function slotLabel(slot) {
    return { morning: '🌅 Утро', afternoon: '☀️ День', evening: '🌆 Вечер' }[slot] || slot;
  }

  function _buildGoogleMapsUrl(trip, day) {
    const places = Storage.getAll();
    const items  = day.items || [];
    const coords = items
      .map(i => {
        const p = places.find(pl => pl.id === i.place_id);
        if (!p) return null;
        const lat = p.coordinates ? p.coordinates.lat : (p.location && p.location.lat);
        const lng = p.coordinates ? p.coordinates.lng : (p.location && p.location.lng);
        return lat && lng ? `${lat},${lng}` : null;
      })
      .filter(Boolean);
    if (coords.length < 2) return null;
    const dest = coords[coords.length - 1];
    const waypoints = coords.slice(0, -1).join('|');
    return `https://maps.google.com/maps?saddr=${coords[0]}&daddr=${dest}&waypoints=${waypoints}`;
  }

  function bindDaysTabEvents(trip) {
    // Nothing extra needed — onclick attrs handle it
  }

  function addDay(tripId) {
    const trip = Storage.getTripById(tripId);
    if (!trip) return;
    const dayNum = (trip.days || []).length + 1;
    const newDay = {
      id: Storage.genId(),
      trip_id: tripId,
      day_number: dayNum,
      date: null,
      title: null,
      start_metro_station: null,
      start_address: null,
      items: [],
    };
    if (!trip.days) trip.days = [];
    trip.days.push(newDay);
    Storage.saveTrip(trip);
    renderTripDetail(tripId);
  }

  function vote(tripId, dayId, itemId) {
    Storage.voteTripItem(tripId, dayId, itemId);
    renderTripDetail(tripId);
  }

  function removeTripItem(tripId, dayId, itemId) {
    Storage.removeTripItem(tripId, dayId, itemId);
    renderTripDetail(tripId);
  }

  // ── Add item to trip modal ────────────────────────────────────────────────────

  let _addItemContext = null; // { tripId, dayId }

  function openAddItemModal(tripId, dayId) {
    _addItemContext = { tripId, dayId };
    _ensureAddItemModal();
    const places = Storage.getAll().filter(p =>
      p.type !== 'material' && p.category !== 'material'
    );
    const listEl = document.getElementById('trip-add-item-list');
    if (listEl) {
      listEl.innerHTML = places.length === 0
        ? '<p class="walk-empty">Нет мест для добавления</p>'
        : places.map(p => `
          <div class="trip-add-place-item" onclick="TripsModule._selectAddItem('${p.id}')">
            <div class="trip-add-place-name">${esc(p.name || p.title || '')}</div>
            <div class="trip-add-place-meta">${esc(p.type || '')} ${(p.flags||[]).map(f=>flagDefs[f]&&flagDefs[f].emoji||'').join('')}</div>
          </div>`).join('');
      icons();
    }
    openModal('trip-add-item-modal');
  }

  function _ensureAddItemModal() {
    if (document.getElementById('trip-add-item-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'trip-add-item-modal';
    modal.className = 'modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.innerHTML = `
      <div class="modal-overlay" onclick="TripsModule._closeAddItemModal()"></div>
      <div class="modal-sheet modal-sheet-small">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <h2>Добавить место в день</h2>
          <button class="btn-close" onclick="TripsModule._closeAddItemModal()"><i data-lucide="x" class="icon icon-lg"></i></button>
        </div>
        <div class="modal-body">
          <div id="trip-add-item-list" class="trip-add-item-list"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  function _closeAddItemModal() {
    closeModal('trip-add-item-modal');
  }

  function _selectAddItem(placeId) {
    if (!_addItemContext) return;
    const { tripId, dayId } = _addItemContext;
    const item = {
      id: Storage.genId(),
      place_id: placeId,
      slot: null,
      time: null,
      duration_minutes: null,
      note: null,
      order: 0,
      added_by: Storage.getActiveUser().id,
      votes: [],
    };
    Storage.addTripItem(tripId, dayId, item);
    _closeAddItemModal();
    renderTripDetail(tripId);
  }

  // ── Map tab ───────────────────────────────────────────────────────────────────

  const DAY_COLORS = ['#3388ff','#ff7800','#33a02c','#e31a1c','#6a3d9a','#b15928','#a6cee3'];

  function _initTripMap(trip) {
    if (_tripMapInstance) {
      _tripMapInstance.remove();
      _tripMapInstance = null;
    }

    const mapEl = document.getElementById('trip-detail-map');
    if (!mapEl) return;

    const m = L.map('trip-detail-map').setView([55.75, 37.62], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(m);
    _tripMapInstance = m;

    const places = Storage.getAll();
    const bounds = [];

    (trip.days || []).forEach((day, di) => {
      const color = DAY_COLORS[di % DAY_COLORS.length];
      (day.items || []).forEach(item => {
        const p = places.find(pl => pl.id === item.place_id);
        if (!p) return;
        const lat = p.coordinates ? p.coordinates.lat : (p.location && p.location.lat);
        const lng = p.coordinates ? p.coordinates.lng : (p.location && p.location.lng);
        if (!lat || !lng) return;
        const markerHtml = `<div style="background:${color};width:20px;height:20px;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:bold">${day.day_number}</div>`;
        L.marker([lat, lng], {
          icon: L.divIcon({ html: markerHtml, className: '', iconSize: [20, 20], iconAnchor: [10, 10] }),
        }).addTo(m).bindPopup(`<strong>${p.name || p.title || ''}</strong><br>День ${day.day_number}`);
        bounds.push([lat, lng]);
      });
    });

    if (bounds.length > 0) m.fitBounds(bounds, { padding: [30, 30] });
    setTimeout(() => m.invalidateSize(), 100);
  }

  // ── Budget tab ────────────────────────────────────────────────────────────────

  const PRICE_RANGE_RUB = { budget: 300, mid: 700, expensive: 1500 };

  function renderBudgetTab(trip) {
    const accs = trip.accommodations || [];
    const participants = (trip.participants || []).length || 1;
    const days = (trip.days || []).length || 1;

    // Accommodation total
    let accTotal = 0;
    const accHtml = accs.length === 0
      ? '<p class="budget-empty">Жильё не добавлено</p>'
      : accs.map(a => {
          const nights = _nightsBetween(a.date_checkin, a.date_checkout);
          const total  = (a.price_per_night || 0) * nights;
          accTotal += total;
          return `<div class="budget-acc-item">
            <div class="budget-acc-name">${esc(a.name)}</div>
            <div class="budget-acc-meta">${formatDate(a.date_checkin)} – ${formatDate(a.date_checkout)} · ${nights} ноч. · ${a.price_per_night || 0} ${esc(a.currency || 'RUB')}/ночь</div>
            <div class="budget-acc-total">Итого: ${total} ${esc(a.currency || 'RUB')}</div>
            <button class="btn-danger btn-sm" onclick="TripsModule.removeAcc('${trip.id}','${a.id}')">Удалить</button>
          </div>`;
        }).join('');

    // Food estimate
    const places = Storage.getAll();
    let foodEstimate = 0;
    (trip.days || []).forEach(day => {
      (day.items || []).forEach(item => {
        const p = places.find(pl => pl.id === item.place_id);
        if (p && p.price_range && PRICE_RANGE_RUB[p.price_range]) {
          foodEstimate += PRICE_RANGE_RUB[p.price_range];
        }
      });
    });
    foodEstimate *= participants;

    const accPerPerson = participants > 0 ? Math.round(accTotal / participants) : accTotal;
    const foodPerPerson = participants > 0 ? Math.round(foodEstimate / participants) : foodEstimate;
    const totalPerPerson = accPerPerson + foodPerPerson;

    return `
      <div class="budget-section">
        <div class="budget-section-title">Жильё</div>
        ${accHtml}
        <button class="btn-secondary btn-sm" onclick="TripsModule.openAddAccModal('${trip.id}')">+ Добавить жильё</button>
      </div>
      <div class="budget-section">
        <div class="budget-section-title">Оценка расходов на ${participants} чел.</div>
        <div class="budget-row"><span>Жильё</span><span>${accPerPerson} ₽/чел</span></div>
        <div class="budget-row"><span>Еда (оценка)</span><span>${foodPerPerson} ₽/чел</span></div>
        <div class="budget-row budget-total"><span>Итого</span><span>~${totalPerPerson} ₽/чел</span></div>
      </div>`;
  }

  function _nightsBetween(checkin, checkout) {
    if (!checkin || !checkout) return 0;
    const d1 = new Date(checkin), d2 = new Date(checkout);
    return Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
  }

  function bindBudgetEvents() {}

  function openAddAccModal(tripId) {
    _ensureAddAccModal(tripId);
    openModal('trip-add-acc-modal');
  }

  function _ensureAddAccModal(tripId) {
    let modal = document.getElementById('trip-add-acc-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'trip-add-acc-modal';
      modal.className = 'modal hidden';
      modal.innerHTML = `
        <div class="modal-overlay" onclick="TripsModule._closeAccModal()"></div>
        <div class="modal-sheet modal-sheet-small">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <h2>Добавить жильё</h2>
            <button class="btn-close" onclick="TripsModule._closeAccModal()"><i data-lucide="x" class="icon icon-lg"></i></button>
          </div>
          <div class="modal-body">
            <form id="acc-form" onsubmit="TripsModule._saveAcc(event)">
              <input type="hidden" name="trip_id" value="${tripId}">
              <div class="form-group"><input class="form-input" name="name" placeholder="Название *" required></div>
              <div class="form-row">
                <div class="form-group flex-1"><label class="form-label">Заезд</label><input class="form-input" name="date_checkin" type="date" required></div>
                <div class="form-group flex-1"><label class="form-label">Выезд</label><input class="form-input" name="date_checkout" type="date" required></div>
              </div>
              <div class="form-row">
                <div class="form-group flex-1"><input class="form-input" name="price_per_night" type="number" min="0" placeholder="Цена/ночь"></div>
                <div class="form-group" style="width:80px"><input class="form-input" name="currency" placeholder="RUB" maxlength="5" value="RUB"></div>
              </div>
              <div class="form-group"><input class="form-input" name="booking_url" type="url" placeholder="Ссылка на бронь"></div>
              <div class="form-group"><textarea class="form-input" name="note" rows="2" placeholder="Примечание"></textarea></div>
              <div class="form-actions"><button type="submit" class="btn-primary btn-full">Сохранить</button></div>
            </form>
          </div>
        </div>`;
      document.body.appendChild(modal);
    } else {
      // Update trip_id in form
      const ti = modal.querySelector('input[name="trip_id"]');
      if (ti) ti.value = tripId;
      const form = modal.querySelector('#acc-form');
      if (form) form.reset();
      const ti2 = modal.querySelector('input[name="trip_id"]');
      if (ti2) ti2.value = tripId;
    }
  }

  function _closeAccModal() { closeModal('trip-add-acc-modal'); }

  function _saveAcc(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.name.trim()) return;
    const acc = {
      id:              Storage.genId(),
      name:            data.name.trim(),
      date_checkin:    data.date_checkin || null,
      date_checkout:   data.date_checkout || null,
      price_per_night: data.price_per_night ? parseFloat(data.price_per_night) : null,
      currency:        data.currency || 'RUB',
      booking_url:     data.booking_url || null,
      note:            data.note || null,
    };
    Storage.addAccommodation(data.trip_id, acc);
    _closeAccModal();
    renderTripDetail(data.trip_id);
  }

  function removeAcc(tripId, accId) {
    Storage.removeAccommodation(tripId, accId);
    renderTripDetail(tripId);
  }

  // ── Create / edit trip ────────────────────────────────────────────────────────

  function openTripEditor(tripId) {
    _ensureTripEditorModal();
    const trip = tripId ? Storage.getTripById(tripId) : null;
    const form = document.getElementById('trip-editor-form');
    if (!form) return;
    form.reset();
    document.querySelector('#trip-editor-form input[name="id"]').value = tripId || '';
    document.querySelector('#trip-editor-form input[name="name"]').value = trip ? trip.name : '';
    document.querySelector('#trip-editor-form input[name="date_start"]').value =
      trip && trip.date_start ? new Date(trip.date_start).toISOString().slice(0, 10) : '';
    document.querySelector('#trip-editor-form input[name="date_end"]').value =
      trip && trip.date_end ? new Date(trip.date_end).toISOString().slice(0, 10) : '';
    document.querySelector('#trip-editor-form select[name="status"]').value = trip ? trip.status : 'upcoming';
    openModal('trip-editor-modal');
  }

  function _ensureTripEditorModal() {
    if (document.getElementById('trip-editor-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'trip-editor-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-overlay" onclick="TripsModule._closeTripEditor()"></div>
      <div class="modal-sheet modal-sheet-small">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <h2>Поездка</h2>
          <button class="btn-close" onclick="TripsModule._closeTripEditor()"><i data-lucide="x" class="icon icon-lg"></i></button>
        </div>
        <div class="modal-body">
          <form id="trip-editor-form" onsubmit="TripsModule._saveTripForm(event)">
            <input type="hidden" name="id">
            <div class="form-group"><input class="form-input" name="name" placeholder="Название поездки *" required></div>
            <div class="form-row">
              <div class="form-group flex-1"><label class="form-label">Начало</label><input class="form-input" name="date_start" type="date"></div>
              <div class="form-group flex-1"><label class="form-label">Конец</label><input class="form-input" name="date_end" type="date"></div>
            </div>
            <div class="form-group">
              <label class="form-label">Статус</label>
              <select class="form-input form-select" name="status">
                <option value="draft">Черновик</option>
                <option value="upcoming" selected>Предстоящая</option>
                <option value="active">Активная</option>
                <option value="done">Завершена</option>
              </select>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn-primary btn-full">Сохранить</button>
            </div>
          </form>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  function _closeTripEditor() { closeModal('trip-editor-modal'); }

  function _saveTripForm(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.name.trim()) return;

    const existing  = data.id ? Storage.getTripById(data.id) : null;
    const user      = Storage.getActiveUser();
    const dateStart = data.date_start ? new Date(data.date_start).getTime() : null;
    const dateEnd   = data.date_end   ? new Date(data.date_end).getTime()   : null;

    const trip = {
      id:                 data.id || Storage.genId(),
      name:               data.name.trim(),
      source_template_id: existing ? existing.source_template_id : null,
      status:             data.status || 'upcoming',
      date_start:         dateStart,
      date_end:           dateEnd,
      participants:       existing
        ? existing.participants
        : [{ user_id: user.id, role: 'owner', joined_at: Date.now() }],
      days:           existing ? existing.days : [],
      accommodations: existing ? existing.accommodations : [],
      budget_summary: null,
      created_by:     existing ? existing.created_by : user.id,
      created_at:     existing ? existing.created_at  : Date.now(),
    };

    Storage.saveTrip(trip);
    _closeTripEditor();
    renderTripsList();
  }

  function deleteTrip(id) {
    if (!confirm('Удалить поездку?')) return;
    Storage.removeTrip(id);
    renderTripsList();
  }

  function openTripStatusModal(tripId) {
    openTripEditor(tripId);
  }

  // ── Save trip as template ─────────────────────────────────────────────────────

  function saveAsTemplate(tripId) {
    const trip = Storage.getTripById(tripId);
    if (!trip) return;
    const name = prompt('Название шаблона:', trip.name + ' (шаблон)');
    if (!name) return;

    const template = {
      id:                 Storage.genId(),
      name:               name.trim(),
      type:               trip.days.length > 1 ? 'multiday' : 'day_trip',
      days:               trip.days.map((d, i) => ({
        day_number: d.day_number || (i + 1),
        title:      d.title || null,
        items:      (d.items || []).map(item => ({
          id:               Storage.genId(),
          place_id:         item.place_id,
          slot:             item.slot || null,
          duration_minutes: item.duration_minutes || null,
          note:             item.note || null,
          order:            item.order || 0,
        })),
      })),
      source_template_id: tripId,
      created_by:         Storage.getActiveUser().id,
      created_at:         Date.now(),
      used_count:         0,
    };

    Storage.saveTemplate(template);
    showToast('Шаблон сохранён!');
    if (typeof TemplatesModule !== 'undefined' && App.currentView === 'templates') {
      TemplatesModule.renderTemplatesList();
    }
  }

  // ── Add place to trip (quick-add from place detail) ───────────────────────────

  function addPlaceToTrip(placeId) {
    const trips = Storage.getAllTrips().filter(t => t.status !== 'done');
    if (trips.length === 0) {
      if (confirm('Поездок нет. Создать новую?')) openTripEditor();
      return;
    }

    // Simple picker: show trip list in a mini modal
    _ensurePlaceToTripModal();
    const listEl = document.getElementById('place-to-trip-list');
    if (listEl) {
      listEl.innerHTML = trips.map(t =>
        `<div class="trip-pick-item" onclick="TripsModule._pickTripForPlace('${t.id}','${placeId}')">
          <div class="trip-pick-name">${esc(t.name)}</div>
          <div class="trip-pick-meta">${dateRangeStr(t)} · ${tripDaysCount(t)} дн.</div>
        </div>`
      ).join('');
    }
    openModal('place-to-trip-modal');
  }

  function _ensurePlaceToTripModal() {
    if (document.getElementById('place-to-trip-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'place-to-trip-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-overlay" onclick="TripsModule._closePlaceToTripModal()"></div>
      <div class="modal-sheet modal-sheet-small">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <h2>Добавить в поездку</h2>
          <button class="btn-close" onclick="TripsModule._closePlaceToTripModal()"><i data-lucide="x" class="icon icon-lg"></i></button>
        </div>
        <div class="modal-body">
          <div id="place-to-trip-list" class="trip-add-item-list"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  function _closePlaceToTripModal() { closeModal('place-to-trip-modal'); }

  function _pickTripForPlace(tripId, placeId) {
    const trip = Storage.getTripById(tripId);
    if (!trip || !trip.days || trip.days.length === 0) {
      // No days yet — create one
      const day = {
        id: Storage.genId(), trip_id: tripId,
        day_number: 1, date: null, title: null,
        start_metro_station: null, start_address: null, items: [],
      };
      if (!trip.days) trip.days = [];
      trip.days.push(day);
      Storage.saveTrip(trip);
    }
    // Add to first day
    const dayId = trip.days[0].id;
    Storage.addTripItem(tripId, dayId, {
      place_id: placeId, slot: null, time: null,
      duration_minutes: null, note: null, order: 0,
    });
    _closePlaceToTripModal();
    showToast('Место добавлено в поездку!');
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return {
    renderTripsList,
    openTripDetail,
    closeTripDetail,
    openTripEditor,
    deleteTrip,
    addDay,
    vote,
    removeTripItem,
    openAddItemModal,
    openAddAccModal,
    removeAcc,
    saveAsTemplate,
    addPlaceToTrip,
    setFilter,
    openTripStatusModal,
    // Internal (called from onclick attrs)
    _switchDetailTab,
    _closeAddItemModal,
    _selectAddItem,
    _closeAccModal,
    _saveAcc,
    _closeTripEditor,
    _saveTripForm,
    _closePlaceToTripModal,
    _pickTripForPlace,
  };
})();
