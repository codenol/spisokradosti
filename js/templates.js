'use strict';

const TemplatesModule = (() => {

  // ── Local helpers ────────────────────────────────────────────────────────────

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, cls = '') {
    return `<i data-lucide="${escHtml(name)}" class="icon${cls ? ' ' + escHtml(cls) : ''}"></i>`;
  }

  function icons() {
    if (window.lucide) lucide.createIcons();
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  // ── Template types ────────────────────────────────────────────────────────────

  const TEMPLATE_TYPES = {
    walk:     { label: 'Прогулка',     icon: 'footprints' },
    day_trip: { label: 'День',         icon: 'sun'        },
    multiday: { label: 'Многодневный', icon: 'calendar'   },
  };

  const SLOTS = {
    morning:   'Утро',
    afternoon: 'День',
    evening:   'Вечер',
  };

  // ── Modal injection ───────────────────────────────────────────────────────────

  function _ensureModals() {
    if (!document.getElementById('template-editor-modal')) {
      const editorEl = document.createElement('div');
      editorEl.id = 'template-editor-modal';
      editorEl.className = 'modal hidden';
      editorEl.innerHTML = `
        <div class="modal-overlay" id="template-editor-modal-overlay"></div>
        <div class="modal-sheet">
          <div class="modal-header">
            <span class="modal-title" id="template-editor-title">Шаблон</span>
            <button class="btn-icon" id="btn-template-editor-close" aria-label="Закрыть">${icon('x')}</button>
          </div>
          <div class="modal-body" id="template-editor-body"></div>
        </div>`;
      document.body.appendChild(editorEl);

      document.getElementById('btn-template-editor-close').addEventListener('click', () => closeModal('template-editor-modal'));
      document.getElementById('template-editor-modal-overlay').addEventListener('click', () => closeModal('template-editor-modal'));
    }

    if (!document.getElementById('template-launch-modal')) {
      const launchEl = document.createElement('div');
      launchEl.id = 'template-launch-modal';
      launchEl.className = 'modal hidden';
      launchEl.innerHTML = `
        <div class="modal-overlay" id="template-launch-modal-overlay"></div>
        <div class="modal-sheet">
          <div class="modal-header">
            <span class="modal-title" id="template-launch-title">Запустить шаблон</span>
            <button class="btn-icon" id="btn-template-launch-close" aria-label="Закрыть">${icon('x')}</button>
          </div>
          <div class="modal-body" id="template-launch-body"></div>
        </div>`;
      document.body.appendChild(launchEl);

      document.getElementById('btn-template-launch-close').addEventListener('click', () => closeModal('template-launch-modal'));
      document.getElementById('template-launch-modal-overlay').addEventListener('click', () => closeModal('template-launch-modal'));
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────

  function _countPlaces(template) {
    if (!Array.isArray(template.days)) return 0;
    return template.days.reduce((sum, d) => sum + (Array.isArray(d.items) ? d.items.length : 0), 0);
  }

  function _typeLabel(type) {
    return TEMPLATE_TYPES[type] ? TEMPLATE_TYPES[type].label : escHtml(type);
  }

  function _typeIcon(type) {
    return TEMPLATE_TYPES[type] ? TEMPLATE_TYPES[type].icon : 'file';
  }

  function _pluralRaz(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} раз`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} раза`;
    return `${n} раз`;
  }

  function _pluralMest(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} место`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} места`;
    return `${n} мест`;
  }

  function _addDays(isoDate, days) {
    const d = new Date(isoDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ── renderTemplatesList ────────────────────────────────────────────────────────

  function renderTemplatesList() {
    const container = document.getElementById('view-templates');
    if (!container) return;

    const templates = Storage.getAllTemplates();

    if (templates.length === 0) {
      container.innerHTML = `
        <div class="templates-list">
          <div class="empty-state">
            <div class="empty-state-icon">${icon('file-plus', 'icon-lg')}</div>
            <div class="empty-state-title">Нет шаблонов</div>
            <div class="empty-state-desc">Создайте шаблон, чтобы быстро планировать похожие поездки</div>
            <button class="btn-primary" onclick="TemplatesModule.openTemplateEditor()">
              ${icon('plus', 'icon-sm')} Создать шаблон
            </button>
          </div>
        </div>`;
      icons();
      return;
    }

    const cardsHtml = templates.map(t => {
      const placeCount = _countPlaces(t);
      const usedCount  = t.used_count || 0;
      const typeInfo   = TEMPLATE_TYPES[t.type] || { label: escHtml(t.type || ''), icon: 'file' };
      const dayCount   = Array.isArray(t.days) ? t.days.length : 0;

      return `<div class="template-card" data-id="${escHtml(t.id)}">
        <div class="template-card-body">
          <div class="template-card-title">${icon(_typeIcon(t.type), 'icon-sm')} ${escHtml(t.name)}</div>
          <div class="template-card-meta">
            <span class="badge badge-type">${escHtml(typeInfo.label)}</span>
            ${dayCount > 0 ? `<span>${dayCount} дн.</span>` : ''}
            ${placeCount > 0 ? `<span>${_pluralMest(placeCount)}</span>` : ''}
            ${usedCount > 0 ? `<span>${icon('repeat', 'icon-xs')} Использован ${_pluralRaz(usedCount)}</span>` : ''}
          </div>
        </div>
        <div class="template-card-actions">
          <button class="btn-primary btn-sm" onclick="TemplatesModule.launchTemplate('${escHtml(t.id)}')">
            ${icon('play', 'icon-sm')} Запустить
          </button>
          <button class="btn-ghost btn-sm" onclick="TemplatesModule.openTemplateEditor('${escHtml(t.id)}')">
            ${icon('pencil', 'icon-sm')} Изменить
          </button>
          <button class="btn-ghost btn-sm btn-danger" onclick="TemplatesModule.deleteTemplate('${escHtml(t.id)}')">
            ${icon('trash-2', 'icon-sm')} Удалить
          </button>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="templates-toolbar">
        <button class="btn-primary" onclick="TemplatesModule.openTemplateEditor()">
          ${icon('plus', 'icon-sm')} Новый шаблон
        </button>
      </div>
      <div class="templates-list">${cardsHtml}</div>`;

    icons();
  }

  // ── openTemplateEditor ────────────────────────────────────────────────────────

  function openTemplateEditor(templateId = null) {
    _ensureModals();

    const template = templateId ? Storage.getTemplateById(templateId) : null;
    const isEdit   = !!template;

    document.getElementById('template-editor-title').textContent =
      isEdit ? 'Изменить шаблон' : 'Новый шаблон';

    // Build places list for item pickers (only places with coordinates)
    const allPlaces = Storage.getAll().filter(p => p.coordinates && p.coordinates.lat && p.coordinates.lng);

    const days = template && Array.isArray(template.days) ? template.days : [_newDay(1)];

    const body = document.getElementById('template-editor-body');
    body.innerHTML = _buildEditorForm(template, days, allPlaces);
    icons();

    openModal('template-editor-modal');

    // Attach dynamic event listeners for the editor
    _bindEditorEvents(body, days, allPlaces, template);
  }

  function _newDay(number) {
    return { id: _tempId(), day_number: number, title: '', items: [] };
  }

  function _newItem(order) {
    return { id: _tempId(), place_id: '', slot: 'morning', note: '', order, duration_minutes: null };
  }

  function _tempId() {
    return '__tmp_' + Math.random().toString(36).slice(2, 9);
  }

  function _buildEditorForm(template, days, allPlaces) {
    const name = template ? escHtml(template.name) : '';
    const type = template ? (template.type || 'walk') : 'walk';

    const typeOptions = Object.entries(TEMPLATE_TYPES).map(([k, v]) =>
      `<option value="${escHtml(k)}"${k === type ? ' selected' : ''}>${escHtml(v.label)}</option>`
    ).join('');

    const daysHtml = days.map((day, di) => _buildDayBlock(day, di, allPlaces)).join('');

    return `
      <form id="template-editor-form" autocomplete="off">
        <div class="form-group">
          <label class="form-label" for="tpl-name">Название шаблона</label>
          <input class="form-input" id="tpl-name" name="name" type="text" maxlength="120"
            placeholder="Например: Выходной в центре" value="${name}" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="tpl-type">Тип</label>
          <select class="form-select" id="tpl-type" name="type">${typeOptions}</select>
        </div>
        <div class="template-days-list" id="tpl-days-list">
          ${daysHtml}
        </div>
        <button type="button" class="btn-ghost btn-sm" id="tpl-add-day">
          ${icon('plus', 'icon-sm')} Добавить день
        </button>
        <div class="form-actions">
          <button type="button" class="btn-ghost" onclick="TemplatesModule._cancelEditor()">Отмена</button>
          <button type="submit" class="btn-primary">
            ${icon('save', 'icon-sm')} Сохранить
          </button>
        </div>
      </form>`;
  }

  function _buildDayBlock(day, dayIndex, allPlaces) {
    const dayTitle = escHtml(day.title || '');
    const items    = Array.isArray(day.items) ? day.items : [];
    const itemsHtml = items.map((item, ii) => _buildItemRow(item, dayIndex, ii, allPlaces)).join('');

    return `<div class="template-day-block" data-day-index="${dayIndex}">
      <div class="template-day-header">
        <span class="template-day-label">${icon('calendar', 'icon-sm')} День ${dayIndex + 1}</span>
        <button type="button" class="btn-icon btn-danger-sm tpl-remove-day" data-day-index="${dayIndex}"
          title="Удалить день">${icon('trash-2', 'icon-xs')}</button>
      </div>
      <div class="form-group">
        <input class="form-input form-input-sm" type="text" maxlength="100"
          placeholder="Название дня (необязательно)"
          data-day-index="${dayIndex}" data-field="title"
          class="tpl-day-title" value="${dayTitle}">
      </div>
      <div class="template-items-list" id="tpl-items-day-${dayIndex}">
        ${itemsHtml}
      </div>
      <button type="button" class="btn-ghost btn-sm tpl-add-item" data-day-index="${dayIndex}">
        ${icon('map-pin', 'icon-sm')} Добавить место
      </button>
    </div>`;
  }

  function _buildItemRow(item, dayIndex, itemIndex, allPlaces) {
    const slotOptions = Object.entries(SLOTS).map(([k, v]) =>
      `<option value="${escHtml(k)}"${item.slot === k ? ' selected' : ''}>${escHtml(v)}</option>`
    ).join('');

    const placeOptions = '<option value="">— Выбрать место —</option>' +
      allPlaces.map(p =>
        `<option value="${escHtml(p.id)}"${item.place_id === p.id ? ' selected' : ''}>${escHtml(p.name || p.title || p.id)}</option>`
      ).join('');

    const note = escHtml(item.note || '');
    const dur  = item.duration_minutes != null ? String(item.duration_minutes) : '';

    return `<div class="template-item-row" data-day-index="${dayIndex}" data-item-index="${itemIndex}">
      <div class="template-item-controls">
        <button type="button" class="btn-icon btn-xs tpl-item-up" data-day-index="${dayIndex}" data-item-index="${itemIndex}"
          title="Переместить вверх">${icon('chevron-up', 'icon-xs')}</button>
        <button type="button" class="btn-icon btn-xs tpl-item-down" data-day-index="${dayIndex}" data-item-index="${itemIndex}"
          title="Переместить вниз">${icon('chevron-down', 'icon-xs')}</button>
      </div>
      <div class="template-item-fields">
        <select class="form-select form-select-sm tpl-item-place"
          data-day-index="${dayIndex}" data-item-index="${itemIndex}">
          ${placeOptions}
        </select>
        <select class="form-select form-select-sm tpl-item-slot"
          data-day-index="${dayIndex}" data-item-index="${itemIndex}">
          ${slotOptions}
        </select>
        <input class="form-input form-input-sm tpl-item-duration" type="number" min="5" max="480" step="5"
          placeholder="Мин." value="${dur}"
          data-day-index="${dayIndex}" data-item-index="${itemIndex}">
        <input class="form-input form-input-sm tpl-item-note" type="text" maxlength="200"
          placeholder="Заметка" value="${note}"
          data-day-index="${dayIndex}" data-item-index="${itemIndex}">
      </div>
      <button type="button" class="btn-icon btn-danger-sm tpl-remove-item"
        data-day-index="${dayIndex}" data-item-index="${itemIndex}"
        title="Удалить">${icon('x', 'icon-xs')}</button>
    </div>`;
  }

  function _bindEditorEvents(body, days, allPlaces, existingTemplate) {
    // We store the editor state mutably in a closure array
    // (re-render days on structural changes)
    let _days = days.map(d => ({
      ...d,
      items: Array.isArray(d.items) ? d.items.map(i => ({ ...i })) : [],
    }));

    function _rerender() {
      const daysList = body.querySelector('#tpl-days-list');
      if (!daysList) return;
      daysList.innerHTML = _days.map((day, di) => _buildDayBlock(day, di, allPlaces)).join('');
      icons();
      _bindInnerEvents();
    }

    function _bindInnerEvents() {
      // Remove day buttons
      body.querySelectorAll('.tpl-remove-day').forEach(btn => {
        btn.addEventListener('click', () => {
          const di = parseInt(btn.dataset.dayIndex, 10);
          if (_days.length <= 1) { alert('Шаблон должен содержать хотя бы один день.'); return; }
          _days.splice(di, 1);
          _days.forEach((d, i) => { d.day_number = i + 1; });
          _rerender();
        });
      });

      // Day title inputs
      body.querySelectorAll('[data-field="title"]').forEach(input => {
        input.addEventListener('input', () => {
          const di = parseInt(input.dataset.dayIndex, 10);
          if (_days[di]) _days[di].title = input.value;
        });
      });

      // Add item buttons
      body.querySelectorAll('.tpl-add-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const di = parseInt(btn.dataset.dayIndex, 10);
          if (!_days[di]) return;
          _days[di].items.push(_newItem(_days[di].items.length));
          _rerender();
        });
      });

      // Remove item buttons
      body.querySelectorAll('.tpl-remove-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const di = parseInt(btn.dataset.dayIndex, 10);
          const ii = parseInt(btn.dataset.itemIndex, 10);
          if (!_days[di]) return;
          _days[di].items.splice(ii, 1);
          _days[di].items.forEach((it, idx) => { it.order = idx; });
          _rerender();
        });
      });

      // Move item up
      body.querySelectorAll('.tpl-item-up').forEach(btn => {
        btn.addEventListener('click', () => {
          const di = parseInt(btn.dataset.dayIndex, 10);
          const ii = parseInt(btn.dataset.itemIndex, 10);
          if (!_days[di] || ii === 0) return;
          const items = _days[di].items;
          [items[ii - 1], items[ii]] = [items[ii], items[ii - 1]];
          items.forEach((it, idx) => { it.order = idx; });
          _rerender();
        });
      });

      // Move item down
      body.querySelectorAll('.tpl-item-down').forEach(btn => {
        btn.addEventListener('click', () => {
          const di = parseInt(btn.dataset.dayIndex, 10);
          const ii = parseInt(btn.dataset.itemIndex, 10);
          if (!_days[di]) return;
          const items = _days[di].items;
          if (ii >= items.length - 1) return;
          [items[ii], items[ii + 1]] = [items[ii + 1], items[ii]];
          items.forEach((it, idx) => { it.order = idx; });
          _rerender();
        });
      });

      // Item place selects
      body.querySelectorAll('.tpl-item-place').forEach(sel => {
        sel.addEventListener('change', () => {
          const di = parseInt(sel.dataset.dayIndex, 10);
          const ii = parseInt(sel.dataset.itemIndex, 10);
          if (_days[di] && _days[di].items[ii]) _days[di].items[ii].place_id = sel.value;
        });
      });

      // Item slot selects
      body.querySelectorAll('.tpl-item-slot').forEach(sel => {
        sel.addEventListener('change', () => {
          const di = parseInt(sel.dataset.dayIndex, 10);
          const ii = parseInt(sel.dataset.itemIndex, 10);
          if (_days[di] && _days[di].items[ii]) _days[di].items[ii].slot = sel.value;
        });
      });

      // Item duration inputs
      body.querySelectorAll('.tpl-item-duration').forEach(input => {
        input.addEventListener('input', () => {
          const di = parseInt(input.dataset.dayIndex, 10);
          const ii = parseInt(input.dataset.itemIndex, 10);
          if (_days[di] && _days[di].items[ii]) {
            const v = parseInt(input.value, 10);
            _days[di].items[ii].duration_minutes = isNaN(v) ? null : v;
          }
        });
      });

      // Item note inputs
      body.querySelectorAll('.tpl-item-note').forEach(input => {
        input.addEventListener('input', () => {
          const di = parseInt(input.dataset.dayIndex, 10);
          const ii = parseInt(input.dataset.itemIndex, 10);
          if (_days[di] && _days[di].items[ii]) _days[di].items[ii].note = input.value;
        });
      });
    }

    _bindInnerEvents();

    // Add day button
    const addDayBtn = body.querySelector('#tpl-add-day');
    if (addDayBtn) {
      addDayBtn.addEventListener('click', () => {
        _days.push(_newDay(_days.length + 1));
        _rerender();
      });
    }

    // Form submit
    const form = body.querySelector('#template-editor-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = form.querySelector('#tpl-name');
        const typeInput = form.querySelector('#tpl-type');

        const name = nameInput ? nameInput.value.trim() : '';
        const type = typeInput ? typeInput.value : 'walk';

        if (!name) {
          nameInput && nameInput.focus();
          return;
        }

        // Collect current field values directly from DOM to catch any
        // inputs that weren't tracked via events (e.g. fast tabbing)
        body.querySelectorAll('[data-field="title"]').forEach(inp => {
          const di = parseInt(inp.dataset.dayIndex, 10);
          if (_days[di]) _days[di].title = inp.value;
        });
        body.querySelectorAll('.tpl-item-place').forEach(sel => {
          const di = parseInt(sel.dataset.dayIndex, 10);
          const ii = parseInt(sel.dataset.itemIndex, 10);
          if (_days[di] && _days[di].items[ii]) _days[di].items[ii].place_id = sel.value;
        });
        body.querySelectorAll('.tpl-item-slot').forEach(sel => {
          const di = parseInt(sel.dataset.dayIndex, 10);
          const ii = parseInt(sel.dataset.itemIndex, 10);
          if (_days[di] && _days[di].items[ii]) _days[di].items[ii].slot = sel.value;
        });
        body.querySelectorAll('.tpl-item-duration').forEach(inp => {
          const di = parseInt(inp.dataset.dayIndex, 10);
          const ii = parseInt(inp.dataset.itemIndex, 10);
          if (_days[di] && _days[di].items[ii]) {
            const v = parseInt(inp.value, 10);
            _days[di].items[ii].duration_minutes = isNaN(v) ? null : v;
          }
        });
        body.querySelectorAll('.tpl-item-note').forEach(inp => {
          const di = parseInt(inp.dataset.dayIndex, 10);
          const ii = parseInt(inp.dataset.itemIndex, 10);
          if (_days[di] && _days[di].items[ii]) _days[di].items[ii].note = inp.value;
        });

        const now = Date.now();
        const template = {
          id:         existingTemplate ? existingTemplate.id : Storage.genId(),
          name,
          type,
          used_count: existingTemplate ? (existingTemplate.used_count || 0) : 0,
          created_at: existingTemplate ? existingTemplate.created_at : now,
          updated_at: now,
          days: _days.map((d, di) => ({
            id:         d.id && !d.id.startsWith('__tmp_') ? d.id : Storage.genId(),
            day_number: di + 1,
            title:      d.title || null,
            items: (d.items || []).map((it, ii) => ({
              id:               it.id && !it.id.startsWith('__tmp_') ? it.id : Storage.genId(),
              place_id:         it.place_id || null,
              slot:             it.slot || null,
              note:             it.note || null,
              order:            ii,
              duration_minutes: it.duration_minutes || null,
            })),
          })),
        };

        Storage.saveTemplate(template);
        closeModal('template-editor-modal');
        renderTemplatesList();
      });
    }
  }

  // ── Public cancel helper (called from inline HTML) ────────────────────────────

  function _cancelEditor() {
    closeModal('template-editor-modal');
  }

  // ── saveTemplate (public, exposed for completeness) ───────────────────────────

  function saveTemplate() {
    // The actual saving is triggered by the form submit in the editor.
    // This public method is a no-op shim — callers should use openTemplateEditor().
  }

  // ── deleteTemplate ────────────────────────────────────────────────────────────

  function deleteTemplate(id) {
    const template = Storage.getTemplateById(id);
    if (!template) return;

    if (!confirm(`Удалить шаблон «${template.name}»? Это действие нельзя отменить.`)) return;

    Storage.removeTemplate(id);
    renderTemplatesList();
  }

  // ── launchTemplate ────────────────────────────────────────────────────────────

  function launchTemplate(id) {
    _ensureModals();

    const template = Storage.getTemplateById(id);
    if (!template) return;

    // Find any items whose places have 'closed' flag
    const allPlaces  = Storage.getAll();
    const placeMap   = {};
    allPlaces.forEach(p => { placeMap[p.id] = p; });

    const closedNames = [];
    (template.days || []).forEach(day => {
      (day.items || []).forEach(item => {
        const place = item.place_id ? placeMap[item.place_id] : null;
        if (place && Array.isArray(place.flags) && place.flags.includes('closed')) {
          closedNames.push(place.name || place.title || item.place_id);
        }
      });
    });

    const warningHtml = closedNames.length > 0
      ? `<div class="launch-warning">
          ${icon('triangle-alert', 'icon-sm')} <strong>Внимание:</strong> следующие места помечены как закрытые:
          <ul>${closedNames.map(n => `<li>${escHtml(n)}</li>`).join('')}</ul>
        </div>`
      : '';

    const dayCount = Array.isArray(template.days) ? template.days.length : 1;

    document.getElementById('template-launch-title').textContent = `Запустить: ${template.name}`;

    const body = document.getElementById('template-launch-body');
    body.innerHTML = `
      ${warningHtml}
      <div class="form-group">
        <label class="form-label" for="launch-trip-name">Название поездки</label>
        <input class="form-input" id="launch-trip-name" type="text" maxlength="120"
          placeholder="${escHtml(template.name)}" value="${escHtml(template.name)}">
      </div>
      <div class="form-group">
        <label class="form-label" for="launch-start-date">Дата начала <span class="form-hint">(необязательно)</span></label>
        <input class="form-input" id="launch-start-date" type="date">
      </div>
      ${dayCount > 1
        ? `<p class="form-hint">${icon('calendar', 'icon-xs')} Шаблон на ${dayCount} дн. — даты будут проставлены автоматически.</p>`
        : ''}
      <div class="form-actions">
        <button type="button" class="btn-ghost" onclick="TemplatesModule._cancelLaunch()">Отмена</button>
        <button type="button" class="btn-primary" id="btn-launch-confirm">
          ${icon('play', 'icon-sm')} Создать поездку
        </button>
      </div>`;

    icons();
    openModal('template-launch-modal');

    document.getElementById('btn-launch-confirm').addEventListener('click', () => {
      const nameInput = document.getElementById('launch-trip-name');
      const dateInput = document.getElementById('launch-start-date');
      const tripName  = nameInput ? nameInput.value.trim() : template.name;
      const startDate = dateInput ? dateInput.value : '';

      if (!tripName) {
        nameInput && nameInput.focus();
        return;
      }

      const trip = createTripFromTemplate(template, tripName || template.name, startDate || null);
      Storage.saveTrip(trip);

      // Increment used_count
      const updated = { ...template, used_count: (template.used_count || 0) + 1 };
      Storage.saveTemplate(updated);

      closeModal('template-launch-modal');

      // Navigate to trips view if App exposes switchView
      if (window.App && typeof App.switchView === 'function') {
        App.switchView('trips');
      }
    });
  }

  function _cancelLaunch() {
    closeModal('template-launch-modal');
  }

  // ── createTripFromTemplate ────────────────────────────────────────────────────

  function createTripFromTemplate(template, tripName, startDate) {
    const tripId   = Storage.genId();
    const user     = Storage.getActiveUser();
    const now      = Date.now();
    const days     = Array.isArray(template.days) ? template.days : [];

    // Calculate end date
    let dateEnd = null;
    if (startDate && days.length > 1) {
      dateEnd = _addDays(startDate, days.length - 1);
    } else if (startDate) {
      dateEnd = startDate;
    }

    return {
      id:                 tripId,
      name:               tripName,
      source_template_id: template.id,
      status:             'upcoming',
      date_start:         startDate || null,
      date_end:           dateEnd,
      participants: [
        { user_id: user.id, role: 'owner', joined_at: now },
      ],
      days: days.map((tDay, i) => ({
        id:                  Storage.genId(),
        trip_id:             tripId,
        day_number:          tDay.day_number != null ? tDay.day_number : i + 1,
        date:                startDate ? _addDays(startDate, i) : null,
        title:               tDay.title || null,
        start_metro_station: null,
        start_address:       null,
        items: (Array.isArray(tDay.items) ? tDay.items : []).map(tItem => ({
          id:               Storage.genId(),
          place_id:         tItem.place_id || null,
          slot:             tItem.slot || null,
          time:             null,
          duration_minutes: tItem.duration_minutes || null,
          note:             tItem.note || null,
          order:            tItem.order != null ? tItem.order : 0,
          added_by:         user.id,
          votes:            [],
        })),
      })),
      accommodations:  [],
      budget_summary:  null,
      created_by:      user.id,
      created_at:      now,
    };
  }

  // ── Init ───────────────────────────────────────────────────────────────────────

  function init() {
    _ensureModals();
    renderTemplatesList();
  }

  // ── Public API ─────────────────────────────────────────────────────────────────

  return {
    init,
    renderTemplatesList,
    openTemplateEditor,
    saveTemplate,
    deleteTemplate,
    launchTemplate,
    createTripFromTemplate,
    // internal helpers exposed for inline onclick handlers
    _cancelEditor,
    _cancelLaunch,
  };

})();
