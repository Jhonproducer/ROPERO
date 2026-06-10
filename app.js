/* ============================================================
   MI ARMARIO — app.js  (con soporte de fotos)
   ============================================================ */
'use strict';

const STORAGE_KEY = 'miarmario_v3';

const CAT_EMOJI = {
  tops:'👕', pantalon:'👖', short:'🩳', vestido:'👗',
  zapatos:'👟', abrigo:'🧥', accesorio:'🧢', 'ropa-interior':'🩲',
};
const CAT_LABEL = {
  tops:'Tops', pantalon:'Pantalón', short:'Short', vestido:'Vestido',
  zapatos:'Zapatos', abrigo:'Abrigo', accesorio:'Accesorio', 'ropa-interior':'Interior',
};
const STATUS_LABEL = { limpia:'Limpia', usando:'Usando', sucia:'Sucia' };

// ── STATE ────────────────────────────────────────────────────
let state = {
  prendas:      [],
  outfitHoy:    [],
  outfitManana: [],
  horaCambio:   null,
  historial:    [],
};
let editingId   = null;
let fotoBase64  = null;   // imagen actual en el modal

// ── UI FILTERS ───────────────────────────────────────────────
let ui = {
  filterEstado:'todas', filterCat:null, searchPrendas:'',
  selectorMode:'hoy', selectorSel:[], selectorCat:'todas', selectorSearch:'',
};

// ── PERSISTENCE ──────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch(e) { console.warn('Error cargando estado', e); }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e) {
    // localStorage lleno (puede pasar con muchas fotos en Base64)
    toast('Espacio de almacenamiento casi lleno. Exporta un respaldo.', 'error', 4000);
  }
}

// ── UTILS ────────────────────────────────────────────────────
const uid  = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
const el   = id => document.getElementById(id);
const qs   = (s,c=document) => c.querySelector(s);
const qsa  = (s,c=document) => [...c.querySelectorAll(s)];
const safe = str => { const d=document.createElement('div'); d.textContent=str; return d.innerHTML; };

function fechaHoy() {
  return new Date().toLocaleDateString('es',{ weekday:'long', day:'numeric', month:'long', year:'numeric' });
}
function fechaCorta(d=new Date()) {
  return d.toLocaleDateString('es',{ weekday:'short', day:'numeric', month:'short' });
}
function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

// ── TOAST ────────────────────────────────────────────────────
function toast(msg, type='info', dur=2800) {
  const icons = { success:'ti-circle-check', error:'ti-alert-circle', info:'ti-info-circle' };
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.innerHTML = `<i class="ti ${icons[type]}"></i><span>${safe(msg)}</span>`;
  el('toast-container').appendChild(t);
  setTimeout(() => {
    t.classList.add('removing');
    t.addEventListener('animationend', ()=>t.remove(), {once:true});
  }, dur);
}

// ── MODALS ───────────────────────────────────────────────────
function openModal(id) {
  el(id).removeAttribute('hidden');
  const first = qs('input:not([type=hidden]):not([type=file]), textarea', el(id));
  if (first) setTimeout(()=>first.focus(), 80);
}
function closeModal(id) { el(id).setAttribute('hidden',''); }

// ── NAVIGATION ───────────────────────────────────────────────
function setView(name) {
  qsa('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  qsa('.view').forEach(s => {
    const on = s.id === `view-${name}`;
    s.toggleAttribute('hidden', !on);
    if (on) s.classList.add('active'); else s.classList.remove('active');
  });
  if (name==='prendas')    renderPrendas();
  if (name==='lavanderia') renderLavanderia();
  if (name==='historial')  renderHistorial();
  if (name==='outfits')    renderOutfitsSemana();
}

// ── CHECK HORA CAMBIO ────────────────────────────────────────
function checkHoraCambio() {
  if (!state.horaCambio || !state.outfitHoy.length) {
    el('alert-cambio').setAttribute('hidden',''); return;
  }
  const [h,m] = state.horaCambio.split(':').map(Number);
  const cambio = new Date(); cambio.setHours(h,m,0,0);
  const diff = Date.now() - cambio;
  if (diff >= 0 && diff < 5400000) el('alert-cambio').removeAttribute('hidden');
  else el('alert-cambio').setAttribute('hidden','');
}

function confirmarCambio() {
  state.historial.unshift({ fecha:fechaCorta(), prendas:[...state.outfitHoy] });
  if (state.historial.length > 60) state.historial.length = 60;

  state.outfitHoy.forEach(id => {
    const p = state.prendas.find(x=>x.id===id);
    if (p) p.estado = 'sucia';
  });

  if (state.outfitManana.length) {
    state.outfitHoy = [...state.outfitManana];
    state.outfitManana.forEach(id => {
      const p = state.prendas.find(x=>x.id===id);
      if (p) { p.estado='usando'; p.usos=(p.usos||0)+1; }
    });
    state.outfitManana = [];
    toast('Outfit de mañana activado.','success');
  } else {
    state.outfitHoy = [];
    toast('Prendas enviadas a lavandería.','info');
  }

  el('alert-cambio').setAttribute('hidden','');
  saveState(); renderAll();
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
  el('saludo-title').textContent = saludo();
  el('fecha-hoy').textContent    = fechaHoy();
  el('stat-limpias').textContent = state.prendas.filter(p=>p.estado==='limpia').length;
  el('stat-usando').textContent  = state.prendas.filter(p=>p.estado==='usando').length;
  el('stat-sucias').textContent  = state.prendas.filter(p=>p.estado==='sucia').length;
  el('stat-total').textContent   = state.prendas.length;

  const chip = el('hora-cambio-chip');
  if (state.horaCambio) { chip.textContent=`⏰ cambio ${state.horaCambio}`; chip.removeAttribute('hidden'); }
  else chip.setAttribute('hidden','');

  checkHoraCambio();
  renderOutfitStrip('outfit-hoy-piezas',   'outfit-hoy-empty',    state.outfitHoy,   true);
  renderOutfitStrip('outfit-manana-piezas','outfit-manana-empty', state.outfitManana, false);
}

function renderOutfitStrip(piecesId, emptyId, ids, canRemove) {
  const cont  = el(piecesId);
  const empty = el(emptyId);
  cont.innerHTML = '';

  if (!ids.length) { empty.removeAttribute('hidden'); return; }
  empty.setAttribute('hidden','');

  ids.forEach(id => {
    const p = state.prendas.find(x=>x.id===id);
    if (!p) return;
    const div = document.createElement('div');
    div.className = 'outfit-piece outfit-piece--emoji';

    const thumbHtml = p.foto
      ? `<img class="outfit-piece__thumb" src="${p.foto}" alt="${safe(p.nombre)}" />`
      : `<span class="outfit-piece__emoji">${CAT_EMOJI[p.categoria]||'👕'}</span>`;

    div.innerHTML = `
      ${thumbHtml}
      <span class="outfit-piece__name">${safe(p.nombre)}</span>
      ${canRemove ? `<button class="outfit-piece__remove" data-remove="${id}"><i class="ti ti-x"></i></button>` : ''}
    `;
    cont.appendChild(div);
  });
}

function updateNavBadge() {
  const n = state.prendas.filter(p=>p.estado==='sucia').length;
  const b = el('nav-badge-lavanderia');
  b.textContent = n;
  b.style.display = n ? '' : 'none';
}

// ── PRENDAS ──────────────────────────────────────────────────
function getPrendasFiltradas() {
  return state.prendas.filter(p => {
    const okE = ui.filterEstado==='todas' || p.estado===ui.filterEstado;
    const okC = !ui.filterCat  || p.categoria===ui.filterCat;
    const s   = ui.searchPrendas.toLowerCase();
    const okS = !s || p.nombre.toLowerCase().includes(s) ||
                (p.color||'').toLowerCase().includes(s) ||
                (p.marca||'').toLowerCase().includes(s);
    return okE && okC && okS;
  });
}

function renderPrendas() {
  const grid = el('prendas-grid');
  const list = getPrendasFiltradas();
  el('prendas-count').textContent = `${state.prendas.length} prendas · ${list.length} visibles`;
  grid.innerHTML = '';

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state"><i class="ti ti-hanger"></i>
      <p>${!state.prendas.length ? 'Armario vacío. Agrega tu primera prenda!' : 'Sin prendas con ese filtro.'}</p></div>`;
    return;
  }

  list.forEach(p => {
    const card = document.createElement('div');
    card.className = 'prenda-card';
    const badgeCls = {limpia:'badge--clean',usando:'badge--using',sucia:'badge--dirty'}[p.estado];

    const mediaHtml = p.foto
      ? `<img class="prenda-card__foto" src="${p.foto}" alt="${safe(p.nombre)}" data-view-foto="${p.id}" />`
      : `<div class="prenda-card__emoji-box">${CAT_EMOJI[p.categoria]||'👕'}</div>`;

    const lavarBtn = p.estado==='sucia'
      ? `<button class="btn btn--success btn--sm btn--icon" data-action="limpiar" data-id="${p.id}" title="Marcar limpia"><i class="ti ti-wash"></i></button>` : '';

    card.innerHTML = `
      ${mediaHtml}
      <div class="prenda-card__body">
        <div class="prenda-card__name">${safe(p.nombre)}</div>
        <div class="prenda-card__meta">
          ${p.color ? `<span>${safe(p.color)}</span>`:''}
          ${p.marca ? `<span>${safe(p.marca)}</span>`:''}
          <span>${CAT_LABEL[p.categoria]||p.categoria}</span>
        </div>
        <div class="prenda-card__footer">
          <span class="badge ${badgeCls}">${STATUS_LABEL[p.estado]}</span>
          <div class="prenda-card__actions">
            ${lavarBtn}
            <button class="btn btn--ghost btn--sm btn--icon" data-action="editar" data-id="${p.id}" title="Editar"><i class="ti ti-pencil"></i></button>
            <button class="btn btn--danger btn--sm btn--icon" data-action="eliminar" data-id="${p.id}" title="Eliminar"><i class="ti ti-trash"></i></button>
          </div>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

// ── LAVANDERÍA ───────────────────────────────────────────────
function renderLavanderia() {
  const grid  = el('lavanderia-grid');
  const sucias = state.prendas.filter(p=>p.estado==='sucia');
  el('lavanderia-count').textContent = `${sucias.length} prenda${sucias.length!==1?'s':''} para lavar`;
  grid.innerHTML = '';

  if (!sucias.length) {
    grid.innerHTML = `<div class="empty-state"><i class="ti ti-sparkles"></i><p>Todo limpio. No hay prendas para lavar.</p></div>`;
    return;
  }

  sucias.forEach(p => {
    const card = document.createElement('div');
    card.className = 'prenda-card';
    const mediaHtml = p.foto
      ? `<img class="prenda-card__foto" src="${p.foto}" alt="${safe(p.nombre)}" data-view-foto="${p.id}" />`
      : `<div class="prenda-card__emoji-box">${CAT_EMOJI[p.categoria]||'👕'}</div>`;
    card.innerHTML = `
      ${mediaHtml}
      <div class="prenda-card__body">
        <div class="prenda-card__name">${safe(p.nombre)}</div>
        <div class="prenda-card__meta">${p.color?`<span>${safe(p.color)}</span>`:''}</div>
        <div class="prenda-card__footer">
          <span class="badge badge--dirty">Sucia</span>
          <button class="btn btn--success btn--sm" data-action="limpiar" data-id="${p.id}"><i class="ti ti-wash"></i>Lavar</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

// ── HISTORIAL ────────────────────────────────────────────────
function renderHistorial() {
  const list = el('historial-list');
  list.innerHTML = '';
  if (!state.historial.length) {
    list.innerHTML=`<div class="empty-state"><i class="ti ti-history"></i><p>El historial aparecerá aquí al confirmar cambios.</p></div>`;
    return;
  }
  state.historial.slice(0,40).forEach(entry => {
    const div = document.createElement('div');
    div.className = 'historial-entry';
    const piezas = entry.prendas.map(id => {
      const p = state.prendas.find(x=>x.id===id);
      return p
        ? (p.foto ? `<img class="historial-thumb" src="${p.foto}" title="${safe(p.nombre)}" alt="${safe(p.nombre)}" />`
                  : `<span class="historial-piece">${CAT_EMOJI[p.categoria]||'👕'} ${safe(p.nombre)}</span>`)
        : `<span class="historial-piece" style="opacity:.4">Eliminada</span>`;
    }).join('');
    div.innerHTML = `<span class="historial-entry__date">${entry.fecha}</span><div class="historial-entry__prendas">${piezas}</div>`;
    list.appendChild(div);
  });
}

// ── OUTFITS SEMANA ───────────────────────────────────────────
function renderOutfitsSemana() {
  const cont = el('outfits-semana');
  const grid = document.createElement('div');
  grid.className = 'semana-grid';
  const hoy = new Date();
  for (let i=0; i<7; i++) {
    const d = new Date(hoy); d.setDate(hoy.getDate()+i);
    const isHoy = i===0, isManana = i===1;
    const ids = isHoy ? state.outfitHoy : isManana ? state.outfitManana : [];
    const piecesHtml = ids.length
      ? ids.map(id => {
          const p = state.prendas.find(x=>x.id===id);
          return p ? (p.foto
            ? `<img class="historial-thumb" src="${p.foto}" title="${safe(p.nombre)}" alt="${safe(p.nombre)}" />`
            : `<span class="historial-piece">${CAT_EMOJI[p.categoria]||'👕'} ${safe(p.nombre)}</span>`) : '';
        }).join('')
      : `<span style="font-size:12px;color:var(--t3)">Sin outfit${isHoy?' — agrega uno':''}</span>`;

    const day = document.createElement('div');
    day.className = 'semana-day'+(isHoy?' today':'');
    day.innerHTML = `
      <div class="semana-day__date">
        <div class="semana-day__dow">${d.toLocaleDateString('es',{weekday:'long'})}</div>
        <div class="semana-day__num">${d.toLocaleDateString('es',{day:'numeric',month:'short'})}</div>
      </div>
      <div class="semana-day__prendas">${piecesHtml}</div>`;
    grid.appendChild(day);
  }
  cont.innerHTML=''; cont.appendChild(grid);
}

// ── MODAL PRENDA ─────────────────────────────────────────────
function abrirModalPrenda(id=null) {
  editingId  = id;
  fotoBase64 = null;

  el('modal-prenda-title').textContent   = id ? 'Editar prenda' : 'Nueva prenda';
  el('btn-guardar-prenda').textContent   = id ? 'Guardar cambios' : 'Guardar prenda';

  // Reset foto UI
  const preview = el('foto-preview');
  preview.innerHTML = '<i class="ti ti-camera"></i><span>Toca para agregar foto</span>';
  el('foto-remove').setAttribute('hidden','');
  el('foto-input').value = '';

  if (id) {
    const p = state.prendas.find(x=>x.id===id);
    if (!p) return;
    el('prenda-nombre').value = p.nombre;
    el('prenda-color').value  = p.color  || '';
    el('prenda-marca').value  = p.marca  || '';
    el('prenda-notas').value  = p.notas  || '';
    qsa('.cat-btn',el('cat-grid')).forEach(b => b.classList.toggle('selected', b.dataset.cat===p.categoria));
    if (p.foto) {
      fotoBase64 = p.foto;
      mostrarFotoEnPreview(p.foto);
    }
  } else {
    el('prenda-nombre').value = '';
    el('prenda-color').value  = '';
    el('prenda-marca').value  = '';
    el('prenda-notas').value  = '';
    qsa('.cat-btn',el('cat-grid')).forEach((b,i) => b.classList.toggle('selected', i===0));
  }
  openModal('modal-prenda');
}

function mostrarFotoEnPreview(src) {
  const preview = el('foto-preview');
  preview.innerHTML = `<img src="${src}" alt="Foto de prenda" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" />`;
  el('foto-remove').removeAttribute('hidden');
}

function procesarFotoInput(file) {
  if (!file) return;
  // Comprimir imagen antes de guardar
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Max 800px de lado, calidad 0.75
      const max = 800;
      let w = img.width, h = img.height;
      if (w > h && w > max) { h = (h/w)*max; w = max; }
      else if (h > max)     { w = (w/h)*max; h = max; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      fotoBase64 = canvas.toDataURL('image/jpeg', 0.75);
      mostrarFotoEnPreview(fotoBase64);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function guardarPrenda() {
  const nombre = el('prenda-nombre').value.trim();
  if (!nombre) { el('prenda-nombre').focus(); toast('El nombre es obligatorio.','error'); return; }

  const cat   = qs('.cat-btn.selected',el('cat-grid'))?.dataset.cat || 'tops';
  const color = el('prenda-color').value.trim();
  const marca = el('prenda-marca').value.trim();
  const notas = el('prenda-notas').value.trim();

  if (editingId) {
    const p = state.prendas.find(x=>x.id===editingId);
    if (p) { p.nombre=nombre; p.categoria=cat; p.color=color; p.marca=marca; p.notas=notas; p.foto=fotoBase64||p.foto||null; }
    toast('Prenda actualizada.','success');
  } else {
    state.prendas.push({ id:uid(), nombre, categoria:cat, color, marca, notas, foto:fotoBase64||null, estado:'limpia', usos:0, createdAt:new Date().toISOString() });
    toast('Prenda agregada al armario.','success');
  }

  editingId = null; fotoBase64 = null;
  closeModal('modal-prenda');
  saveState(); renderAll();
}

// ── SELECTOR ─────────────────────────────────────────────────
function abrirSelector(mode='hoy') {
  ui.selectorMode   = mode;
  ui.selectorSel    = [...(mode==='hoy' ? state.outfitHoy : state.outfitManana)];
  ui.selectorCat    = 'todas';
  ui.selectorSearch = '';
  el('modal-selector-title').textContent = mode==='hoy' ? 'Outfit de hoy' : 'Outfit de mañana';
  el('selector-search-input').value = '';
  qsa('[data-selector-cat]').forEach(b => b.classList.toggle('active', b.dataset.selectorCat==='todas'));
  renderSelectorList();
  openModal('modal-selector');
}

function renderSelectorList() {
  const list = el('selector-list');
  list.innerHTML = '';
  const s = ui.selectorSearch.toLowerCase();
  const disponibles = state.prendas.filter(p => {
    if (p.estado==='sucia') return false;
    const okC = ui.selectorCat==='todas' || p.categoria===ui.selectorCat;
    const okS = !s || p.nombre.toLowerCase().includes(s) || (p.color||'').toLowerCase().includes(s);
    return okC && okS;
  });

  if (!disponibles.length) {
    list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--t3);font-size:13px">Sin prendas limpias disponibles.</div>';
    updateSelectorCount(); return;
  }

  disponibles.forEach(p => {
    const sel  = ui.selectorSel.includes(p.id);
    const item = document.createElement('div');
    item.className = 'selector-item'+(sel?' selected':'');
    item.dataset.id = p.id;

    const thumbHtml = p.foto
      ? `<img class="selector-item__thumb" src="${p.foto}" alt="${safe(p.nombre)}" />`
      : `<div class="selector-item__emoji">${CAT_EMOJI[p.categoria]||'👕'}</div>`;

    item.innerHTML = `
      ${thumbHtml}
      <span class="selector-item__name">${safe(p.nombre)}</span>
      <span class="selector-item__meta">${p.color||''}</span>
      <span class="selector-item__check"><i class="ti ti-check"></i></span>`;
    item.addEventListener('click', () => toggleSelectorItem(p.id, item));
    list.appendChild(item);
  });
  updateSelectorCount();
}

function toggleSelectorItem(id, itemEl) {
  if (ui.selectorSel.includes(id)) {
    ui.selectorSel = ui.selectorSel.filter(x=>x!==id);
    itemEl.classList.remove('selected');
  } else {
    ui.selectorSel.push(id);
    itemEl.classList.add('selected');
  }
  updateSelectorCount();
}

function updateSelectorCount() {
  el('selector-count').textContent = `${ui.selectorSel.length} seleccionada${ui.selectorSel.length!==1?'s':''}`;
}

function confirmarSelector() {
  const modo = ui.selectorMode;
  if (modo==='hoy') {
    // Revertir removidos
    state.outfitHoy.filter(id=>!ui.selectorSel.includes(id)).forEach(id => {
      const p = state.prendas.find(x=>x.id===id);
      if (p && p.estado==='usando') p.estado='limpia';
    });
    // Marcar nuevos
    ui.selectorSel.filter(id=>!state.outfitHoy.includes(id)).forEach(id => {
      const p = state.prendas.find(x=>x.id===id);
      if (p) { p.estado='usando'; p.usos=(p.usos||0)+1; }
    });
    state.outfitHoy = [...ui.selectorSel];

    if (state.outfitHoy.length && !state.horaCambio) {
      closeModal('modal-selector');
      saveState(); renderAll();
      setTimeout(()=>openModal('modal-hora'), 200);
      return;
    }
  } else {
    state.outfitManana = [...ui.selectorSel];
    toast('Outfit de mañana guardado.','success');
  }
  closeModal('modal-selector');
  saveState(); renderAll();
}

// ── HORA CAMBIO ──────────────────────────────────────────────
function guardarHoraCambio() {
  const val = el('hora-input').value;
  if (!val) return;
  state.horaCambio = val;
  closeModal('modal-hora');
  saveState(); renderAll();
  toast(`Hora de cambio: ${val}`,'success');
}

// ── ACCIONES PRENDAS ─────────────────────────────────────────
function limpiarPrenda(id) {
  const p = state.prendas.find(x=>x.id===id);
  if (!p) return;
  p.estado='limpia'; saveState(); renderAll();
  toast(`"${p.nombre}" marcada como limpia.`,'success');
}

function eliminarPrenda(id) {
  const p = state.prendas.find(x=>x.id===id);
  if (!p || !confirm(`¿Eliminar "${p.nombre}"?`)) return;
  state.prendas     = state.prendas.filter(x=>x.id!==id);
  state.outfitHoy   = state.outfitHoy.filter(x=>x!==id);
  state.outfitManana= state.outfitManana.filter(x=>x!==id);
  saveState(); renderAll();
  toast('Prenda eliminada.','info');
}

function lavarTodas() {
  const sucias = state.prendas.filter(p=>p.estado==='sucia');
  if (!sucias.length) return;
  sucias.forEach(p=>{ p.estado='limpia'; });
  saveState(); renderAll();
  toast(`${sucias.length} prenda${sucias.length!==1?'s':''} lavada${sucias.length!==1?'s':''}.`,'success');
}

// ── VER FOTO GRANDE ──────────────────────────────────────────
function verFoto(id) {
  const p = state.prendas.find(x=>x.id===id);
  if (!p || !p.foto) return;
  el('modal-foto-img').src = p.foto;
  el('modal-foto-nombre').textContent = p.nombre;
  openModal('modal-foto');
}

// ── EXPORT / IMPORT ──────────────────────────────────────────
function exportData() {
  // Exporta JSON completo (incluye fotos en Base64)
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data],{type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mi-armario-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Respaldo exportado (incluye fotos).','success');
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!Array.isArray(parsed.prendas)) throw new Error('Formato invalido');
      Object.assign(state, parsed);
      saveState(); renderAll();
      toast(`Importadas ${parsed.prendas.length} prendas.`,'success');
    } catch {
      toast('Archivo invalido. Usa el JSON exportado desde esta app.','error');
    }
  };
  reader.readAsText(file,'UTF-8');
}

// ── EVENT BINDING ────────────────────────────────────────────
function bindEvents() {

  // Nav
  qsa('.nav-item').forEach(b => b.addEventListener('click', ()=>setView(b.dataset.view)));

  // Close modals
  document.addEventListener('click', e => {
    const cb = e.target.closest('[data-close]');
    if (cb) closeModal(cb.dataset.close);
  });
  qsa('.modal-overlay').forEach(o => o.addEventListener('click', e => {
    if (e.target===o) { const m=qs('[id]',o); if(m) closeModal(m.id); }
  }));
  document.addEventListener('keydown', e => {
    if (e.key==='Escape') { const o=qs('.modal-overlay:not([hidden])'); if(o){const m=qs('[id]',o);if(m)closeModal(m.id);} }
  });

  // Cat buttons
  el('cat-grid').addEventListener('click', e => {
    const b = e.target.closest('.cat-btn');
    if (!b) return;
    qsa('.cat-btn',el('cat-grid')).forEach(x=>x.classList.remove('selected'));
    b.classList.add('selected');
  });

  // Foto zone: click abre selector de archivo
  el('foto-preview').addEventListener('click', ()=>el('foto-input').click());
  el('foto-input').addEventListener('change', e=>procesarFotoInput(e.target.files[0]));
  el('foto-remove').addEventListener('click', () => {
    fotoBase64 = null;
    el('foto-preview').innerHTML = '<i class="ti ti-camera"></i><span>Toca para agregar foto</span>';
    el('foto-remove').setAttribute('hidden','');
    el('foto-input').value='';
  });

  // Guardar prenda
  el('btn-guardar-prenda').addEventListener('click', guardarPrenda);
  el('prenda-nombre').addEventListener('keydown', e=>{ if(e.key==='Enter') guardarPrenda(); });

  // Nueva prenda
  el('btn-agregar-prenda').addEventListener('click', ()=>abrirModalPrenda());

  // Dashboard outfits
  el('btn-nuevo-outfit').addEventListener('click', ()=>abrirSelector('hoy'));
  el('btn-planificar-manana').addEventListener('click', ()=>abrirSelector('manana'));
  el('btn-confirmar-cambio').addEventListener('click', confirmarCambio);

  // Quitar pieza de outfit hoy
  el('outfit-hoy-piezas').addEventListener('click', e => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    const id = b.dataset.remove;
    state.outfitHoy = state.outfitHoy.filter(x=>x!==id);
    const p = state.prendas.find(x=>x.id===id);
    if (p && p.estado==='usando') p.estado='limpia';
    saveState(); renderAll();
  });

  // Acciones en grids (delegado)
  ['prendas-grid','lavanderia-grid'].forEach(gid => {
    el(gid).addEventListener('click', e => {
      const b = e.target.closest('[data-action]');
      if (b) {
        const {action,id} = b.dataset;
        if (action==='limpiar')  limpiarPrenda(id);
        if (action==='editar')   abrirModalPrenda(id);
        if (action==='eliminar') eliminarPrenda(id);
      }
      // Ver foto grande
      const fotoEl = e.target.closest('[data-view-foto]');
      if (fotoEl) verFoto(fotoEl.dataset.viewFoto);
    });
  });

  // Filtros prendas
  el('view-prendas').addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip[data-filter]');
    if (chip) {
      ui.filterEstado = chip.dataset.filter; ui.filterCat=null;
      qsa('.filter-chip[data-filter]',el('view-prendas')).forEach(c=>c.classList.toggle('active',c===chip));
      qsa('.filter-chip[data-filter-cat]',el('view-prendas')).forEach(c=>c.classList.remove('active'));
      renderPrendas(); return;
    }
    const catChip = e.target.closest('.filter-chip[data-filter-cat]');
    if (catChip) {
      const same = ui.filterCat===catChip.dataset.filterCat;
      ui.filterCat = same ? null : catChip.dataset.filterCat;
      qsa('.filter-chip[data-filter-cat]',el('view-prendas')).forEach(c=>c.classList.toggle('active',!same&&c===catChip));
      renderPrendas();
    }
  });

  // Search
  el('prendas-search').addEventListener('input', e=>{ ui.searchPrendas=e.target.value; renderPrendas(); });

  // Selector cats
  el('selector-cats').addEventListener('click', e => {
    const b = e.target.closest('[data-selector-cat]');
    if (!b) return;
    ui.selectorCat = b.dataset.selectorCat;
    qsa('[data-selector-cat]').forEach(x=>x.classList.toggle('active',x===b));
    renderSelectorList();
  });
  el('selector-search-input').addEventListener('input', e=>{ ui.selectorSearch=e.target.value; renderSelectorList(); });
  el('btn-confirmar-selector').addEventListener('click', confirmarSelector);

  // Hora
  el('btn-guardar-hora').addEventListener('click', guardarHoraCambio);
  el('hora-input').addEventListener('keydown', e=>{ if(e.key==='Enter') guardarHoraCambio(); });

  // Lavar todas
  el('btn-lavar-todas').addEventListener('click', lavarTodas);

  // Export / Import
  el('btn-export').addEventListener('click', exportData);
  el('btn-import').addEventListener('click', ()=>el('file-import').click());
  el('file-import').addEventListener('change', e=>{ importData(e.target.files[0]); e.target.value=''; });
}

// ── INIT ─────────────────────────────────────────────────────
function init() {
  loadState();
  bindEvents();
  renderAll();
  setView('dashboard');
  setInterval(checkHoraCambio, 60000);
}

document.addEventListener('DOMContentLoaded', init);
