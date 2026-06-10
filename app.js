/* ============================================================
   MI ARMARIO — app.js
   State management · DOM rendering · Event binding · Utils
   ============================================================ */

'use strict';

// ── CONSTANTS ────────────────────────────────────────────────
const STORAGE_KEY = 'miarmario_v2';

const CAT_EMOJI = {
  tops:          '👕',
  pantalon:      '👖',
  short:         '🩳',
  vestido:       '👗',
  zapatos:       '👟',
  abrigo:        '🧥',
  accesorio:     '🧢',
  'ropa-interior': '🩲',
};

const CAT_LABEL = {
  tops:          'Tops',
  pantalon:      'Pantalón',
  short:         'Short',
  vestido:       'Vestido',
  zapatos:       'Zapatos',
  abrigo:        'Abrigo',
  accesorio:     'Accesorio',
  'ropa-interior': 'Interior',
};

const STATUS_LABEL = { limpia: 'Limpia', usando: 'Usando', sucia: 'Sucia' };

// ── STATE ────────────────────────────────────────────────────
let state = {
  prendas:       [],   // { id, nombre, categoria, color, marca, notas, estado, usos, createdAt }
  outfitHoy:     [],   // [id, ...]
  outfitManana:  [],   // [id, ...]
  horaCambio:    null, // "18:00"
  historial:     [],   // [{ fecha, prendas: [id,...] }, ...]
  editingId:     null, // prenda being edited
};

// Filters & UI state (not persisted)
let ui = {
  view:          'dashboard',
  filterEstado:  'todas',
  filterCat:     null,
  searchPrendas: '',
  selectorMode:  'hoy',   // 'hoy' | 'manana'
  selectorSel:   [],
  selectorCat:   'todas',
  selectorSearch:'',
};

// ── PERSISTENCE ──────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    }
  } catch (e) {
    console.warn('No se pudo cargar el estado:', e);
  }
}

function saveState() {
  try {
    const { editingId, ...toSave } = state; // don't persist UI helpers
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn('No se pudo guardar el estado:', e);
  }
}

// ── UTILS ────────────────────────────────────────────────────
function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function fechaHoy() {
  return new Date().toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fechaCorta(date = new Date()) {
  return date.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
}

function saludo() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function el(id) { return document.getElementById(id); }

function qs(sel, ctx = document) { return ctx.querySelector(sel); }

function qsa(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function sanitize(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── TOAST ────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 2800) {
  const icons = { success: 'ti-circle-check', error: 'ti-alert-circle', info: 'ti-info-circle' };
  const container = el('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.innerHTML = `<i class="ti ${icons[type]}" aria-hidden="true"></i><span>${sanitize(msg)}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add('removing');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }, duration);
}

// ── MODAL HELPERS ────────────────────────────────────────────
function openModal(id) {
  const modal = el(id);
  modal.removeAttribute('hidden');
  modal.setAttribute('aria-hidden', 'false');
  // focus first input
  const first = qs('input:not([type=hidden]), textarea, button.btn--primary', modal);
  if (first) setTimeout(() => first.focus(), 80);
}

function closeModal(id) {
  const modal = el(id);
  modal.setAttribute('hidden', '');
  modal.setAttribute('aria-hidden', 'true');
}

// ── NAVIGATION ───────────────────────────────────────────────
function setView(viewName) {
  ui.view = viewName;

  qsa('.nav-item').forEach(btn => {
    const active = btn.dataset.view === viewName;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  qsa('.view').forEach(sec => {
    const active = sec.id === `view-${viewName}`;
    sec.toggleAttribute('hidden', !active);
    if (active) sec.classList.add('active');
    else sec.classList.remove('active');
  });

  // Re-render when switching to views that need fresh data
  if (viewName === 'prendas')   renderPrendas();
  if (viewName === 'lavanderia') renderLavanderia();
  if (viewName === 'historial') renderHistorial();
  if (viewName === 'outfits')   renderOutfitsSemana();
}

// ── CAMBIO DE HORA ────────────────────────────────────────────
function checkCambioHora() {
  if (!state.horaCambio || state.outfitHoy.length === 0) {
    el('alert-cambio').setAttribute('hidden', '');
    return;
  }
  const ahora = new Date();
  const [h, m] = state.horaCambio.split(':').map(Number);
  const cambio = new Date();
  cambio.setHours(h, m, 0, 0);
  const diff = ahora - cambio;
  // Show alert within 90 minutes after the change time
  if (diff >= 0 && diff < 5400000) {
    el('alert-cambio').removeAttribute('hidden');
  } else {
    el('alert-cambio').setAttribute('hidden', '');
  }
}

function confirmarCambio() {
  if (state.outfitHoy.length === 0) return;

  // Save to historial
  state.historial.unshift({
    fecha:   fechaCorta(),
    iso:     new Date().toISOString(),
    prendas: [...state.outfitHoy],
  });
  if (state.historial.length > 60) state.historial = state.historial.slice(0, 60);

  // Mark today's clothes as dirty
  state.outfitHoy.forEach(id => {
    const p = state.prendas.find(x => x.id === id);
    if (p) p.estado = 'sucia';
  });

  // Activate tomorrow's outfit if planned
  if (state.outfitManana.length > 0) {
    state.outfitHoy = [...state.outfitManana];
    state.outfitManana.forEach(id => {
      const p = state.prendas.find(x => x.id === id);
      if (p) { p.estado = 'usando'; p.usos = (p.usos || 0) + 1; }
    });
    state.outfitManana = [];
    toast('¡Outfit de mañana activado!', 'success');
  } else {
    state.outfitHoy = [];
    toast('Prendas enviadas a lavandería.', 'info');
  }

  el('alert-cambio').setAttribute('hidden', '');
  saveState();
  renderAll();
}

// ── RENDER ALL ───────────────────────────────────────────────
function renderAll() {
  renderDashboard();
  renderPrendas();
  renderLavanderia();
  renderHistorial();
  updateNavBadge();
}

// ── DASHBOARD ────────────────────────────────────────────────
function renderDashboard() {
  // Saludo y fecha
  qs('.view__title', el('view-dashboard')).textContent = saludo();
  el('fecha-hoy').textContent = fechaHoy();

  // Stats
  const limpias = state.prendas.filter(p => p.estado === 'limpia').length;
  const usando  = state.prendas.filter(p => p.estado === 'usando').length;
  const sucias  = state.prendas.filter(p => p.estado === 'sucia').length;
  el('stat-limpias').textContent = limpias;
  el('stat-usando').textContent  = usando;
  el('stat-sucias').textContent  = sucias;
  el('stat-total').textContent   = state.prendas.length;

  // Hora chip
  const chip = el('hora-cambio-chip');
  if (state.horaCambio) {
    chip.textContent = `⏰ cambio a las ${state.horaCambio}`;
    chip.removeAttribute('hidden');
  } else {
    chip.setAttribute('hidden', '');
  }

  checkCambioHora();

  // Outfit hoy
  renderOutfitStrip('outfit-hoy-piezas', 'outfit-hoy-empty', state.outfitHoy, true);

  // Outfit mañana
  renderOutfitStrip('outfit-manana-piezas', 'outfit-manana-empty', state.outfitManana, false);
}

function renderOutfitStrip(piecesId, emptyId, ids, canRemove) {
  const container = el(piecesId);
  const empty     = el(emptyId);
  container.innerHTML = '';

  if (ids.length === 0) {
    empty.removeAttribute('hidden');
    return;
  }
  empty.setAttribute('hidden', '');

  ids.forEach(id => {
    const p = state.prendas.find(x => x.id === id);
    if (!p) return;

    const piece = document.createElement('div');
    piece.className = 'outfit-piece';
    piece.setAttribute('role', 'listitem');
    piece.innerHTML = `
      <span class="outfit-piece__emoji">${CAT_EMOJI[p.categoria] || '👕'}</span>
      <span class="outfit-piece__name">${sanitize(p.nombre)}</span>
      ${canRemove ? `<button class="outfit-piece__remove" data-remove="${id}" aria-label="Quitar ${sanitize(p.nombre)}"><i class="ti ti-x" aria-hidden="true"></i></button>` : ''}
    `;
    container.appendChild(piece);
  });
}

function updateNavBadge() {
  const count = state.prendas.filter(p => p.estado === 'sucia').length;
  const badge = el('nav-badge-lavanderia');
  badge.textContent = count;
  badge.dataset.count = count;
}

// ── PRENDAS VIEW ─────────────────────────────────────────────
function getPrendasFiltradas() {
  return state.prendas.filter(p => {
    const okEstado = ui.filterEstado === 'todas' || p.estado === ui.filterEstado;
    const okCat    = !ui.filterCat   || p.categoria === ui.filterCat;
    const search   = ui.searchPrendas.toLowerCase();
    const okSearch = !search ||
      p.nombre.toLowerCase().includes(search) ||
      (p.color  || '').toLowerCase().includes(search) ||
      (p.marca  || '').toLowerCase().includes(search);
    return okEstado && okCat && okSearch;
  });
}

function renderPrendas() {
  const grid  = el('prendas-grid');
  const list  = getPrendasFiltradas();
  el('prendas-count').textContent = `${state.prendas.length} prendas · ${list.length} visibles`;

  grid.innerHTML = '';

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-hanger" aria-hidden="true"></i>
        <p>${state.prendas.length === 0 ? 'Tu armario está vacío. ¡Agrega tu primera prenda!' : 'Sin prendas con ese filtro.'}</p>
      </div>`;
    return;
  }

  list.forEach(p => {
    const card = document.createElement('div');
    card.className = 'prenda-card';
    card.setAttribute('role', 'listitem');

    const badgeCls = { limpia: 'badge--clean', usando: 'badge--using', sucia: 'badge--dirty' }[p.estado];

    const lavarBtn = p.estado === 'sucia'
      ? `<button class="btn btn--success btn--sm btn--icon" data-action="limpiar" data-id="${p.id}" title="Marcar como limpia"><i class="ti ti-wash" aria-hidden="true"></i></button>`
      : '';

    card.innerHTML = `
      <div class="prenda-card__top">
        <div class="prenda-card__emoji">${CAT_EMOJI[p.categoria] || '👕'}</div>
        <div class="prenda-card__info">
          <div class="prenda-card__name">${sanitize(p.nombre)}</div>
          <div class="prenda-card__meta">
            ${p.color ? `<span>${sanitize(p.color)}</span>` : ''}
            ${p.marca ? `<span>${sanitize(p.marca)}</span>` : ''}
            <span>${CAT_LABEL[p.categoria] || p.categoria}</span>
          </div>
        </div>
      </div>
      <div class="prenda-card__footer">
        <span class="badge ${badgeCls}">${STATUS_LABEL[p.estado]}</span>
        <span class="usos-pill">${p.usos || 0} uso${(p.usos || 0) !== 1 ? 's' : ''}</span>
        <div class="prenda-card__actions">
          ${lavarBtn}
          <button class="btn btn--ghost btn--sm btn--icon" data-action="editar" data-id="${p.id}" title="Editar prenda"><i class="ti ti-pencil" aria-hidden="true"></i></button>
          <button class="btn btn--danger btn--sm btn--icon" data-action="eliminar" data-id="${p.id}" title="Eliminar prenda"><i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>
      </div>
      ${p.notas ? `<p style="font-size:11px;color:var(--color-text-3);margin-top:-4px;line-height:1.4">${sanitize(p.notas)}</p>` : ''}
    `;

    grid.appendChild(card);
  });
}

// ── LAVANDERÍA VIEW ──────────────────────────────────────────
function renderLavanderia() {
  const grid  = el('lavanderia-grid');
  const sucias = state.prendas.filter(p => p.estado === 'sucia');
  el('lavanderia-count').textContent = `${sucias.length} prenda${sucias.length !== 1 ? 's' : ''} para lavar`;

  grid.innerHTML = '';

  if (sucias.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-sparkles" aria-hidden="true"></i>
        <p>¡Todo limpio! No hay prendas para lavar.</p>
      </div>`;
    return;
  }

  sucias.forEach(p => {
    const card = document.createElement('div');
    card.className = 'prenda-card';
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <div class="prenda-card__top">
        <div class="prenda-card__emoji">${CAT_EMOJI[p.categoria] || '👕'}</div>
        <div class="prenda-card__info">
          <div class="prenda-card__name">${sanitize(p.nombre)}</div>
          <div class="prenda-card__meta">
            ${p.color ? `<span>${sanitize(p.color)}</span>` : ''}
            <span>${CAT_LABEL[p.categoria] || p.categoria}</span>
          </div>
        </div>
      </div>
      <div class="prenda-card__footer">
        <span class="badge badge--dirty">Sucia</span>
        <button class="btn btn--success btn--sm" data-action="limpiar" data-id="${p.id}">
          <i class="ti ti-wash" aria-hidden="true"></i> Lavar
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ── HISTORIAL VIEW ───────────────────────────────────────────
function renderHistorial() {
  const list = el('historial-list');
  list.innerHTML = '';

  if (state.historial.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-history" aria-hidden="true"></i>
        <p>Tu historial de outfits aparecerá aquí al confirmar cambios.</p>
      </div>`;
    return;
  }

  state.historial.slice(0, 40).forEach(entry => {
    const div = document.createElement('div');
    div.className = 'historial-entry';

    const piezas = entry.prendas.map(id => {
      const p = state.prendas.find(x => x.id === id);
      return p
        ? `<span class="historial-piece">${CAT_EMOJI[p.categoria] || '👕'} ${sanitize(p.nombre)}</span>`
        : `<span class="historial-piece" style="opacity:.4">Prenda eliminada</span>`;
    }).join('');

    div.innerHTML = `
      <span class="historial-entry__date">${entry.fecha}</span>
      <div class="historial-entry__prendas">${piezas}</div>
    `;
    list.appendChild(div);
  });
}

// ── OUTFITS SEMANA VIEW ──────────────────────────────────────
function renderOutfitsSemana() {
  const container = el('outfits-semana');
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'semana-grid';

  const hoy = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    const isHoy    = i === 0;
    const isManana = i === 1;

    const day = document.createElement('div');
    day.className = 'semana-day' + (isHoy ? ' today' : '');

    const ids = isHoy ? state.outfitHoy : isManana ? state.outfitManana : [];
    const piecesHtml = ids.length > 0
      ? ids.map(id => {
          const p = state.prendas.find(x => x.id === id);
          return p ? `<span class="historial-piece">${CAT_EMOJI[p.categoria] || '👕'} ${sanitize(p.nombre)}</span>` : '';
        }).join('')
      : `<span style="font-size:12px;color:var(--color-text-3)">Sin outfit${isHoy ? ' — agrega uno' : ''}</span>`;

    day.innerHTML = `
      <div class="semana-day__date">
        <div class="semana-day__dow">${d.toLocaleDateString('es', { weekday: 'long' })}</div>
        <div class="semana-day__num">${d.toLocaleDateString('es', { day: 'numeric', month: 'short' })}</div>
      </div>
      <div class="semana-day__prendas">${piecesHtml}</div>
    `;
    grid.appendChild(day);
  }

  container.appendChild(grid);
}

// ── MODAL: NUEVA / EDITAR PRENDA ─────────────────────────────
function abrirModalPrenda(id = null) {
  state.editingId = id;
  const titulo = el('modal-prenda-title');
  const btnGuardar = el('btn-guardar-prenda');

  if (id) {
    const p = state.prendas.find(x => x.id === id);
    if (!p) return;
    titulo.textContent      = 'Editar prenda';
    btnGuardar.textContent  = 'Guardar cambios';
    el('prenda-nombre').value = p.nombre;
    el('prenda-color').value  = p.color  || '';
    el('prenda-marca').value  = p.marca  || '';
    el('prenda-notas').value  = p.notas  || '';
    qsa('.cat-btn', el('cat-grid')).forEach(b => {
      b.classList.toggle('selected', b.dataset.cat === p.categoria);
    });
  } else {
    titulo.textContent      = 'Nueva prenda';
    btnGuardar.textContent  = 'Guardar prenda';
    el('prenda-nombre').value = '';
    el('prenda-color').value  = '';
    el('prenda-marca').value  = '';
    el('prenda-notas').value  = '';
    qsa('.cat-btn', el('cat-grid')).forEach((b, i) => b.classList.toggle('selected', i === 0));
  }

  openModal('modal-prenda');
}

function guardarPrenda() {
  const nombre = el('prenda-nombre').value.trim();
  if (!nombre) {
    el('prenda-nombre').focus();
    toast('El nombre es obligatorio.', 'error');
    return;
  }

  const cat    = qs('.cat-btn.selected', el('cat-grid'))?.dataset.cat || 'tops';
  const color  = el('prenda-color').value.trim();
  const marca  = el('prenda-marca').value.trim();
  const notas  = el('prenda-notas').value.trim();

  if (state.editingId) {
    const p = state.prendas.find(x => x.id === state.editingId);
    if (p) {
      p.nombre    = nombre;
      p.categoria = cat;
      p.color     = color;
      p.marca     = marca;
      p.notas     = notas;
    }
    toast('Prenda actualizada.', 'success');
  } else {
    state.prendas.push({
      id:        uid(),
      nombre,
      categoria: cat,
      color,
      marca,
      notas,
      estado:    'limpia',
      usos:      0,
      createdAt: new Date().toISOString(),
    });
    toast('Prenda agregada al armario.', 'success');
  }

  state.editingId = null;
  closeModal('modal-prenda');
  saveState();
  renderAll();
}

// ── MODAL: SELECTOR DE OUTFIT ────────────────────────────────
function abrirSelector(mode = 'hoy') {
  ui.selectorMode   = mode;
  ui.selectorSel    = mode === 'hoy'    ? [...state.outfitHoy]
                    : mode === 'manana' ? [...state.outfitManana]
                    : [];
  ui.selectorCat    = 'todas';
  ui.selectorSearch = '';

  el('modal-selector-title').textContent =
    mode === 'hoy'    ? 'Outfit de hoy' :
    mode === 'manana' ? 'Outfit de mañana' : 'Seleccionar prendas';

  el('selector-search-input').value = '';
  qsa('[data-selector-cat]').forEach(b => b.classList.toggle('active', b.dataset.selectorCat === 'todas'));

  renderSelectorList();
  openModal('modal-selector');
}

function renderSelectorList() {
  const list = el('selector-list');
  list.innerHTML = '';

  const search = ui.selectorSearch.toLowerCase();
  const disponibles = state.prendas.filter(p => {
    if (p.estado === 'sucia') return false;
    // Allow already-selected pieces even if 'usando' by another outfit
    const okCat = ui.selectorCat === 'todas' || p.categoria === ui.selectorCat;
    const okSrc = !search || p.nombre.toLowerCase().includes(search) || (p.color || '').toLowerCase().includes(search);
    return okCat && okSrc;
  });

  if (disponibles.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--color-text-3);font-size:13px">Sin prendas disponibles con ese filtro.</div>`;
    actualizarContadorSelector();
    return;
  }

  disponibles.forEach(p => {
    const selected = ui.selectorSel.includes(p.id);
    const item = document.createElement('div');
    item.className = 'selector-item' + (selected ? ' selected' : '');
    item.setAttribute('role', 'listitem');
    item.dataset.id = p.id;
    item.innerHTML = `
      <span class="selector-item__emoji">${CAT_EMOJI[p.categoria] || '👕'}</span>
      <span class="selector-item__name">${sanitize(p.nombre)}</span>
      <span class="selector-item__meta">${p.color || ''}</span>
      <span class="selector-item__check"><i class="ti ti-check" aria-hidden="true"></i></span>
    `;
    item.addEventListener('click', () => toggleSelectorItem(p.id, item));
    list.appendChild(item);
  });

  actualizarContadorSelector();
}

function toggleSelectorItem(id, itemEl) {
  if (ui.selectorSel.includes(id)) {
    ui.selectorSel = ui.selectorSel.filter(x => x !== id);
    itemEl.classList.remove('selected');
  } else {
    ui.selectorSel.push(id);
    itemEl.classList.add('selected');
  }
  actualizarContadorSelector();
}

function actualizarContadorSelector() {
  el('selector-count').textContent = `${ui.selectorSel.length} seleccionada${ui.selectorSel.length !== 1 ? 's' : ''}`;
}

function confirmarSelector() {
  const modo = ui.selectorMode;

  if (modo === 'hoy') {
    // Revert previous 'usando' if removed from outfit
    const removidos = state.outfitHoy.filter(id => !ui.selectorSel.includes(id));
    removidos.forEach(id => {
      const p = state.prendas.find(x => x.id === id);
      if (p && p.estado === 'usando') p.estado = 'limpia';
    });

    // Mark new ones as 'usando'
    const nuevos = ui.selectorSel.filter(id => !state.outfitHoy.includes(id));
    nuevos.forEach(id => {
      const p = state.prendas.find(x => x.id === id);
      if (p) { p.estado = 'usando'; p.usos = (p.usos || 0) + 1; }
    });

    state.outfitHoy = [...ui.selectorSel];

    // If first time setting outfit and no change hour, prompt for it
    if (state.outfitHoy.length > 0 && !state.horaCambio) {
      closeModal('modal-selector');
      saveState();
      renderAll();
      setTimeout(() => openModal('modal-hora'), 200);
      return;
    }

  } else if (modo === 'manana') {
    state.outfitManana = [...ui.selectorSel];
    toast('Outfit de mañana guardado.', 'success');
  }

  closeModal('modal-selector');
  saveState();
  renderAll();
}

// ── MODAL: HORA DE CAMBIO ─────────────────────────────────────
function guardarHoraCambio() {
  const val = el('hora-input').value;
  if (!val) return;
  state.horaCambio = val;
  closeModal('modal-hora');
  saveState();
  renderAll();
  toast(`Hora de cambio: ${val}`, 'success');
}

// ── ACCIONES SOBRE PRENDAS ───────────────────────────────────
function limpiarPrenda(id) {
  const p = state.prendas.find(x => x.id === id);
  if (!p) return;
  p.estado = 'limpia';
  saveState();
  renderAll();
  toast(`"${p.nombre}" marcada como limpia.`, 'success');
}

function eliminarPrenda(id) {
  const p = state.prendas.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return;

  state.prendas     = state.prendas.filter(x => x.id !== id);
  state.outfitHoy   = state.outfitHoy.filter(x => x !== id);
  state.outfitManana = state.outfitManana.filter(x => x !== id);

  saveState();
  renderAll();
  toast('Prenda eliminada.', 'info');
}

function lavarTodas() {
  const sucias = state.prendas.filter(p => p.estado === 'sucia');
  if (sucias.length === 0) return;
  sucias.forEach(p => { p.estado = 'limpia'; });
  saveState();
  renderAll();
  toast(`${sucias.length} prenda${sucias.length !== 1 ? 's' : ''} lavada${sucias.length !== 1 ? 's' : ''}.`, 'success');
}

// ── EXPORT / IMPORT (Excel-friendly) ─────────────────────────

/**
 * Exporta todas las prendas como archivo .xlsx real usando SheetJS (CDN).
 * Si SheetJS no está disponible, cae a CSV con BOM para que Excel lo abra bien.
 */
async function exportData() {
  const fecha = new Date().toISOString().split('T')[0];

  // Construir filas
  const headers = ['Nombre', 'Categoría', 'Color', 'Marca', 'Estado', 'Usos', 'Notas', 'Agregada'];
  const rows = state.prendas.map(p => [
    p.nombre,
    CAT_LABEL[p.categoria] || p.categoria,
    p.color   || '',
    p.marca   || '',
    STATUS_LABEL[p.estado] || p.estado,
    p.usos    || 0,
    p.notas   || '',
    p.createdAt ? p.createdAt.split('T')[0] : '',
  ]);

  // Intentar con SheetJS (xlsx) si está disponible en la página
  if (typeof XLSX !== 'undefined') {
    const wsData = [headers, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Ancho de columnas
    ws['!cols'] = [22, 12, 14, 14, 10, 6, 30, 12].map(w => ({ wch: w }));

    // Hoja de historial
    const histHeaders = ['Fecha', 'Prendas usadas'];
    const histRows = state.historial.map(h => [
      h.fecha,
      h.prendas.map(id => {
        const p = state.prendas.find(x => x.id === id);
        return p ? p.nombre : '(eliminada)';
      }).join(', '),
    ]);
    const wsHist = XLSX.utils.aoa_to_sheet([histHeaders, ...histRows]);
    wsHist['!cols'] = [{ wch: 16 }, { wch: 60 }];

    XLSX.utils.book_append_sheet(wb, ws,     'Prendas');
    XLSX.utils.book_append_sheet(wb, wsHist, 'Historial');

    XLSX.writeFile(wb, `mi-armario-${fecha}.xlsx`);
    toast('¡Exportado como Excel (.xlsx)!', 'success');
    return;
  }

  // Fallback: CSV con BOM para que Excel lo abra sin problemas de tildes
  const BOM = '\uFEFF';
  const escape = v => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map(r => r.map(escape).join(','));
  const csv   = BOM + lines.join('\r\n');
  const blob  = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `mi-armario-${fecha}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exportado como CSV — ábrelo con Excel.', 'success');
}

/**
 * Importa desde:
 *  - .xlsx / .xls  → usa SheetJS si está disponible
 *  - .csv          → parser propio (soporta comas, punto y coma, comillas)
 *  - .json         → formato interno (backup completo)
 */
function importData(file) {
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'json') {
    // Backup completo JSON
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed.prendas)) throw new Error('Formato inválido');
        state = { ...state, ...parsed };
        saveState(); renderAll();
        toast(`Importadas ${parsed.prendas.length} prendas desde backup.`, 'success');
      } catch {
        toast('El archivo JSON no tiene el formato correcto.', 'error');
      }
    };
    reader.readAsText(file);
    return;
  }

  if ((ext === 'xlsx' || ext === 'xls') && typeof XLSX !== 'undefined') {
    // Excel via SheetJS
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        procesarFilasImportadas(data);
      } catch {
        toast('No se pudo leer el archivo Excel.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  // CSV — soporta separador coma o punto y coma, con o sin BOM
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      let text = e.target.result.replace(/^\uFEFF/, ''); // quitar BOM
      const sep = text.split('\n')[0].includes(';') ? ';' : ',';

      const parseCSVLine = (line) => {
        const result = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
          } else if (ch === sep && !inQ) {
            result.push(cur.trim()); cur = '';
          } else {
            cur += ch;
          }
        }
        result.push(cur.trim());
        return result;
      };

      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
      const data = lines.slice(1).map(line => {
        const vals = parseCSVLine(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      });

      procesarFilasImportadas(data);
    } catch {
      toast('No se pudo leer el CSV. Asegúrate de que sea el archivo exportado.', 'error');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

/**
 * Convierte filas (desde Excel o CSV) en prendas del estado.
 * Acepta los encabezados en español que genera exportData().
 */
function procesarFilasImportadas(rows) {
  const CAT_REVERSE = Object.fromEntries(
    Object.entries(CAT_LABEL).map(([k, v]) => [v.toLowerCase(), k])
  );
  const ESTADO_REVERSE = { 'limpia': 'limpia', 'usando': 'usando', 'sucia': 'sucia' };

  // Normalizar claves: acepta "Nombre", "nombre", "NOMBRE"
  const norm = (obj, keys) => {
    for (const k of keys) {
      for (const ok of Object.keys(obj)) {
        if (ok.toLowerCase().replace(/\s/g,'') === k.toLowerCase().replace(/\s/g,'')) return obj[ok];
      }
    }
    return '';
  };

  let importadas = 0, omitidas = 0;

  rows.forEach(row => {
    const nombre = norm(row, ['nombre', 'name']).trim();
    if (!nombre) { omitidas++; return; }

    // ¿Ya existe? → actualizar
    const existe = state.prendas.find(p => p.nombre.toLowerCase() === nombre.toLowerCase());
    const catRaw = norm(row, ['categoría','categoria','category']).toLowerCase();
    const cat    = CAT_REVERSE[catRaw] || 'tops';
    const estRaw = norm(row, ['estado','status']).toLowerCase();
    const estado = ESTADO_REVERSE[estRaw] || 'limpia';

    if (existe) {
      existe.color  = norm(row, ['color'])          || existe.color;
      existe.marca  = norm(row, ['marca','brand'])   || existe.marca;
      existe.notas  = norm(row, ['notas','notes'])   || existe.notas;
      existe.estado = estado;
    } else {
      state.prendas.push({
        id:        uid(),
        nombre,
        categoria: cat,
        color:     norm(row, ['color'])        || '',
        marca:     norm(row, ['marca','brand']) || '',
        notas:     norm(row, ['notas','notes']) || '',
        estado,
        usos:      parseInt(norm(row, ['usos','uses'])) || 0,
        createdAt: new Date().toISOString(),
      });
      importadas++;
    }
  });

  saveState();
  renderAll();
  toast(`✓ ${importadas} prendas importadas${omitidas ? `, ${omitidas} omitidas` : ''}.`, 'success');
}

// ── EVENT BINDING ────────────────────────────────────────────
function bindEvents() {

  // Navigation
  qsa('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  // Close modals via data-close attribute
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) closeModal(closeBtn.dataset.close);
  });

  // Close modal on overlay click
  qsa('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        const modal = qs('[role=dialog]', overlay);
        if (modal) closeModal(modal.id);
      }
    });
  });

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const open = qs('.modal-overlay:not([hidden])');
      if (open) {
        const modal = qs('[role=dialog]', open);
        if (modal) closeModal(modal.id);
      }
    }
  });

  // Category buttons in prenda modal
  el('cat-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    qsa('.cat-btn', el('cat-grid')).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });

  // Save prenda
  el('btn-guardar-prenda').addEventListener('click', guardarPrenda);
  el('prenda-nombre').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') guardarPrenda();
  });

  // New prenda button (prendas view)
  el('btn-agregar-prenda').addEventListener('click', () => abrirModalPrenda());

  // Dashboard: Outfit hoy & mañana
  el('btn-nuevo-outfit').addEventListener('click', () => abrirSelector('hoy'));
  el('btn-planificar-manana').addEventListener('click', () => abrirSelector('manana'));

  // Dashboard: Confirmar cambio
  el('btn-confirmar-cambio').addEventListener('click', confirmarCambio);

  // Remove piece from today's outfit (delegated)
  el('outfit-hoy-piezas').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const id = btn.dataset.remove;
    state.outfitHoy = state.outfitHoy.filter(x => x !== id);
    const p = state.prendas.find(x => x.id === id);
    if (p && p.estado === 'usando') p.estado = 'limpia';
    saveState();
    renderAll();
  });

  // Prenda cards: delegated actions (prendas view + lavanderia view)
  ['prendas-grid', 'lavanderia-grid'].forEach(gridId => {
    el(gridId).addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === 'limpiar')  limpiarPrenda(id);
      if (action === 'editar')   abrirModalPrenda(id);
      if (action === 'eliminar') eliminarPrenda(id);
    });
  });

  // Filters (prendas view)
  el('view-prendas').addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip[data-filter]');
    if (chip) {
      ui.filterEstado = chip.dataset.filter;
      ui.filterCat    = null;
      qsa('.filter-chip[data-filter]', el('view-prendas')).forEach(c => c.classList.toggle('active', c === chip));
      qsa('.filter-chip[data-filter-cat]', el('view-prendas')).forEach(c => c.classList.remove('active'));
      renderPrendas();
      return;
    }
    const catChip = e.target.closest('.filter-chip[data-filter-cat]');
    if (catChip) {
      const same = ui.filterCat === catChip.dataset.filterCat;
      ui.filterCat = same ? null : catChip.dataset.filterCat;
      qsa('.filter-chip[data-filter-cat]', el('view-prendas')).forEach(c => c.classList.toggle('active', !same && c === catChip));
      renderPrendas();
    }
  });

  // Search (prendas view)
  el('prendas-search').addEventListener('input', (e) => {
    ui.searchPrendas = e.target.value;
    renderPrendas();
  });

  // Selector: category filter
  el('selector-cats').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-selector-cat]');
    if (!btn) return;
    ui.selectorCat = btn.dataset.selectorCat;
    qsa('[data-selector-cat]').forEach(b => b.classList.toggle('active', b === btn));
    renderSelectorList();
  });

  // Selector: search
  el('selector-search-input').addEventListener('input', (e) => {
    ui.selectorSearch = e.target.value;
    renderSelectorList();
  });

  // Confirm selector
  el('btn-confirmar-selector').addEventListener('click', confirmarSelector);

  // Save hora de cambio
  el('btn-guardar-hora').addEventListener('click', guardarHoraCambio);
  el('hora-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') guardarHoraCambio();
  });

  // Lavar todas
  el('btn-lavar-todas').addEventListener('click', lavarTodas);

  // Export / Import
  el('btn-export').addEventListener('click', exportData);
  el('btn-import').addEventListener('click', () => el('file-import').click());
  el('file-import').addEventListener('change', (e) => {
    importData(e.target.files[0]);
    e.target.value = '';
  });
}

// ── INIT ─────────────────────────────────────────────────────
function init() {
  loadState();
  bindEvents();
  renderAll();
  setView('dashboard');

  // Check change hour every minute
  setInterval(() => {
    checkCambioHora();
  }, 60_000);
}

document.addEventListener('DOMContentLoaded', init);
