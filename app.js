/* ============================================================
   MI ARMARIO — app.js
   IA de rotacion: sugiere outfits evitando repeticion reciente
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
  historial:    [],   // [{fecha, prendas:[id,...]}]
};
let editingId  = null;
let fotoBase64 = null;

let ui = {
  filterEstado:'todas', filterCat:null, searchPrendas:'',
  selectorMode:'hoy', selectorSel:[], selectorCat:'todas', selectorSearch:'',
};

// ── PERSISTENCE ──────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch(e) { console.warn('loadState error', e); }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e) { toast('Almacenamiento lleno. Exporta un respaldo.','error',4000); }
}

// ── UTILS ────────────────────────────────────────────────────
const uid  = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
const el   = id => document.getElementById(id);
const qs   = (s,c=document) => c.querySelector(s);
const qsa  = (s,c=document) => [...c.querySelectorAll(s)];
const safe = str => { const d=document.createElement('div'); d.textContent=str; return d.innerHTML; };

function fechaHoy() {
  return new Date().toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
function fechaCorta(d=new Date()) {
  return d.toLocaleDateString('es',{weekday:'short',day:'numeric',month:'short'});
}
function saludo() {
  const h=new Date().getHours();
  return h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches';
}

// Cuantos dias hace que se uso una prenda (basado en historial)
function diasDesdeUso(id) {
  for (let i=0; i<state.historial.length; i++) {
    if (state.historial[i].prendas.includes(id)) return i;
  }
  return 999; // nunca usada
}

// Puntaje de rotacion: mas alto = mas urgente ponerse
// Factores: dias sin usar (principal) + penalizacion por uso reciente + bonus a las nunca usadas
function calcularPuntaje(p) {
  const dias  = diasDesdeUso(p.id);
  const usos  = p.usos || 0;

  // Penalizacion fuerte si se uso hace menos de 3 dias
  if (dias === 0) return -100;
  if (dias === 1) return -50;
  if (dias === 2) return -10;

  // Nunca usada: prioridad alta para estrenarla
  if (dias === 999) return 80 + Math.max(0, 10 - usos);

  // Normal: mas dias sin usar = mas puntaje
  // Tambien favorece las menos usadas en empate
  return dias * 10 + Math.max(0, 20 - usos);
}

// ── TOAST ────────────────────────────────────────────────────
function toast(msg, type='info', dur=2800) {
  const icons={success:'ti-circle-check',error:'ti-alert-circle',info:'ti-info-circle',warn:'ti-alert-triangle'};
  const t=document.createElement('div');
  t.className=`toast toast--${type}`;
  t.innerHTML=`<i class="ti ${icons[type]||icons.info}"></i><span>${msg}</span>`;
  el('toast-container').appendChild(t);
  setTimeout(()=>{ t.classList.add('removing'); t.addEventListener('animationend',()=>t.remove(),{once:true}); },dur);
}

// ── MODALS ───────────────────────────────────────────────────
function openModal(id) {
  el(id).removeAttribute('hidden');
  const first=qs('input:not([type=hidden]):not([type=file]),textarea',el(id));
  if(first) setTimeout(()=>first.focus(),80);
}
function closeModal(id) { el(id).setAttribute('hidden',''); }

// ── NAV ──────────────────────────────────────────────────────
function setView(name) {
  qsa('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  qsa('.view').forEach(s=>{ const on=s.id===`view-${name}`; s.toggleAttribute('hidden',!on); });
  if(name==='prendas')    renderPrendas();
  if(name==='lavanderia') renderLavanderia();
  if(name==='historial')  renderHistorial();
  if(name==='outfits')    renderOutfitsSemana();
}

// ── HORA CAMBIO ──────────────────────────────────────────────
function checkHoraCambio() {
  if(!state.horaCambio||!state.outfitHoy.length){ el('alert-cambio').setAttribute('hidden',''); return; }
  const [h,m]=state.horaCambio.split(':').map(Number);
  const cambio=new Date(); cambio.setHours(h,m,0,0);
  const diff=Date.now()-cambio;
  if(diff>=0&&diff<5400000) el('alert-cambio').removeAttribute('hidden');
  else el('alert-cambio').setAttribute('hidden','');
}

function confirmarCambio() {
  state.historial.unshift({fecha:fechaCorta(),iso:new Date().toISOString(),prendas:[...state.outfitHoy]});
  if(state.historial.length>90) state.historial.length=90;
  state.outfitHoy.forEach(id=>{ const p=state.prendas.find(x=>x.id===id); if(p) p.estado='sucia'; });
  if(state.outfitManana.length) {
    state.outfitHoy=[...state.outfitManana];
    state.outfitManana.forEach(id=>{ const p=state.prendas.find(x=>x.id===id); if(p){p.estado='usando';p.usos=(p.usos||0)+1;} });
    state.outfitManana=[];
    toast('Outfit de mañana activado.','success');
  } else {
    state.outfitHoy=[];
    toast('Prendas enviadas a lavandería.','info');
  }
  el('alert-cambio').setAttribute('hidden','');
  saveState(); renderAll();
  // Despues de confirmar, revisar alertas de stock
  setTimeout(revisarAlertasStock, 500);
}

// ── ALERTAS DE STOCK ─────────────────────────────────────────
function revisarAlertasStock() {
  const grupos = {};
  state.prendas.forEach(p => {
    if(!grupos[p.categoria]) grupos[p.categoria]={limpia:0,sucia:0,usando:0};
    grupos[p.categoria][p.estado]++;
  });

  const alertas = [];
  Object.entries(grupos).forEach(([cat,counts]) => {
    const total = counts.limpia+counts.sucia+counts.usando;
    if(total===0) return;
    // Alerta: quedan 1 o menos limpias
    if(counts.limpia<=1 && counts.sucia>=2) {
      alertas.push(`⚠️ ${CAT_EMOJI[cat]} ${CAT_LABEL[cat]}: solo ${counts.limpia} limpia${counts.limpia!==1?'s':''}. Hora de lavar.`);
    }
  });

  if(alertas.length) {
    const cont = el('alertas-stock');
    cont.innerHTML = alertas.map(a=>`<div class="alert-stock">${a}</div>`).join('');
    cont.removeAttribute('hidden');
  }
}

// ── IA: GENERAR OUTFIT SUGERIDO ──────────────────────────────
/* ── MOTOR DE ROTACION INTELIGENTE (sin IA externa) ──────────
   Logica pura basada en historial de uso:
   - Puntua cada prenda por dias sin usar (mas dias = mayor prioridad)
   - Penaliza prendas usadas hace menos de 3 dias
   - Penaliza prendas con muchos usos totales (para cuidar la ropa)
   - Selecciona 1 top/franela + 1 short/pantalon
   - Genera alertas de stock automaticamente
─────────────────────────────────────────────────────────── */
function calcularPuntaje(prenda) {
  const dias = diasDesdeUso(prenda.id);
  const usos  = prenda.usos || 0;

  // Base: dias sin usar (mas es mejor)
  let puntaje = dias === 999 ? 100 : dias;

  // Penalizacion fuerte si se uso hace menos de 3 dias
  if (dias < 3) puntaje -= 50;

  // Penalizacion leve por uso total (evitar desgastar una sola prenda)
  puntaje -= usos * 0.5;

  // Pequeño factor aleatorio para que no sea siempre igual si hay empate
  puntaje += Math.random() * 0.5;

  return puntaje;
}

function generarOutfitIA() {
  const limpias = state.prendas.filter(p => p.estado === 'limpia');
  if (!limpias.length) { toast('No hay prendas limpias disponibles.','error'); return; }

  // Abrir modal y mostrar resultado inmediato (sin loading, es instantaneo)
  el('modal-ia').removeAttribute('hidden');
  el('ia-loading').setAttribute('hidden','');
  el('ia-resultado').removeAttribute('hidden');
  el('ia-error').setAttribute('hidden','');

  // Categorias principales (franelas y shorts para uso en casa)
  const TOPS   = ['tops', 'vestido'];
  const BOTTOMS = ['short', 'pantalon'];

  // Ordenar cada grupo por puntaje descendente
  const tops    = limpias.filter(p => TOPS.includes(p.categoria))
                         .sort((a,b) => calcularPuntaje(b) - calcularPuntaje(a));
  const bottoms = limpias.filter(p => BOTTOMS.includes(p.categoria))
                         .sort((a,b) => calcularPuntaje(b) - calcularPuntaje(a));
  const otros   = limpias.filter(p => !TOPS.includes(p.categoria) && !BOTTOMS.includes(p.categoria))
                         .sort((a,b) => calcularPuntaje(b) - calcularPuntaje(a));

  const seleccion = [];
  const razones   = [];
  const alertas   = [];

  // Elegir mejor top
  if (tops.length) {
    const t = tops[0];
    seleccion.push(t.id);
    const d = diasDesdeUso(t.id);
    razones.push(d === 999 ? `${t.nombre} nunca ha sido usada` : d >= 3 ? `${t.nombre} lleva ${d} días guardada` : `${t.nombre} es la mejor opción disponible`);
  } else {
    alertas.push('⚠️ No tienes franelas/tops limpias. Hora de lavar.');
  }

  // Elegir mejor bottom
  if (bottoms.length) {
    const b = bottoms[0];
    seleccion.push(b.id);
    const d = diasDesdeUso(b.id);
    razones.push(d === 999 ? `${b.nombre} nunca ha sido usada` : d >= 3 ? `${b.nombre} lleva ${d} días guardada` : `${b.nombre} es el mejor short/pantalon disponible`);
  } else {
    alertas.push('⚠️ No tienes shorts/pantalones limpios. Revisa lavandería.');
  }

  // Si no hay ni tops ni bottoms, tomar lo que haya
  if (!seleccion.length && otros.length) {
    seleccion.push(otros[0].id);
    razones.push(`${otros[0].nombre} es lo que está disponible`);
  }

  // Alertas de stock bajo (quedan 1 o menos limpias en una categoria con stock)
  const gruposTops    = state.prendas.filter(p => TOPS.includes(p.categoria));
  const gruposBottoms = state.prendas.filter(p => BOTTOMS.includes(p.categoria));
  const limTops    = gruposTops.filter(p => p.estado === 'limpia').length;
  const limBottoms = gruposBottoms.filter(p => p.estado === 'limpia').length;

  if (gruposTops.length > 1 && limTops <= 1)
    alertas.push(`⚠️ Solo te queda ${limTops} franela limpia. Lava pronto.`);
  if (gruposBottoms.length > 1 && limBottoms <= 1)
    alertas.push(`⚠️ Solo te queda ${limBottoms} short/pantalon limpio. Lava pronto.`);

  // Renderizar prendas seleccionadas
  const cont = el('ia-prendas');
  cont.innerHTML = '';
  seleccion.forEach(id => {
    const p = state.prendas.find(x => x.id === id);
    if (!p) return;
    const d = diasDesdeUso(id);
    const dLabel = d===999 ? 'nunca usada' : d===0 ? 'usada hoy' : d===1 ? 'usada ayer' : `hace ${d} días`;
    const div = document.createElement('div');
    div.className = 'ia-prenda-item';
    div.innerHTML = `
      ${p.foto
        ? `<img class="ia-thumb" src="${p.foto}" alt="${safe(p.nombre)}" />`
        : `<div class="ia-emoji">${CAT_EMOJI[p.categoria]||'👕'}</div>`}
      <div class="ia-prenda-info">
        <div class="ia-prenda-nombre">${safe(p.nombre)}</div>
        <div class="ia-prenda-meta">${safe(p.color || CAT_LABEL[p.categoria] || '')} · ${dLabel}</div>
      </div>`;
    cont.appendChild(div);
  });

  // Razon en texto natural
  el('ia-razon').textContent = razones.join('. ') + '.';

  // Alertas
  const alertaEl = el('ia-alerta');
  if (alertas.length) {
    alertaEl.innerHTML = alertas.join('<br>');
    alertaEl.removeAttribute('hidden');
  } else {
    alertaEl.setAttribute('hidden','');
  }

  el('btn-usar-sugerencia').dataset.ids = JSON.stringify(seleccion);
}

function usarSugerenciaIA() {
  const ids = JSON.parse(el('btn-usar-sugerencia').dataset.ids || '[]');
  if(!ids.length) return;

  // Revertir outfit actual si existia
  state.outfitHoy.forEach(id=>{
    const p=state.prendas.find(x=>x.id===id);
    if(p&&p.estado==='usando') p.estado='limpia';
  });

  state.outfitHoy = ids;
  ids.forEach(id=>{
    const p=state.prendas.find(x=>x.id===id);
    if(p){ p.estado='usando'; p.usos=(p.usos||0)+1; }
  });

  closeModal('modal-ia');

  if(!state.horaCambio) {
    saveState(); renderAll();
    setTimeout(()=>openModal('modal-hora'),200);
    return;
  }
  saveState(); renderAll();
  toast('Outfit del dia activado.','success');
}

// ── RENDER ALL ───────────────────────────────────────────────
function renderAll() {
  renderDashboard();
  renderPrendas();
  renderLavanderia();
  renderHistorial();
  updateNavBadge();
  revisarAlertasStock();
}

// ── DASHBOARD ────────────────────────────────────────────────
function renderDashboard() {
  el('saludo-title').textContent = saludo();
  el('fecha-hoy').textContent    = fechaHoy();
  el('stat-limpias').textContent = state.prendas.filter(p=>p.estado==='limpia').length;
  el('stat-usando').textContent  = state.prendas.filter(p=>p.estado==='usando').length;
  el('stat-sucias').textContent  = state.prendas.filter(p=>p.estado==='sucia').length;
  el('stat-total').textContent   = state.prendas.length;

  const chip=el('hora-cambio-chip');
  if(state.horaCambio){ chip.textContent=`⏰ cambio ${state.horaCambio}`; chip.removeAttribute('hidden'); }
  else chip.setAttribute('hidden','');

  checkHoraCambio();
  renderOutfitStrip('outfit-hoy-piezas','outfit-hoy-empty',state.outfitHoy,true);
  renderOutfitStrip('outfit-manana-piezas','outfit-manana-empty',state.outfitManana,false);
}

function renderOutfitStrip(piecesId, emptyId, ids, canRemove) {
  const cont=el(piecesId), empty=el(emptyId);
  cont.innerHTML='';
  if(!ids.length){ empty.removeAttribute('hidden'); return; }
  empty.setAttribute('hidden','');
  ids.forEach(id=>{
    const p=state.prendas.find(x=>x.id===id); if(!p) return;
    const div=document.createElement('div');
    div.className='outfit-piece';
    div.innerHTML=`
      ${p.foto?`<img class="outfit-piece__thumb" src="${p.foto}" alt="${safe(p.nombre)}" />`:`<span class="outfit-piece__emoji">${CAT_EMOJI[p.categoria]||'👕'}</span>`}
      <span class="outfit-piece__name">${safe(p.nombre)}</span>
      ${canRemove?`<button class="outfit-piece__remove" data-remove="${id}"><i class="ti ti-x"></i></button>`:''}`;
    cont.appendChild(div);
  });
}

function updateNavBadge() {
  const n=state.prendas.filter(p=>p.estado==='sucia').length;
  const b=el('nav-badge-lavanderia');
  b.textContent=n; b.style.display=n?'':'none';
}

// ── PRENDAS ──────────────────────────────────────────────────
function getPrendasFiltradas() {
  return state.prendas.filter(p=>{
    const okE=ui.filterEstado==='todas'||p.estado===ui.filterEstado;
    const okC=!ui.filterCat||p.categoria===ui.filterCat;
    const s=ui.searchPrendas.toLowerCase();
    const okS=!s||p.nombre.toLowerCase().includes(s)||(p.color||'').toLowerCase().includes(s)||(p.marca||'').toLowerCase().includes(s);
    return okE&&okC&&okS;
  });
}

function renderPrendas() {
  const grid=el('prendas-grid'), list=getPrendasFiltradas();
  el('prendas-count').textContent=`${state.prendas.length} prendas · ${list.length} visibles`;
  grid.innerHTML='';
  if(!list.length){
    grid.innerHTML=`<div class="empty-state"><i class="ti ti-hanger"></i><p>${!state.prendas.length?'Armario vacio. Agrega tu primera prenda!':'Sin prendas con ese filtro.'}</p></div>`;
    return;
  }
  list.forEach(p=>{
    const card=document.createElement('div'); card.className='prenda-card';
    const badgeCls={limpia:'badge--clean',usando:'badge--using',sucia:'badge--dirty'}[p.estado];
    const dias=diasDesdeUso(p.id);
    const diasLabel=dias===999?'':dias===0?'usada hoy':dias===1?'usada ayer':`hace ${dias} días`;
    const lavarBtn=p.estado==='sucia'?`<button class="btn btn--success btn--sm btn--icon" data-action="limpiar" data-id="${p.id}" title="Lavar"><i class="ti ti-wash"></i></button>`:'';
    card.innerHTML=`
      ${p.foto?`<img class="prenda-card__foto" src="${p.foto}" alt="${safe(p.nombre)}" data-view-foto="${p.id}" />`:`<div class="prenda-card__emoji-box">${CAT_EMOJI[p.categoria]||'👕'}</div>`}
      <div class="prenda-card__body">
        <div class="prenda-card__name">${safe(p.nombre)}</div>
        <div class="prenda-card__meta">
          ${p.color?`<span>${safe(p.color)}</span>`:''}
          ${p.marca?`<span>${safe(p.marca)}</span>`:''}
          ${diasLabel?`<span>${diasLabel}</span>`:''}
        </div>
        <div class="prenda-card__footer">
          <span class="badge ${badgeCls}">${STATUS_LABEL[p.estado]}</span>
          <div class="prenda-card__actions">
            ${lavarBtn}
            <button class="btn btn--ghost btn--sm btn--icon" data-action="editar" data-id="${p.id}"><i class="ti ti-pencil"></i></button>
            <button class="btn btn--danger btn--sm btn--icon" data-action="eliminar" data-id="${p.id}"><i class="ti ti-trash"></i></button>
          </div>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

// ── LAVANDERÍA ───────────────────────────────────────────────
function renderLavanderia() {
  const grid=el('lavanderia-grid'), sucias=state.prendas.filter(p=>p.estado==='sucia');
  el('lavanderia-count').textContent=`${sucias.length} prenda${sucias.length!==1?'s':''} para lavar`;
  grid.innerHTML='';
  if(!sucias.length){ grid.innerHTML=`<div class="empty-state"><i class="ti ti-sparkles"></i><p>Todo limpio.</p></div>`; return; }
  sucias.forEach(p=>{
    const card=document.createElement('div'); card.className='prenda-card';
    card.innerHTML=`
      ${p.foto?`<img class="prenda-card__foto" src="${p.foto}" alt="${safe(p.nombre)}" />`:`<div class="prenda-card__emoji-box">${CAT_EMOJI[p.categoria]||'👕'}</div>`}
      <div class="prenda-card__body">
        <div class="prenda-card__name">${safe(p.nombre)}</div>
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
  const list=el('historial-list'); list.innerHTML='';
  if(!state.historial.length){ list.innerHTML=`<div class="empty-state"><i class="ti ti-history"></i><p>El historial aparecera aqui al confirmar cambios.</p></div>`; return; }
  state.historial.slice(0,40).forEach(entry=>{
    const div=document.createElement('div'); div.className='historial-entry';
    const piezas=entry.prendas.map(id=>{
      const p=state.prendas.find(x=>x.id===id);
      return p?(p.foto?`<img class="historial-thumb" src="${p.foto}" title="${safe(p.nombre)}" alt="${safe(p.nombre)}" />`:`<span class="historial-piece">${CAT_EMOJI[p.categoria]||'👕'} ${safe(p.nombre)}</span>`):`<span class="historial-piece" style="opacity:.4">Eliminada</span>`;
    }).join('');
    div.innerHTML=`<span class="historial-entry__date">${entry.fecha}</span><div class="historial-entry__prendas">${piezas}</div>`;
    list.appendChild(div);
  });
}

// ── OUTFITS SEMANA ───────────────────────────────────────────
function renderOutfitsSemana() {
  const cont=el('outfits-semana'), grid=document.createElement('div');
  grid.className='semana-grid';
  const hoy=new Date();
  for(let i=0;i<7;i++){
    const d=new Date(hoy); d.setDate(hoy.getDate()+i);
    const isHoy=i===0,isManana=i===1;
    const ids=isHoy?state.outfitHoy:isManana?state.outfitManana:[];
    const piecesHtml=ids.length?ids.map(id=>{const p=state.prendas.find(x=>x.id===id);return p?(p.foto?`<img class="historial-thumb" src="${p.foto}" title="${safe(p.nombre)}" alt="${safe(p.nombre)}" />`:`<span class="historial-piece">${CAT_EMOJI[p.categoria]||'👕'} ${safe(p.nombre)}</span>`):'';}).join(''):`<span style="font-size:12px;color:var(--t3)">Sin outfit${isHoy?' — usa la IA':''}</span>`;
    const day=document.createElement('div'); day.className='semana-day'+(isHoy?' today':'');
    day.innerHTML=`<div class="semana-day__date"><div class="semana-day__dow">${d.toLocaleDateString('es',{weekday:'long'})}</div><div class="semana-day__num">${d.toLocaleDateString('es',{day:'numeric',month:'short'})}</div></div><div class="semana-day__prendas">${piecesHtml}</div>`;
    grid.appendChild(day);
  }
  cont.innerHTML=''; cont.appendChild(grid);
}

// ── MODAL PRENDA ─────────────────────────────────────────────
function abrirModalPrenda(id=null) {
  editingId=id; fotoBase64=null;
  el('modal-prenda-title').textContent=id?'Editar prenda':'Nueva prenda';
  el('btn-guardar-prenda').textContent=id?'Guardar cambios':'Guardar prenda';
  const preview=el('foto-preview');
  preview.innerHTML='<i class="ti ti-camera"></i><span>Toca para agregar foto</span>';
  el('foto-remove').setAttribute('hidden','');
  el('foto-input').value='';
  if(id){
    const p=state.prendas.find(x=>x.id===id); if(!p) return;
    el('prenda-nombre').value=p.nombre; el('prenda-color').value=p.color||''; el('prenda-marca').value=p.marca||''; el('prenda-notas').value=p.notas||'';
    qsa('.cat-btn',el('cat-grid')).forEach(b=>b.classList.toggle('selected',b.dataset.cat===p.categoria));
    if(p.foto){ fotoBase64=p.foto; mostrarFotoEnPreview(p.foto); }
  } else {
    el('prenda-nombre').value=''; el('prenda-color').value=''; el('prenda-marca').value=''; el('prenda-notas').value='';
    qsa('.cat-btn',el('cat-grid')).forEach((b,i)=>b.classList.toggle('selected',i===0));
  }
  openModal('modal-prenda');
}

function mostrarFotoEnPreview(src) {
  el('foto-preview').innerHTML=`<img src="${src}" alt="foto" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" />`;
  el('foto-remove').removeAttribute('hidden');
}

function procesarFotoInput(file) {
  if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const canvas=document.createElement('canvas');
      const max=800; let w=img.width,h=img.height;
      if(w>h&&w>max){h=(h/w)*max;w=max;}else if(h>max){w=(w/h)*max;h=max;}
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      fotoBase64=canvas.toDataURL('image/jpeg',0.75);
      mostrarFotoEnPreview(fotoBase64);
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}

function guardarPrenda() {
  const nombre=el('prenda-nombre').value.trim();
  if(!nombre){ el('prenda-nombre').focus(); toast('El nombre es obligatorio.','error'); return; }
  const cat=qs('.cat-btn.selected',el('cat-grid'))?.dataset.cat||'tops';
  const color=el('prenda-color').value.trim(), marca=el('prenda-marca').value.trim(), notas=el('prenda-notas').value.trim();
  if(editingId){
    const p=state.prendas.find(x=>x.id===editingId);
    if(p){ p.nombre=nombre; p.categoria=cat; p.color=color; p.marca=marca; p.notas=notas; p.foto=fotoBase64||p.foto||null; }
    toast('Prenda actualizada.','success');
  } else {
    state.prendas.push({id:uid(),nombre,categoria:cat,color,marca,notas,foto:fotoBase64||null,estado:'limpia',usos:0,createdAt:new Date().toISOString()});
    toast('Prenda agregada.','success');
  }
  editingId=null; fotoBase64=null;
  closeModal('modal-prenda'); saveState(); renderAll();
}

// ── SELECTOR MANUAL ──────────────────────────────────────────
function abrirSelector(mode='hoy') {
  ui.selectorMode=mode; ui.selectorSel=[...(mode==='hoy'?state.outfitHoy:state.outfitManana)];
  ui.selectorCat='todas'; ui.selectorSearch='';
  el('modal-selector-title').textContent=mode==='hoy'?'Outfit de hoy (manual)':'Outfit de manana';
  el('selector-search-input').value='';
  qsa('[data-selector-cat]').forEach(b=>b.classList.toggle('active',b.dataset.selectorCat==='todas'));
  renderSelectorList(); openModal('modal-selector');
}

function renderSelectorList() {
  const list=el('selector-list'); list.innerHTML='';
  const s=ui.selectorSearch.toLowerCase();
  const disponibles=state.prendas.filter(p=>{
    if(p.estado==='sucia') return false;
    const okC=ui.selectorCat==='todas'||p.categoria===ui.selectorCat;
    const okS=!s||p.nombre.toLowerCase().includes(s)||(p.color||'').toLowerCase().includes(s);
    return okC&&okS;
  });
  if(!disponibles.length){ list.innerHTML='<div style="text-align:center;padding:24px;color:var(--t3);font-size:13px">Sin prendas limpias.</div>'; updateSelectorCount(); return; }
  disponibles.forEach(p=>{
    const sel=ui.selectorSel.includes(p.id);
    const item=document.createElement('div'); item.className='selector-item'+(sel?' selected':''); item.dataset.id=p.id;
    const dias=diasDesdeUso(p.id);
    const diasLabel=dias===999?'nunca usada':dias===0?'hoy':dias===1?'ayer':`hace ${dias}d`;
    item.innerHTML=`
      ${p.foto?`<img class="selector-item__thumb" src="${p.foto}" alt="${safe(p.nombre)}" />`:`<div class="selector-item__emoji">${CAT_EMOJI[p.categoria]||'👕'}</div>`}
      <span class="selector-item__name">${safe(p.nombre)}</span>
      <span class="selector-item__meta">${diasLabel}</span>
      <span class="selector-item__check"><i class="ti ti-check"></i></span>`;
    item.addEventListener('click',()=>toggleSelectorItem(p.id,item));
    list.appendChild(item);
  });
  updateSelectorCount();
}

function toggleSelectorItem(id,itemEl) {
  if(ui.selectorSel.includes(id)){ ui.selectorSel=ui.selectorSel.filter(x=>x!==id); itemEl.classList.remove('selected'); }
  else { ui.selectorSel.push(id); itemEl.classList.add('selected'); }
  updateSelectorCount();
}
function updateSelectorCount() { el('selector-count').textContent=`${ui.selectorSel.length} seleccionada${ui.selectorSel.length!==1?'s':''}`; }

function confirmarSelector() {
  const modo=ui.selectorMode;
  if(modo==='hoy'){
    state.outfitHoy.filter(id=>!ui.selectorSel.includes(id)).forEach(id=>{ const p=state.prendas.find(x=>x.id===id); if(p&&p.estado==='usando') p.estado='limpia'; });
    ui.selectorSel.filter(id=>!state.outfitHoy.includes(id)).forEach(id=>{ const p=state.prendas.find(x=>x.id===id); if(p){p.estado='usando';p.usos=(p.usos||0)+1;} });
    state.outfitHoy=[...ui.selectorSel];
    if(state.outfitHoy.length&&!state.horaCambio){ closeModal('modal-selector'); saveState(); renderAll(); setTimeout(()=>openModal('modal-hora'),200); return; }
  } else {
    state.outfitManana=[...ui.selectorSel]; toast('Outfit de manana guardado.','success');
  }
  closeModal('modal-selector'); saveState(); renderAll();
}

// ── HORA ─────────────────────────────────────────────────────
function guardarHoraCambio() {
  const val=el('hora-input').value; if(!val) return;
  state.horaCambio=val; closeModal('modal-hora'); saveState(); renderAll();
  toast(`Hora de cambio: ${val}`,'success');
}

// ── ACCIONES ─────────────────────────────────────────────────
function limpiarPrenda(id) {
  const p=state.prendas.find(x=>x.id===id); if(!p) return;
  p.estado='limpia'; saveState(); renderAll(); toast(`"${p.nombre}" limpia.`,'success');
}
function eliminarPrenda(id) {
  const p=state.prendas.find(x=>x.id===id);
  if(!p||!confirm(`Eliminar "${p.nombre}"?`)) return;
  state.prendas=state.prendas.filter(x=>x.id!==id);
  state.outfitHoy=state.outfitHoy.filter(x=>x!==id);
  state.outfitManana=state.outfitManana.filter(x=>x!==id);
  saveState(); renderAll(); toast('Prenda eliminada.','info');
}
function lavarTodas() {
  const s=state.prendas.filter(p=>p.estado==='sucia'); if(!s.length) return;
  s.forEach(p=>p.estado='limpia'); saveState(); renderAll();
  toast(`${s.length} prenda${s.length!==1?'s':''} lavada${s.length!==1?'s':''}.`,'success');
}
function verFoto(id) {
  const p=state.prendas.find(x=>x.id===id); if(!p||!p.foto) return;
  el('modal-foto-img').src=p.foto; el('modal-foto-nombre').textContent=p.nombre; openModal('modal-foto');
}

// ── EXPORT / IMPORT ──────────────────────────────────────────
function exportData() {
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=`mi-armario-${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('Respaldo exportado (incluye fotos).','success');
}
function importData(file) {
  if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try {
      const parsed=JSON.parse(e.target.result);
      if(!Array.isArray(parsed.prendas)) throw new Error();
      Object.assign(state,parsed); saveState(); renderAll();
      toast(`Importadas ${parsed.prendas.length} prendas.`,'success');
    } catch { toast('Archivo invalido. Usa el JSON exportado desde esta app.','error'); }
  };
  reader.readAsText(file,'UTF-8');
}

// ── EVENTS ───────────────────────────────────────────────────
function bindEvents() {
  qsa('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));

  document.addEventListener('click',e=>{
    const cb=e.target.closest('[data-close]'); if(cb) closeModal(cb.dataset.close);
  });
  qsa('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===o){ const m=qs('[id]',o); if(m) closeModal(m.id); } }));
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ const o=qs('.modal-overlay:not([hidden])'); if(o){const m=qs('[id]',o);if(m)closeModal(m.id);} } });

  el('cat-grid').addEventListener('click',e=>{ const b=e.target.closest('.cat-btn'); if(!b) return; qsa('.cat-btn',el('cat-grid')).forEach(x=>x.classList.remove('selected')); b.classList.add('selected'); });

  el('foto-preview').addEventListener('click',()=>el('foto-input').click());
  el('foto-input').addEventListener('change',e=>procesarFotoInput(e.target.files[0]));
  el('foto-remove').addEventListener('click',()=>{ fotoBase64=null; el('foto-preview').innerHTML='<i class="ti ti-camera"></i><span>Toca para agregar foto</span>'; el('foto-remove').setAttribute('hidden',''); el('foto-input').value=''; });

  el('btn-guardar-prenda').addEventListener('click',guardarPrenda);
  el('prenda-nombre').addEventListener('keydown',e=>{ if(e.key==='Enter') guardarPrenda(); });
  el('btn-agregar-prenda').addEventListener('click',()=>abrirModalPrenda());

  // Botones principales dashboard
  el('btn-ia-outfit').addEventListener('click', generarOutfitIA);
  el('btn-manual-outfit').addEventListener('click',()=>abrirSelector('hoy'));
  el('btn-planificar-manana').addEventListener('click',()=>abrirSelector('manana'));
  el('btn-confirmar-cambio').addEventListener('click',confirmarCambio);

  // Modal IA
  el('btn-usar-sugerencia').addEventListener('click',usarSugerenciaIA);
  el('btn-ia-reintentar').addEventListener('click',generarOutfitIA);
  el('btn-ia-manual').addEventListener('click',()=>{ closeModal('modal-ia'); abrirSelector('hoy'); });

  el('outfit-hoy-piezas').addEventListener('click',e=>{
    const b=e.target.closest('[data-remove]'); if(!b) return;
    const id=b.dataset.remove; state.outfitHoy=state.outfitHoy.filter(x=>x!==id);
    const p=state.prendas.find(x=>x.id===id); if(p&&p.estado==='usando') p.estado='limpia';
    saveState(); renderAll();
  });

  ['prendas-grid','lavanderia-grid'].forEach(gid=>{
    el(gid).addEventListener('click',e=>{
      const b=e.target.closest('[data-action]');
      if(b){ const{action,id}=b.dataset; if(action==='limpiar')limpiarPrenda(id); if(action==='editar')abrirModalPrenda(id); if(action==='eliminar')eliminarPrenda(id); }
      const f=e.target.closest('[data-view-foto]'); if(f) verFoto(f.dataset.viewFoto);
    });
  });

  el('view-prendas').addEventListener('click',e=>{
    const chip=e.target.closest('.filter-chip[data-filter]');
    if(chip){ ui.filterEstado=chip.dataset.filter; ui.filterCat=null; qsa('.filter-chip[data-filter]',el('view-prendas')).forEach(c=>c.classList.toggle('active',c===chip)); qsa('.filter-chip[data-filter-cat]',el('view-prendas')).forEach(c=>c.classList.remove('active')); renderPrendas(); return; }
    const cc=e.target.closest('.filter-chip[data-filter-cat]');
    if(cc){ const same=ui.filterCat===cc.dataset.filterCat; ui.filterCat=same?null:cc.dataset.filterCat; qsa('.filter-chip[data-filter-cat]',el('view-prendas')).forEach(c=>c.classList.toggle('active',!same&&c===cc)); renderPrendas(); }
  });

  el('prendas-search').addEventListener('input',e=>{ ui.searchPrendas=e.target.value; renderPrendas(); });

  el('selector-cats').addEventListener('click',e=>{ const b=e.target.closest('[data-selector-cat]'); if(!b) return; ui.selectorCat=b.dataset.selectorCat; qsa('[data-selector-cat]').forEach(x=>x.classList.toggle('active',x===b)); renderSelectorList(); });
  el('selector-search-input').addEventListener('input',e=>{ ui.selectorSearch=e.target.value; renderSelectorList(); });
  el('btn-confirmar-selector').addEventListener('click',confirmarSelector);

  el('btn-guardar-hora').addEventListener('click',guardarHoraCambio);
  el('hora-input').addEventListener('keydown',e=>{ if(e.key==='Enter') guardarHoraCambio(); });

  el('btn-lavar-todas').addEventListener('click',lavarTodas);
  el('btn-export').addEventListener('click',exportData);
  el('btn-import').addEventListener('click',()=>el('file-import').click());
  el('file-import').addEventListener('change',e=>{ importData(e.target.files[0]); e.target.value=''; });
}

// ── INIT ─────────────────────────────────────────────────────
function init() {
  loadState(); bindEvents(); renderAll(); setView('dashboard');
  setInterval(checkHoraCambio,60000);
}
document.addEventListener('DOMContentLoaded',init);
