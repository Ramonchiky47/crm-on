function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function eliminarYRecargar(url, recargar) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : error.error || res.statusText));
    return;
  }
  recargar();
}

// ---------- Cargas masivas por CSV (productos, contactos) ----------

// Intenta UTF-8 estricto; si el archivo no es UTF-8 valido (comun en CSV exportados
// de Excel en Windows), usa windows-1252 para no corromper acentos y ñ en "�".
async function leerArchivoComoTexto(archivo) {
  const buffer = await archivo.arrayBuffer();
  try {
    const texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return texto.replace(/^﻿/, '');
  } catch (e) {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function descargarCsv(nombreArchivo, encabezados, filaEjemplo) {
  const contenido = [encabezados.join(','), filaEjemplo.join(',')].join('\n');
  const blob = new Blob([contenido], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

function renderizarTablaErroresCsv(contenedor, errores) {
  contenedor.innerHTML = '';
  if (!errores.length) return;

  const titulo = document.createElement('h4');
  titulo.textContent = 'Detalle de errores';
  contenedor.appendChild(titulo);

  const tabla = document.createElement('table');
  tabla.innerHTML = `
    <thead><tr><th>Fila</th><th>ID</th><th>Error</th></tr></thead>
    <tbody>
      ${errores.map((e) => `
        <tr>
          <td>${e.fila}</td>
          <td>${escaparHtml(e.id)}</td>
          <td>${escaparHtml(e.error)}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  contenedor.appendChild(tabla);
}

async function cargarCsv(url, archivo) {
  const contenido = await leerArchivoComoTexto(archivo);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: contenido,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ---------- Pestañas: un catalogo a la vez ----------

function activarTabCatalogo(nombre) {
  const boton = document.querySelector(`.tab-catalogo[data-tab="${nombre}"]`);
  if (!boton) return;
  document.querySelectorAll('.tab-catalogo').forEach((b) => b.classList.remove('activo'));
  boton.classList.add('activo');
  document.querySelectorAll('[data-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== nombre;
  });
}

document.querySelectorAll('.tab-catalogo').forEach((boton) => {
  boton.addEventListener('click', () => activarTabCatalogo(boton.dataset.tab));
});

// Permite llegar directo a una pestaña desde otras pantallas (ej. catalogos.html?tab=contactos).
const tabDesdeUrl = new URLSearchParams(window.location.search).get('tab');
if (tabDesdeUrl) activarTabCatalogo(tabDesdeUrl);

// ---------- Destinos (con Plaza, Grupo y Cadena asociados) ----------

const formDestino = document.getElementById('form-destino');
const destinoId = document.getElementById('destino-id');
const destinoNombre = document.getElementById('destino-nombre');
const btnCancelarDestino = document.getElementById('btn-cancelar-destino');
const tablaDestinos = document.getElementById('tabla-destinos');

let permisosCatalogos = { ver: true, editar: true, borrar: true };
let esAdminActual = false;

// Widget reutilizable: boton + panel de checkboxes (buscable) para elegir uno o mas valores
// de un catalogo (Plaza/Grupo/Cadena) dentro del formulario de Destino. Rastrea la seleccion
// por nombre (no por id) porque el backend crea/enlaza por nombre, igual que antes con el
// campo de texto libre de Empresas.
function crearMultiSelectCatalogo({ wrapId, btnId, panelId, etiquetaVacio, etiquetaVarios }) {
  const wrap = document.getElementById(wrapId);
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  const seleccionados = new Set();
  let opciones = [];

  function actualizarBoton() {
    if (seleccionados.size === 0) btn.textContent = etiquetaVacio;
    else if (seleccionados.size === 1) btn.textContent = [...seleccionados][0];
    else btn.textContent = `${seleccionados.size} ${etiquetaVarios}`;
  }

  function renderizar() {
    panel.innerHTML = opciones.length
      ? `
        <input type="search" autocomplete="off" class="multi-select-buscador" placeholder="Buscar..." />
        <div class="multi-select-opciones">
          ${opciones.map((nombre) => `
            <label class="multi-select-opcion">
              <input type="checkbox" value="${escaparHtml(nombre)}" ${seleccionados.has(nombre) ? 'checked' : ''} /> <span>${escaparHtml(nombre)}</span>
            </label>
          `).join('')}
        </div>
      `
      : `<p class="pista">Nada capturado todavía. Usa el botón "+" para agregar.</p>`;
  }

  panel.addEventListener('input', (e) => {
    if (!e.target.classList.contains('multi-select-buscador')) return;
    const filtro = e.target.value.trim().toLowerCase();
    panel.querySelectorAll('.multi-select-opcion').forEach((label) => {
      label.hidden = !label.textContent.toLowerCase().includes(filtro);
    });
  });

  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      const buscador = panel.querySelector('.multi-select-buscador');
      if (buscador) {
        buscador.value = '';
        panel.querySelectorAll('.multi-select-opcion').forEach((label) => { label.hidden = false; });
        buscador.focus();
      }
    }
  });

  panel.addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    if (e.target.checked) seleccionados.add(e.target.value);
    else seleccionados.delete(e.target.value);
    actualizarBoton();
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) panel.hidden = true;
  });

  return {
    async cargar(url, campoNombre) {
      const res = await fetch(url);
      const filas = await res.json();
      opciones = filas.map((f) => f[campoNombre]);
      renderizar();
      actualizarBoton();
    },
    marcar(nombres) {
      seleccionados.clear();
      for (const n of nombres || []) seleccionados.add(n);
      renderizar();
      actualizarBoton();
    },
    obtenerSeleccionados() {
      return [...seleccionados];
    },
    agregarSeleccionado(nombre) {
      if (!opciones.includes(nombre)) opciones.push(nombre);
      seleccionados.add(nombre);
      renderizar();
      actualizarBoton();
    },
  };
}

const multiSelectPlaza = crearMultiSelectCatalogo({ wrapId: 'destino-plaza-wrap', btnId: 'destino-plaza-btn', panelId: 'destino-plaza-panel', etiquetaVacio: 'Sin plazas', etiquetaVarios: 'plazas seleccionadas' });
const multiSelectGrupo = crearMultiSelectCatalogo({ wrapId: 'destino-grupo-wrap', btnId: 'destino-grupo-btn', panelId: 'destino-grupo-panel', etiquetaVacio: 'Sin grupos', etiquetaVarios: 'grupos seleccionados' });
const multiSelectCadena = crearMultiSelectCatalogo({ wrapId: 'destino-cadena-wrap', btnId: 'destino-cadena-btn', panelId: 'destino-cadena-panel', etiquetaVacio: 'Sin cadenas', etiquetaVarios: 'cadenas seleccionadas' });

function refrescarMultiSelectsDestino() {
  multiSelectPlaza.cargar('/api/empresas', 'empresa');
  multiSelectGrupo.cargar('/api/grupos', 'grupo');
  multiSelectCadena.cargar('/api/cadenas', 'cadena');
}

// ---- Alta rapida de Plaza/Grupo/Cadena (boton "+" junto a cada multi-select) ----

const modalRapidoCatalogoDestinoOverlay = document.getElementById('modal-rapido-catalogo-destino-overlay');
const modalRapidoCatalogoDestinoCerrar = document.getElementById('modal-rapido-catalogo-destino-cerrar');
const modalRapidoCatalogoDestinoTitulo = document.getElementById('modal-rapido-catalogo-destino-titulo');
const modalRapidoCatalogoDestinoNombre = document.getElementById('modal-rapido-catalogo-destino-nombre');
const formRapidoCatalogoDestino = document.getElementById('form-rapido-catalogo-destino');

const CATALOGOS_DESTINO = {
  plaza: { titulo: 'Nueva plaza', url: '/api/empresas', campo: 'empresa', multiSelect: multiSelectPlaza, recargarTabla: () => cargarPlazas() },
  grupo: { titulo: 'Nuevo grupo', url: '/api/grupos', campo: 'grupo', multiSelect: multiSelectGrupo, recargarTabla: () => cargarGrupos() },
  cadena: { titulo: 'Nueva cadena', url: '/api/cadenas', campo: 'cadena', multiSelect: multiSelectCadena, recargarTabla: () => cargarCadenas() },
};
let catalogoDestinoActual = null;

document.querySelectorAll('.btn-agregar-catalogo').forEach((boton) => {
  boton.addEventListener('click', () => {
    catalogoDestinoActual = boton.dataset.catalogo;
    modalRapidoCatalogoDestinoTitulo.textContent = CATALOGOS_DESTINO[catalogoDestinoActual].titulo;
    formRapidoCatalogoDestino.reset();
    modalRapidoCatalogoDestinoOverlay.hidden = false;
    modalRapidoCatalogoDestinoNombre.focus();
  });
});

function cerrarModalRapidoCatalogoDestino() {
  modalRapidoCatalogoDestinoOverlay.hidden = true;
}
modalRapidoCatalogoDestinoCerrar.addEventListener('click', cerrarModalRapidoCatalogoDestino);
modalRapidoCatalogoDestinoOverlay.addEventListener('click', (e) => {
  if (e.target === modalRapidoCatalogoDestinoOverlay) cerrarModalRapidoCatalogoDestino();
});

formRapidoCatalogoDestino.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = modalRapidoCatalogoDestinoNombre.value.trim();
  if (!nombre || !catalogoDestinoActual) return;
  const config = CATALOGOS_DESTINO[catalogoDestinoActual];

  const res = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [config.campo]: nombre }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  const creado = await res.json();
  config.multiSelect.agregarSeleccionado(creado[config.campo]);
  config.recargarTabla();
  cerrarModalRapidoCatalogoDestino();
});

async function cargarDestinos() {
  const res = await fetch('/api/destinos');
  const destinos = await res.json();
  tablaDestinos.innerHTML = '';
  for (const d of destinos) {
    const tr = document.createElement('tr');
    tr.dataset.id = d.id_destino;
    tr.innerHTML = `
      <td>${escaparHtml(d.destino)}</td>
      <td>${escaparHtml((d.empresas || []).join(', '))}</td>
      <td>${escaparHtml((d.grupos || []).join(', '))}</td>
      <td>${escaparHtml((d.cadenas || []).join(', '))}</td>
      <td>${d.cotizaciones_count ? `<button type="button" class="btn-mini btn-ver-asociados" data-entidad="destinos" data-id="${d.id_destino}" data-tipo="cotizaciones">${d.cotizaciones_count}</button>` : '0'}</td>
      <td>${d.ordenes_count ? `<button type="button" class="btn-mini btn-ver-asociados" data-entidad="destinos" data-id="${d.id_destino}" data-tipo="ordenes">${d.ordenes_count}</button>` : '0'}</td>
      <td>${d.tareas_count ? `<button type="button" class="btn-mini btn-ver-asociados" data-entidad="destinos" data-id="${d.id_destino}" data-tipo="tareas">${d.tareas_count}</button>` : '0'}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${d.id_destino}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${d.id_destino}">Borrar</button>` : ''}
      </td>
    `;
    tablaDestinos.appendChild(tr);
  }
}

function limpiarFormDestino() {
  destinoId.value = '';
  formDestino.reset();
  multiSelectPlaza.marcar([]);
  multiSelectGrupo.marcar([]);
  multiSelectCadena.marcar([]);
  btnCancelarDestino.hidden = true;
}

// El catalogo de Contactos depende de Destinos (select de Hoteles/Locales del formulario,
// y la columna "Hoteles/Locales" de su tabla), y las tablas de Plaza/Grupo/Cadena muestran un
// conteo de "Hoteles/Locales asociados": todo eso se refresca cada vez que Destinos cambia
// (alta, edicion, borrado o unificar), para que quede reflejado de inmediato en las demas
// secciones de esta misma pantalla sin necesidad de recargarla.
function refrescarDependientesDeDestinos() {
  cargarPanelDestinosContacto();
  cargarContactos();
  cargarPlazas();
  cargarGrupos();
  cargarCadenas();
}

formDestino.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    destino: destinoNombre.value.trim(),
    empresas: multiSelectPlaza.obtenerSeleccionados(),
    grupos: multiSelectGrupo.obtenerSeleccionados(),
    cadenas: multiSelectCadena.obtenerSeleccionados(),
  };
  const id = destinoId.value;
  const res = await fetch(id ? `/api/destinos/${id}` : '/api/destinos', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormDestino();
  cargarDestinos();
  refrescarDependientesDeDestinos();
});

btnCancelarDestino.addEventListener('click', limpiarFormDestino);

async function editarDestino(id) {
  const res = await fetch('/api/destinos');
  const destinos = await res.json();
  const d = destinos.find((x) => String(x.id_destino) === String(id));
  if (!d) return;

  destinoId.value = d.id_destino;
  destinoNombre.value = d.destino;
  multiSelectPlaza.marcar(d.empresas);
  multiSelectGrupo.marcar(d.grupos);
  multiSelectCadena.marcar(d.cadenas);
  btnCancelarDestino.hidden = false;
  destinoNombre.focus();
}

tablaDestinos.addEventListener('click', async (e) => {
  if (e.target.classList.contains('btn-ver-asociados')) return;

  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar este hotel/local?')) return;
    await eliminarYRecargar(`/api/destinos/${id}`, cargarDestinos);
    refrescarDependientesDeDestinos();
  }

  if (e.target.classList.contains('btn-editar')) {
    editarDestino(id);
  }
});

const btnUnificarDestinos = document.getElementById('btn-unificar-destinos');
const reporteUnificarDestinos = document.getElementById('reporte-unificar-destinos');

btnUnificarDestinos.addEventListener('click', async () => {
  if (!confirm('¿Unificar hoteles/locales duplicados (mismo nombre y mismas plazas/grupos/cadenas)? Esta acción no se puede deshacer.')) return;

  btnUnificarDestinos.disabled = true;
  btnUnificarDestinos.textContent = 'Unificando...';

  try {
    const res = await fetch('/api/destinos/unificar', { method: 'POST' });
    const data = await res.json();

    reporteUnificarDestinos.hidden = false;
    if (data.gruposUnificados === 0) {
      reporteUnificarDestinos.textContent = 'No se encontraron hoteles/locales duplicados.';
    } else {
      reporteUnificarDestinos.innerHTML = `
        Se unificaron <strong>${data.gruposUnificados}</strong> hotel(es)/local(es) duplicado(s)
        (<strong>${data.duplicadosEliminados}</strong> registros eliminados,
        <strong>${data.ordenesReasignadas}</strong> órdenes reasignadas):
        <ul>${data.detalle.map((d) => `<li>${escaparHtml(d.destino)} (${d.duplicadosEliminados} duplicado(s))</li>`).join('')}</ul>
      `;
    }

    cargarDestinos();
    refrescarDependientesDeDestinos();
  } finally {
    btnUnificarDestinos.disabled = false;
    btnUnificarDestinos.textContent = 'Unificar hoteles/locales duplicados';
  }
});

// ---- Plaza ----
// Estas tres funciones tambien refrescan los multi-select del formulario de Destino y su
// tabla, porque muestran los mismos nombres de Plaza/Grupo/Cadena.

const formPlaza = document.getElementById('form-plaza');
const plazaId = document.getElementById('plaza-id');
const plazaNombre = document.getElementById('plaza-nombre');
const btnCancelarPlaza = document.getElementById('btn-cancelar-plaza');
const tablaPlazas = document.getElementById('tabla-plazas');

async function cargarPlazas() {
  const res = await fetch('/api/empresas');
  const plazas = await res.json();
  tablaPlazas.innerHTML = plazas.map((p) => `
    <tr>
      <td>${escaparHtml(p.id_empresa)}</td>
      <td>${escaparHtml(p.empresa)}</td>
      <td>${p.destinos_asociados}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${p.id_empresa}" data-nombre="${escaparHtml(p.empresa)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${p.id_empresa}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
  return plazas;
}

function limpiarFormPlaza() {
  plazaId.value = '';
  formPlaza.reset();
  btnCancelarPlaza.hidden = true;
}

formPlaza.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { empresa: plazaNombre.value.trim() };
  const id = plazaId.value;
  const res = await fetch(id ? `/api/empresas/${id}` : '/api/empresas', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormPlaza();
  cargarPlazas();
  cargarDestinos();
  refrescarMultiSelectsDestino();
});

btnCancelarPlaza.addEventListener('click', limpiarFormPlaza);

tablaPlazas.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar esta plaza?')) return;
    await eliminarYRecargar(`/api/empresas/${id}`, () => { cargarPlazas(); cargarDestinos(); refrescarMultiSelectsDestino(); });
  }

  if (e.target.classList.contains('btn-editar')) {
    plazaId.value = id;
    plazaNombre.value = e.target.dataset.nombre;
    btnCancelarPlaza.hidden = false;
    plazaNombre.focus();
  }
});

// ---- Grupo ----

const formGrupo = document.getElementById('form-grupo');
const grupoId = document.getElementById('grupo-id');
const grupoNombre = document.getElementById('grupo-nombre');
const btnCancelarGrupo = document.getElementById('btn-cancelar-grupo');
const tablaGrupos = document.getElementById('tabla-grupos');

async function cargarGrupos() {
  const res = await fetch('/api/grupos');
  const grupos = await res.json();
  tablaGrupos.innerHTML = grupos.map((g) => `
    <tr>
      <td>${escaparHtml(g.id_grupo)}</td>
      <td>${escaparHtml(g.grupo)}</td>
      <td>${g.destinos_asociados}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${g.id_grupo}" data-nombre="${escaparHtml(g.grupo)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${g.id_grupo}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
  return grupos;
}

function limpiarFormGrupo() {
  grupoId.value = '';
  formGrupo.reset();
  btnCancelarGrupo.hidden = true;
}

formGrupo.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { grupo: grupoNombre.value.trim() };
  const id = grupoId.value;
  const res = await fetch(id ? `/api/grupos/${id}` : '/api/grupos', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormGrupo();
  cargarGrupos();
  cargarDestinos();
  refrescarMultiSelectsDestino();
});

btnCancelarGrupo.addEventListener('click', limpiarFormGrupo);

tablaGrupos.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar este grupo?')) return;
    await eliminarYRecargar(`/api/grupos/${id}`, () => { cargarGrupos(); cargarDestinos(); refrescarMultiSelectsDestino(); });
  }

  if (e.target.classList.contains('btn-editar')) {
    grupoId.value = id;
    grupoNombre.value = e.target.dataset.nombre;
    btnCancelarGrupo.hidden = false;
    grupoNombre.focus();
  }
});

// ---- Cadena ----

const formCadena = document.getElementById('form-cadena');
const cadenaId = document.getElementById('cadena-id');
const cadenaNombre = document.getElementById('cadena-nombre');
const btnCancelarCadena = document.getElementById('btn-cancelar-cadena');
const tablaCadenas = document.getElementById('tabla-cadenas');

async function cargarCadenas() {
  const res = await fetch('/api/cadenas');
  const cadenas = await res.json();
  tablaCadenas.innerHTML = cadenas.map((c) => `
    <tr>
      <td>${escaparHtml(c.id_cadena)}</td>
      <td>${escaparHtml(c.cadena)}</td>
      <td>${c.destinos_asociados}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${c.id_cadena}" data-nombre="${escaparHtml(c.cadena)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${c.id_cadena}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
  return cadenas;
}

function limpiarFormCadena() {
  cadenaId.value = '';
  formCadena.reset();
  btnCancelarCadena.hidden = true;
}

formCadena.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { cadena: cadenaNombre.value.trim() };
  const id = cadenaId.value;
  const res = await fetch(id ? `/api/cadenas/${id}` : '/api/cadenas', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormCadena();
  cargarCadenas();
  cargarDestinos();
  refrescarMultiSelectsDestino();
});

btnCancelarCadena.addEventListener('click', limpiarFormCadena);

tablaCadenas.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar esta cadena?')) return;
    await eliminarYRecargar(`/api/cadenas/${id}`, () => { cargarCadenas(); cargarDestinos(); refrescarMultiSelectsDestino(); });
  }

  if (e.target.classList.contains('btn-editar')) {
    cadenaId.value = id;
    cadenaNombre.value = e.target.dataset.nombre;
    btnCancelarCadena.hidden = false;
    cadenaNombre.focus();
  }
});

// ---------- Contactos ----------

function fechaDe(creadoEn) {
  return (creadoEn || '').split(' ')[0];
}

const formContacto = document.getElementById('form-contacto');
const contactoId = document.getElementById('contacto-id');
const contactoNombre = document.getElementById('contacto-nombre');
const contactoApellido = document.getElementById('contacto-apellido');
const contactoCorreo = document.getElementById('contacto-correo');
const contactoTelefonoLocal = document.getElementById('contacto-telefono-local');
const contactoTelefonoCelular = document.getElementById('contacto-telefono-celular');
const btnCancelarContacto = document.getElementById('btn-cancelar-contacto');
const tablaContactos = document.getElementById('tabla-contactos');

const contactoDestinosBtn = document.getElementById('contacto-destinos-btn');
const contactoDestinosPanel = document.getElementById('contacto-destinos-panel');
const destinosSeleccionadosContacto = new Set();

async function cargarPanelDestinosContacto() {
  const res = await fetch('/api/destinos');
  const destinos = await res.json();
  contactoDestinosPanel.innerHTML = destinos.length
    ? `
      <input type="search" autocomplete="off" class="multi-select-buscador" placeholder="Buscar hotel/local..." />
      <div class="multi-select-opciones">
        ${destinos.map((d) => `
          <label class="multi-select-opcion">
            <input type="checkbox" value="${d.id_destino}" /> <span>${escaparHtml(d.destino)}</span>
          </label>
        `).join('')}
      </div>
    `
    : '<p class="pista">No hay hoteles/locales capturados.</p>';
}

contactoDestinosPanel.addEventListener('input', (e) => {
  if (!e.target.classList.contains('multi-select-buscador')) return;
  const filtro = e.target.value.trim().toLowerCase();
  contactoDestinosPanel.querySelectorAll('.multi-select-opcion').forEach((label) => {
    label.hidden = !label.textContent.toLowerCase().includes(filtro);
  });
});

function actualizarBotonDestinosContacto() {
  if (destinosSeleccionadosContacto.size === 0) {
    contactoDestinosBtn.textContent = 'Sin hoteles/locales';
  } else if (destinosSeleccionadosContacto.size === 1) {
    const opcion = contactoDestinosPanel.querySelector(`input[value="${[...destinosSeleccionadosContacto][0]}"]`);
    contactoDestinosBtn.textContent = opcion ? opcion.parentElement.textContent.trim() : '1 hotel/local seleccionado';
  } else {
    contactoDestinosBtn.textContent = `${destinosSeleccionadosContacto.size} hoteles/locales seleccionados`;
  }
}

contactoDestinosBtn.addEventListener('click', () => {
  contactoDestinosPanel.hidden = !contactoDestinosPanel.hidden;
  if (!contactoDestinosPanel.hidden) {
    const buscador = contactoDestinosPanel.querySelector('.multi-select-buscador');
    if (buscador) {
      buscador.value = '';
      contactoDestinosPanel.querySelectorAll('.multi-select-opcion').forEach((label) => { label.hidden = false; });
      buscador.focus();
    }
  }
});

contactoDestinosPanel.addEventListener('change', (e) => {
  if (e.target.type !== 'checkbox') return;
  if (e.target.checked) destinosSeleccionadosContacto.add(e.target.value);
  else destinosSeleccionadosContacto.delete(e.target.value);
  actualizarBotonDestinosContacto();
});

document.addEventListener('click', (e) => {
  if (!document.getElementById('contacto-destinos-wrap').contains(e.target)) {
    contactoDestinosPanel.hidden = true;
  }
});

function marcarDestinosContacto(destinos) {
  destinosSeleccionadosContacto.clear();
  contactoDestinosPanel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
  });
  for (const d of destinos || []) {
    const id = String(d.id_destino);
    destinosSeleccionadosContacto.add(id);
    const cb = contactoDestinosPanel.querySelector(`input[value="${id}"]`);
    if (cb) cb.checked = true;
  }
  actualizarBotonDestinosContacto();
}

function coincideTexto(valor, filtro) {
  return !filtro || String(valor || '').toLowerCase().includes(filtro.toLowerCase());
}

let contactosCache = [];
const filtroContNombre = document.getElementById('filtro-cont-nombre');
const filtroContCorreo = document.getElementById('filtro-cont-correo');
const btnLimpiarFiltrosCont = document.getElementById('btn-limpiar-filtros-cont');

function renderizarContactos(contactos) {
  tablaContactos.innerHTML = '';
  for (const c of contactos) {
    const tr = document.createElement('tr');
    tr.dataset.id = c.id_contacto;
    const destinosTexto = (c.destinos || []).map((d) => d.destino).join(', ');
    tr.innerHTML = `
      <td>${escaparHtml(c.id_publico || '')}</td>
      <td>${escaparHtml(c.nombre)}</td>
      <td>${escaparHtml(c.apellido || '')}</td>
      <td>${escaparHtml(c.correo_electronico || '')}</td>
      <td>${escaparHtml(c.telefono_local || '')}</td>
      <td>${escaparHtml(c.telefono_celular || '')}</td>
      <td>${escaparHtml(destinosTexto)}</td>
      <td>${escaparHtml(fechaDe(c.creado_en))}</td>
      <td>${escaparHtml(fechaDe(c.fecha_ultima_actividad) || 'Sin actividad')}</td>
      <td>${c.cotizaciones_count ? `<button type="button" class="btn-mini btn-ver-asociados" data-id="${c.id_contacto}" data-tipo="cotizaciones">${c.cotizaciones_count}</button>` : '0'}</td>
      <td>${c.ordenes_count ? `<button type="button" class="btn-mini btn-ver-asociados" data-id="${c.id_contacto}" data-tipo="ordenes">${c.ordenes_count}</button>` : '0'}</td>
      <td>${c.tareas_count ? `<button type="button" class="btn-mini btn-ver-asociados" data-id="${c.id_contacto}" data-tipo="tareas">${c.tareas_count}</button>` : '0'}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${c.id_contacto}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${c.id_contacto}">Borrar</button>` : ''}
      </td>
    `;
    tablaContactos.appendChild(tr);
  }
}

const columnasNumericasContactos = new Set(['cotizaciones_count', 'ordenes_count', 'tareas_count']);
const columnasFechaContactos = new Set(['creado_en', 'fecha_ultima_actividad']);
const ordenContactos = { campo: null, direccion: 1 };

function valorOrdenableContacto(c, campo) {
  if (campo === 'destinos_texto') return (c.destinos || []).map((d) => d.destino).join(', ').toLowerCase();
  const v = c[campo];
  if (columnasNumericasContactos.has(campo)) return Number(v) || 0;
  if (columnasFechaContactos.has(campo)) return v ? new Date(v).getTime() : 0;
  return String(v || '').toLowerCase();
}

function ordenarContactos(lista) {
  if (!ordenContactos.campo) return lista;
  const campo = ordenContactos.campo;
  return [...lista].sort((a, b) => {
    const va = valorOrdenableContacto(a, campo);
    const vb = valorOrdenableContacto(b, campo);
    if (va < vb) return -1 * ordenContactos.direccion;
    if (va > vb) return 1 * ordenContactos.direccion;
    return 0;
  });
}

function actualizarIndicadoresOrdenContactos() {
  document.querySelectorAll('.tabla-contactos-fija thead th[data-campo]').forEach((th) => {
    th.classList.remove('orden-asc', 'orden-desc');
    if (th.dataset.campo === ordenContactos.campo) {
      th.classList.add(ordenContactos.direccion === 1 ? 'orden-asc' : 'orden-desc');
    }
  });
}

document.querySelectorAll('.tabla-contactos-fija thead th[data-campo]').forEach((th) => {
  th.addEventListener('click', () => {
    if (ordenContactos.campo === th.dataset.campo) {
      ordenContactos.direccion *= -1;
    } else {
      ordenContactos.campo = th.dataset.campo;
      ordenContactos.direccion = 1;
    }
    actualizarIndicadoresOrdenContactos();
    aplicarFiltrosContactos();
  });
});

function aplicarFiltrosContactos() {
  const filtrados = contactosCache.filter((c) =>
    coincideTexto(`${c.nombre} ${c.apellido || ''}`, filtroContNombre.value.trim())
    && coincideTexto(c.correo_electronico, filtroContCorreo.value.trim())
  );
  renderizarContactos(ordenarContactos(filtrados));
}

[filtroContNombre, filtroContCorreo].forEach((input) => {
  input.addEventListener('input', aplicarFiltrosContactos);
});
btnLimpiarFiltrosCont.addEventListener('click', () => {
  filtroContNombre.value = '';
  filtroContCorreo.value = '';
  aplicarFiltrosContactos();
});

async function cargarContactos() {
  const res = await fetch('/api/contactos');
  contactosCache = await res.json();
  aplicarFiltrosContactos();
}

function limpiarFormContacto() {
  contactoId.value = '';
  formContacto.reset();
  marcarDestinosContacto([]);
  btnCancelarContacto.hidden = true;
}

formContacto.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    nombre: contactoNombre.value.trim(),
    apellido: contactoApellido.value.trim(),
    correo_electronico: contactoCorreo.value.trim(),
    telefono_local: contactoTelefonoLocal.value.trim(),
    telefono_celular: contactoTelefonoCelular.value.trim(),
    destinos: [...destinosSeleccionadosContacto].map(Number),
  };
  const id = contactoId.value;
  const res = await fetch(id ? `/api/contactos/${id}` : '/api/contactos', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormContacto();
  cargarContactos();
});

btnCancelarContacto.addEventListener('click', limpiarFormContacto);

function cargarContactoEnFormulario(c) {
  contactoId.value = c.id_contacto;
  contactoNombre.value = c.nombre;
  contactoApellido.value = c.apellido || '';
  contactoCorreo.value = c.correo_electronico || '';
  contactoTelefonoLocal.value = c.telefono_local || '';
  contactoTelefonoCelular.value = c.telefono_celular || '';
  marcarDestinosContacto(c.destinos);

  btnCancelarContacto.hidden = false;
  contactoNombre.focus();
}

async function editarContacto(id) {
  const res = await fetch('/api/contactos');
  const contactos = await res.json();
  const c = contactos.find((x) => String(x.id_contacto) === String(id));
  if (!c) return;
  cargarContactoEnFormulario(c);
}

tablaContactos.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar este contacto?')) return;
    await eliminarYRecargar(`/api/contactos/${id}`, cargarContactos);
  }

  if (e.target.classList.contains('btn-editar')) {
    editarContacto(id);
  }
});

// ---------- Detalle de Contacto / Hotel-Local: pantalla completa propia ----------
// (contacto-detalle.html / destino-detalle.html), no un modal: ahi se ven y administran
// Hoteles/Locales, Negocios, Cotizaciones, Ordenes y Tareas asociadas.

tablaContactos.addEventListener('click', (e) => {
  if (e.target.closest('button') && !e.target.classList.contains('btn-ver-asociados')) return;
  const fila = e.target.closest('tr');
  if (!fila || !fila.dataset.id) return;
  window.location.href = `contacto-detalle.html?id=${encodeURIComponent(fila.dataset.id)}`;
});

tablaDestinos.addEventListener('click', (e) => {
  if (e.target.closest('button') && !e.target.classList.contains('btn-ver-asociados')) return;
  const fila = e.target.closest('tr');
  if (!fila || !fila.dataset.id) return;
  window.location.href = `destino-detalle.html?id=${encodeURIComponent(fila.dataset.id)}`;
});

const btnUnificarContactos = document.getElementById('btn-unificar-contactos');
const reporteUnificarContactos = document.getElementById('reporte-unificar-contactos');

function fichaContactoUnificar(c) {
  const destinosTexto = (c.destinos || []).map((d) => d.destino).join(', ') || 'Sin hoteles/locales';
  const ordenesTexto = `${c.ordenes_count || 0} orden(es)`;
  const cotizacionesTexto = `${c.cotizaciones_count || 0} cotización(es)`;
  const tieneRegistros = (c.ordenes_count || 0) > 0 || (c.cotizaciones_count || 0) > 0;
  return `
    <label class="opcion-unificar-contacto">
      <input type="radio" name="sobreviviente-${c._grupoIndice}" value="${c.id_contacto}" ${c._esPrimero ? 'checked' : ''} />
      <span>
        <strong>ID ${escaparHtml(c.id_publico || c.id_contacto)}</strong> ·
        ${escaparHtml(c.correo_electronico || 'sin correo')} ·
        ${escaparHtml(c.telefono_local || c.telefono_celular || 'sin teléfono')} ·
        ${escaparHtml(destinosTexto)} ·
        <strong${tieneRegistros ? ' class="estatus-vencido"' : ''}>${ordenesTexto} · ${cotizacionesTexto}</strong> ·
        creado ${escaparHtml(fechaDe(c.creado_en))}
        ${c.fecha_ultima_actividad ? ` · última actividad ${escaparHtml(fechaDe(c.fecha_ultima_actividad))}` : ''}
      </span>
    </label>
  `;
}

let gruposDuplicadosContactos = [];

async function mostrarGruposDuplicadosContactos() {
  const res = await fetch('/api/contactos/duplicados');
  gruposDuplicadosContactos = await res.json();

  reporteUnificarContactos.hidden = false;

  if (!gruposDuplicadosContactos.length) {
    reporteUnificarContactos.innerHTML = '<p class="pista">No se encontraron contactos duplicados.</p>';
    return;
  }

  reporteUnificarContactos.innerHTML = `
    <p class="pista">Se encontraron ${gruposDuplicadosContactos.length} grupo(s) de contactos duplicados. Elige cuál contacto se conserva en cada grupo (los demás se eliminan y sus órdenes/destinos se reasignan al que elijas), o marca "No unificar" para dejar ese grupo tal cual.</p>
    ${gruposDuplicadosContactos.map((grupo, indice) => `
      <div class="grupo-unificar-contacto">
        <h4>${escaparHtml([grupo[0].nombre, grupo[0].apellido].filter(Boolean).join(' '))}</h4>
        ${grupo.map((c, i) => fichaContactoUnificar({ ...c, _grupoIndice: indice, _esPrimero: i === 0 })).join('')}
        <label class="opcion-unificar-contacto">
          <input type="radio" name="sobreviviente-${indice}" value="ninguno" />
          <span>No unificar este grupo</span>
        </label>
      </div>
    `).join('')}
    <div class="acciones-form">
      <button type="button" id="btn-confirmar-unificar-contactos">Confirmar unificación</button>
      <button type="button" id="btn-cancelar-unificar-contactos">Cancelar</button>
    </div>
  `;

  document.getElementById('btn-cancelar-unificar-contactos').addEventListener('click', () => {
    reporteUnificarContactos.hidden = true;
    reporteUnificarContactos.innerHTML = '';
  });

  document.getElementById('btn-confirmar-unificar-contactos').addEventListener('click', async () => {
    const decisiones = gruposDuplicadosContactos
      .map((grupo, indice) => {
        const seleccionado = reporteUnificarContactos.querySelector(`input[name="sobreviviente-${indice}"]:checked`);
        if (!seleccionado || seleccionado.value === 'ninguno') return null;
        const sobrevivienteId = Number(seleccionado.value);
        return {
          sobreviviente_id: sobrevivienteId,
          duplicado_ids: grupo.map((c) => c.id_contacto).filter((id) => id !== sobrevivienteId),
        };
      })
      .filter(Boolean);

    if (!decisiones.length) {
      alert('No seleccionaste ningún grupo para unificar.');
      return;
    }

    if (!confirm('¿Unificar los contactos seleccionados? Esta acción no se puede deshacer.')) return;

    const res = await fetch('/api/contactos/unificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisiones }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Error: ' + (data.errores ? data.errores.join(', ') : res.statusText));
      return;
    }

    reporteUnificarContactos.innerHTML = `
      Se unificaron <strong>${data.gruposUnificados}</strong> grupo(s) de duplicados
      (<strong>${data.duplicadosEliminados}</strong> registros eliminados,
      <strong>${data.ordenesReasignadas}</strong> órdenes reasignadas):
      <ul>${data.detalle.map((d) => `<li>${escaparHtml(d.contacto)} (${d.duplicadosEliminados} duplicado(s))</li>`).join('')}</ul>
    `;
    cargarContactos();
  });
}

btnUnificarContactos.addEventListener('click', async () => {
  btnUnificarContactos.disabled = true;
  try {
    await mostrarGruposDuplicadosContactos();
  } finally {
    btnUnificarContactos.disabled = false;
  }
});

// ---------- Carga masiva de contactos (CSV) ----------

const btnPlantillaContactos = document.getElementById('btn-plantilla-contactos');
const formCargaContactos = document.getElementById('form-carga-contactos');
const archivoCsvContactos = document.getElementById('archivo-csv-contactos');
const btnCargarContactos = document.getElementById('btn-cargar-contactos');
const reporteCargaContactos = document.getElementById('reporte-carga-contactos');
const listaErroresContactos = document.getElementById('cc-lista-errores');

btnPlantillaContactos.addEventListener('click', () => {
  descargarCsv(
    'plantilla-contactos.csv',
    ['nombre', 'apellido', 'correo_electronico', 'telefono_local', 'telefono_celular', 'destinos'],
    ['Juan', 'Perez', 'juan@ejemplo.com', '81 1234 5678', '81 8765 4321', 'CDMX;Monterrey']
  );
});

formCargaContactos.addEventListener('submit', async (e) => {
  e.preventDefault();
  const archivo = archivoCsvContactos.files[0];
  if (!archivo) return;

  btnCargarContactos.disabled = true;
  btnCargarContactos.textContent = 'Cargando...';

  try {
    const data = await cargarCsv('/api/contactos/importar-csv', archivo);

    reporteCargaContactos.hidden = false;
    document.getElementById('cc-total').textContent = data.total;
    document.getElementById('cc-insertadas').textContent = data.insertadas;
    document.getElementById('cc-actualizadas').textContent = data.actualizadas;
    document.getElementById('cc-errores-total').textContent = data.errores.length;
    document.getElementById('cc-destinos').textContent = data.destinosCreados.length
      ? data.destinosCreados.join(', ') : 'ninguno';
    renderizarTablaErroresCsv(listaErroresContactos, data.errores);

    cargarDestinos();
    cargarPanelDestinosContacto().then(() => cargarContactos());
    formCargaContactos.reset();
  } catch (error) {
    alert('Error al cargar el archivo: ' + error.message);
  } finally {
    btnCargarContactos.disabled = false;
    btnCargarContactos.textContent = 'Cargar archivo';
  }
});

// ---------- Estatus ----------

const formEstatus = document.getElementById('form-estatus');
const estatusId = document.getElementById('estatus-id');
const estatusNombre = document.getElementById('estatus-nombre');
const btnCancelarEstatus = document.getElementById('btn-cancelar-estatus');
const tablaEstatus = document.getElementById('tabla-estatus');

async function cargarEstatusCatalogo() {
  const res = await fetch('/api/estatus');
  const filas = await res.json();
  tablaEstatus.innerHTML = filas.map((f) => `
    <tr>
      <td>${escaparHtml(f.estatus)}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${f.id_estatus}" data-nombre="${escaparHtml(f.estatus)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${f.id_estatus}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function limpiarFormEstatus() {
  estatusId.value = '';
  formEstatus.reset();
  btnCancelarEstatus.hidden = true;
}

formEstatus.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { estatus: estatusNombre.value.trim() };
  const id = estatusId.value;
  const res = await fetch(id ? `/api/estatus/${id}` : '/api/estatus', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormEstatus();
  cargarEstatusCatalogo();
});

btnCancelarEstatus.addEventListener('click', limpiarFormEstatus);

tablaEstatus.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar este estatus?')) return;
    await eliminarYRecargar(`/api/estatus/${id}`, cargarEstatusCatalogo);
  }

  if (e.target.classList.contains('btn-editar')) {
    estatusId.value = id;
    estatusNombre.value = e.target.dataset.nombre;
    btnCancelarEstatus.hidden = false;
    estatusNombre.focus();
  }
});

// ---------- Estado de entrega ----------

const formEstadoEntrega = document.getElementById('form-estado-entrega');
const estadoEntregaId = document.getElementById('estado-entrega-id');
const estadoEntregaNombre = document.getElementById('estado-entrega-nombre');
const btnCancelarEstadoEntrega = document.getElementById('btn-cancelar-estado-entrega');
const tablaEstadoEntrega = document.getElementById('tabla-estado-entrega');

async function cargarEstadosEntrega() {
  const res = await fetch('/api/estados-entrega');
  const filas = await res.json();
  tablaEstadoEntrega.innerHTML = filas.map((f) => `
    <tr>
      <td>${escaparHtml(f.estado_entrega)}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${f.id_estado_entrega}" data-nombre="${escaparHtml(f.estado_entrega)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${f.id_estado_entrega}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function limpiarFormEstadoEntrega() {
  estadoEntregaId.value = '';
  formEstadoEntrega.reset();
  btnCancelarEstadoEntrega.hidden = true;
}

formEstadoEntrega.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { estado_entrega: estadoEntregaNombre.value.trim() };
  const id = estadoEntregaId.value;
  const res = await fetch(id ? `/api/estados-entrega/${id}` : '/api/estados-entrega', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormEstadoEntrega();
  cargarEstadosEntrega();
});

btnCancelarEstadoEntrega.addEventListener('click', limpiarFormEstadoEntrega);

tablaEstadoEntrega.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar este estado de entrega?')) return;
    await eliminarYRecargar(`/api/estados-entrega/${id}`, cargarEstadosEntrega);
  }

  if (e.target.classList.contains('btn-editar')) {
    estadoEntregaId.value = id;
    estadoEntregaNombre.value = e.target.dataset.nombre;
    btnCancelarEstadoEntrega.hidden = false;
    estadoEntregaNombre.focus();
  }
});

// ---------- Usuarios (solo administradores) ----------

const MODULOS_USUARIO = [
  { clave: 'ordenes', etiqueta: 'Órdenes' },
  { clave: 'detalle_compra', etiqueta: 'Detalle de compra' },
  { clave: 'catalogos', etiqueta: 'Catálogos' },
];

const tabUsuarios = document.getElementById('tab-usuarios');
const formUsuario = document.getElementById('form-usuario');
const usuarioIdOriginal = document.getElementById('usuario-id');
const usuarioNombre = document.getElementById('usuario-nombre');
const usuarioPassword = document.getElementById('usuario-password');
const usuarioEsAdmin = document.getElementById('usuario-es-admin');
const etiquetaPasswordOpcional = document.getElementById('etiqueta-password-opcional');
const tablaPermisosForm = document.getElementById('tabla-permisos-form');
const btnGuardarUsuario = document.getElementById('btn-guardar-usuario');
const btnCancelarUsuario = document.getElementById('btn-cancelar-usuario');
const btnMostrarFormUsuario = document.getElementById('btn-mostrar-form-usuario');
const tablaUsuarios = document.getElementById('tabla-usuarios');

tablaPermisosForm.innerHTML = MODULOS_USUARIO.map((m) => `
  <tr>
    <td>${m.etiqueta}</td>
    <td><input type="checkbox" data-modulo="${m.clave}" data-accion="ver" /></td>
    <td><input type="checkbox" data-modulo="${m.clave}" data-accion="editar" /></td>
    <td><input type="checkbox" data-modulo="${m.clave}" data-accion="borrar" /></td>
  </tr>
`).join('');

function leerPermisosDelForm() {
  const permisos = {};
  for (const m of MODULOS_USUARIO) {
    permisos[m.clave] = {
      ver: tablaPermisosForm.querySelector(`[data-modulo="${m.clave}"][data-accion="ver"]`).checked,
      editar: tablaPermisosForm.querySelector(`[data-modulo="${m.clave}"][data-accion="editar"]`).checked,
      borrar: tablaPermisosForm.querySelector(`[data-modulo="${m.clave}"][data-accion="borrar"]`).checked,
    };
  }
  return permisos;
}

function escribirPermisosEnForm(permisos) {
  for (const m of MODULOS_USUARIO) {
    const p = (permisos && permisos[m.clave]) || { ver: false, editar: false, borrar: false };
    tablaPermisosForm.querySelector(`[data-modulo="${m.clave}"][data-accion="ver"]`).checked = p.ver;
    tablaPermisosForm.querySelector(`[data-modulo="${m.clave}"][data-accion="editar"]`).checked = p.editar;
    tablaPermisosForm.querySelector(`[data-modulo="${m.clave}"][data-accion="borrar"]`).checked = p.borrar;
  }
}

async function cargarUsuarios() {
  const res = await fetch('/api/usuarios');
  if (!res.ok) return;
  const usuarios = await res.json();

  tablaUsuarios.innerHTML = usuarios.map((u) => {
    const resumen = (clave) => {
      const p = u.permisos[clave];
      if (u.es_admin) return 'Todo';
      const partes = [];
      if (p.ver) partes.push('Ver');
      if (p.editar) partes.push('Editar');
      if (p.borrar) partes.push('Borrar');
      return partes.length ? partes.join(', ') : '-';
    };

    return `
      <tr>
        <td>${escaparHtml(u.usuario)}</td>
        <td>${u.es_admin ? 'Sí' : 'No'}</td>
        <td>${resumen('ordenes')}</td>
        <td>${resumen('detalle_compra')}</td>
        <td>${resumen('catalogos')}</td>
        <td class="acciones">
          <button class="btn-editar" data-id="${u.id_usuario}">Editar</button>
          <button class="btn-borrar" data-id="${u.id_usuario}">Borrar</button>
        </td>
      </tr>
    `;
  }).join('');
}

function limpiarFormUsuario() {
  usuarioIdOriginal.value = '';
  formUsuario.reset();
  escribirPermisosEnForm(null);
  usuarioPassword.required = true;
  usuarioPassword.placeholder = '';
  etiquetaPasswordOpcional.textContent = '';
  btnGuardarUsuario.textContent = 'Agregar usuario';
}

function abrirFormUsuario() {
  formUsuario.hidden = false;
  btnMostrarFormUsuario.hidden = true;
}

function cerrarFormUsuario() {
  limpiarFormUsuario();
  formUsuario.hidden = true;
  btnMostrarFormUsuario.hidden = false;
}

btnMostrarFormUsuario.addEventListener('click', abrirFormUsuario);
btnCancelarUsuario.addEventListener('click', cerrarFormUsuario);

formUsuario.addEventListener('submit', async (e) => {
  e.preventDefault();

  const idOriginal = usuarioIdOriginal.value;
  const esEdicion = Boolean(idOriginal);

  const payload = {
    usuario: usuarioNombre.value.trim(),
    esAdmin: usuarioEsAdmin.checked,
    permisos: leerPermisosDelForm(),
  };
  if (usuarioPassword.value) payload.password = usuarioPassword.value;

  const res = await fetch(esEdicion ? `/api/usuarios/${idOriginal}` : '/api/usuarios', {
    method: esEdicion ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error al guardar: ' + (error.errores ? error.errores.join(', ') : error.error || res.statusText));
    return;
  }

  cerrarFormUsuario();
  cargarUsuarios();
});

tablaUsuarios.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Seguro que quieres borrar este usuario?')) return;
    const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      alert('Error: ' + (error.error || res.statusText));
      return;
    }
    cargarUsuarios();
  }

  if (e.target.classList.contains('btn-editar')) {
    const res = await fetch('/api/usuarios');
    const usuarios = await res.json();
    const u = usuarios.find((x) => String(x.id_usuario) === id);
    if (!u) return;

    usuarioIdOriginal.value = u.id_usuario;
    usuarioNombre.value = u.usuario;
    usuarioEsAdmin.checked = u.es_admin;
    escribirPermisosEnForm(u.permisos);

    usuarioPassword.value = '';
    usuarioPassword.required = false;
    usuarioPassword.placeholder = 'Dejar en blanco para no cambiar';
    etiquetaPasswordOpcional.textContent = '(opcional)';

    btnGuardarUsuario.textContent = 'Guardar cambios';
    abrirFormUsuario();
    usuarioNombre.focus();
  }
});

// ---------- Representantes (Cotizaciones, dentro de Usuarios) ----------

const formRepresentante = document.getElementById('form-representante');
const representanteId = document.getElementById('representante-id');
const representanteNombre = document.getElementById('representante-nombre');
const representanteCorreo = document.getElementById('representante-correo');
const representanteCelular = document.getElementById('representante-celular');
const btnCancelarRepresentante = document.getElementById('btn-cancelar-representante');
const tablaRepresentantes = document.getElementById('tabla-representantes');

async function cargarRepresentantes() {
  const res = await fetch('/api/representantes');
  if (!res.ok) return;
  const representantes = await res.json();
  tablaRepresentantes.innerHTML = representantes.map((r) => `
    <tr>
      <td>${escaparHtml(r.representante)}</td>
      <td>${escaparHtml(r.correo_electronico || '')}</td>
      <td>${escaparHtml(r.celular || '')}</td>
      <td class="acciones">
        <button class="btn-editar" data-id="${r.id_representante}" data-nombre="${escaparHtml(r.representante)}" data-correo="${escaparHtml(r.correo_electronico || '')}" data-celular="${escaparHtml(r.celular || '')}">Editar</button>
        <button class="btn-borrar" data-id="${r.id_representante}">Borrar</button>
      </td>
    </tr>
  `).join('');
}

function limpiarFormRepresentante() {
  representanteId.value = '';
  formRepresentante.reset();
  btnCancelarRepresentante.hidden = true;
}

formRepresentante.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    representante: representanteNombre.value.trim(),
    correo_electronico: representanteCorreo.value.trim(),
    celular: representanteCelular.value.trim(),
  };
  const id = representanteId.value;
  const res = await fetch(id ? `/api/representantes/${id}` : '/api/representantes', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormRepresentante();
  cargarRepresentantes();
});

btnCancelarRepresentante.addEventListener('click', limpiarFormRepresentante);

tablaRepresentantes.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar este representante?')) return;
    await eliminarYRecargar(`/api/representantes/${id}`, cargarRepresentantes);
  }

  if (e.target.classList.contains('btn-editar')) {
    representanteId.value = id;
    representanteNombre.value = e.target.dataset.nombre;
    representanteCorreo.value = e.target.dataset.correo;
    representanteCelular.value = e.target.dataset.celular;
    btnCancelarRepresentante.hidden = false;
    representanteNombre.focus();
  }
});

// ---------- Tarjetas internas (dentro de una seccion): Productos y Usuarios ----------
// Cada seccion (Productos, Usuarios) tiene su propio grupo de tarjetas; el cambio de
// tarjeta solo debe afectar los paneles de esa misma seccion, no los de otras.

document.querySelectorAll('.tarjeta-subcatalogo').forEach((boton) => {
  boton.addEventListener('click', () => {
    const contenedor = boton.closest('section');
    contenedor.querySelectorAll('.tarjeta-subcatalogo').forEach((b) => b.classList.remove('activo'));
    boton.classList.add('activo');
    contenedor.querySelectorAll('[data-subpanel]').forEach((panel) => {
      panel.hidden = panel.dataset.subpanel !== boton.dataset.subtab;
    });
  });
});

// ---- Categoria ----

const formCategoria = document.getElementById('form-categoria');
const categoriaId = document.getElementById('categoria-id');
const categoriaNombre = document.getElementById('categoria-nombre');
const btnCancelarCategoria = document.getElementById('btn-cancelar-categoria');
const tablaCategorias = document.getElementById('tabla-categorias');

async function cargarCategorias() {
  const res = await fetch('/api/categorias');
  const categorias = await res.json();
  tablaCategorias.innerHTML = categorias.map((c) => `
    <tr>
      <td>${escaparHtml(c.id_categoria)}</td>
      <td>${escaparHtml(c.categoria)}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${c.id_categoria}" data-nombre="${escaparHtml(c.categoria)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${c.id_categoria}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
  return categorias;
}

function limpiarFormCategoria() {
  categoriaId.value = '';
  formCategoria.reset();
  btnCancelarCategoria.hidden = true;
}

formCategoria.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { categoria: categoriaNombre.value.trim() };
  const id = categoriaId.value;
  const res = await fetch(id ? `/api/categorias/${id}` : '/api/categorias', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormCategoria();
  cargarCategorias().then(refrescarDependientesDeProductoCatalogo);
});

btnCancelarCategoria.addEventListener('click', limpiarFormCategoria);

tablaCategorias.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar esta categoría?')) return;
    await eliminarYRecargar(`/api/categorias/${id}`, () => cargarCategorias().then(refrescarDependientesDeProductoCatalogo));
  }

  if (e.target.classList.contains('btn-editar')) {
    categoriaId.value = id;
    categoriaNombre.value = e.target.dataset.nombre;
    btnCancelarCategoria.hidden = false;
    categoriaNombre.focus();
  }
});

// ---- Linea ----

const formLinea = document.getElementById('form-linea');
const lineaId = document.getElementById('linea-id');
const lineaNombre = document.getElementById('linea-nombre');
const btnCancelarLinea = document.getElementById('btn-cancelar-linea');
const tablaLineas = document.getElementById('tabla-lineas');

async function cargarLineas() {
  const res = await fetch('/api/lineas');
  const lineas = await res.json();
  tablaLineas.innerHTML = lineas.map((l) => `
    <tr>
      <td>${escaparHtml(l.id_linea)}</td>
      <td>${escaparHtml(l.linea)}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${l.id_linea}" data-nombre="${escaparHtml(l.linea)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${l.id_linea}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
  return lineas;
}

function limpiarFormLinea() {
  lineaId.value = '';
  formLinea.reset();
  btnCancelarLinea.hidden = true;
}

formLinea.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { linea: lineaNombre.value.trim() };
  const id = lineaId.value;
  const res = await fetch(id ? `/api/lineas/${id}` : '/api/lineas', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormLinea();
  cargarLineas().then(refrescarDependientesDeProductoCatalogo);
});

btnCancelarLinea.addEventListener('click', limpiarFormLinea);

tablaLineas.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar esta línea?')) return;
    await eliminarYRecargar(`/api/lineas/${id}`, () => cargarLineas().then(refrescarDependientesDeProductoCatalogo));
  }

  if (e.target.classList.contains('btn-editar')) {
    lineaId.value = id;
    lineaNombre.value = e.target.dataset.nombre;
    btnCancelarLinea.hidden = false;
    lineaNombre.focus();
  }
});

// ---- Marca ----

const formMarca = document.getElementById('form-marca');
const marcaId = document.getElementById('marca-id');
const marcaNombre = document.getElementById('marca-nombre');
const btnCancelarMarca = document.getElementById('btn-cancelar-marca');
const tablaMarcas = document.getElementById('tabla-marcas');

async function cargarMarcas() {
  const res = await fetch('/api/marcas');
  const marcas = await res.json();
  tablaMarcas.innerHTML = marcas.map((m) => `
    <tr>
      <td>${escaparHtml(m.id_marca)}</td>
      <td>${escaparHtml(m.marca)}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${m.id_marca}" data-nombre="${escaparHtml(m.marca)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${m.id_marca}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
  return marcas;
}

function limpiarFormMarca() {
  marcaId.value = '';
  formMarca.reset();
  btnCancelarMarca.hidden = true;
}

formMarca.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { marca: marcaNombre.value.trim() };
  const id = marcaId.value;
  const res = await fetch(id ? `/api/marcas/${id}` : '/api/marcas', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormMarca();
  cargarMarcas().then(refrescarDependientesDeProductoCatalogo);
});

btnCancelarMarca.addEventListener('click', limpiarFormMarca);

tablaMarcas.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar esta marca?')) return;
    await eliminarYRecargar(`/api/marcas/${id}`, () => cargarMarcas().then(refrescarDependientesDeProductoCatalogo));
  }

  if (e.target.classList.contains('btn-editar')) {
    marcaId.value = id;
    marcaNombre.value = e.target.dataset.nombre;
    btnCancelarMarca.hidden = false;
    marcaNombre.focus();
  }
});

// ---- Productos ----

const formProducto = document.getElementById('form-producto');
const productoItemOriginal = document.getElementById('producto-item-original');
const productoItem = document.getElementById('producto-item');
const productoDescripcion = document.getElementById('producto-descripcion');
const productoCategoria = document.getElementById('producto-categoria');
const productoLinea = document.getElementById('producto-linea');
const productoMarca = document.getElementById('producto-marca');
const productoPrecioUsd = document.getElementById('producto-precio-usd');
const productoPrecioMxn = document.getElementById('producto-precio-mxn');
const btnGuardarProducto = document.getElementById('btn-guardar-producto');
const btnCancelarProducto = document.getElementById('btn-cancelar-producto');
const tablaProductos = document.getElementById('tabla-productos');
const productosBuscador = document.getElementById('productos-buscador');

function poblarSelect(select, lista, valor, texto, valorActual) {
  const actual = valorActual || select.value;
  select.innerHTML = '<option value="">-- Selecciona --</option>' + lista.map((item) => `
    <option value="${item[valor]}">${escaparHtml(item[texto])}</option>
  `).join('');
  select.value = actual || '';
}

async function poblarSelectsProducto() {
  const [categorias, lineas, marcas] = await Promise.all([
    fetch('/api/categorias').then((r) => r.json()),
    fetch('/api/lineas').then((r) => r.json()),
    fetch('/api/marcas').then((r) => r.json()),
  ]);
  poblarSelect(productoCategoria, categorias, 'id_categoria', 'categoria');
  poblarSelect(productoLinea, lineas, 'id_linea', 'linea');
  poblarSelect(productoMarca, marcas, 'id_marca', 'marca');
}

// El catalogo de Productos depende de Categorias/Lineas/Marcas (los selects del formulario y
// las columnas correspondientes de su tabla): se refresca cada vez que cualquiera de esos tres
// catalogos cambia, para que un catalogo actualizado se refleje de inmediato en el otro.
function refrescarDependientesDeProductoCatalogo() {
  poblarSelectsProducto();
  cargarProductos(productosBuscador.value.trim());
}

function renderizarProductos(productos) {
  tablaProductos.innerHTML = productos.map((p) => `
    <tr>
      <td>${escaparHtml(p.item)}</td>
      <td>${escaparHtml(p.descripcion || '')}</td>
      <td>${escaparHtml(p.categoria_nombre || '')}</td>
      <td>${escaparHtml(p.linea_nombre || '')}</td>
      <td>${escaparHtml(p.marca_nombre || '')}</td>
      <td>${formatoImporte(p.precio_usd)}</td>
      <td>${p.precio_mxn !== null ? formatoImporte(p.precio_mxn) : ''}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${escaparHtml(p.item)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${escaparHtml(p.item)}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
}

async function cargarProductos(q) {
  const parametros = q ? `?q=${encodeURIComponent(q)}` : '';
  const res = await fetch(`/api/productos${parametros}`);
  const productos = await res.json();
  renderizarProductos(productos);
}

function limpiarFormProducto() {
  productoItemOriginal.value = '';
  formProducto.reset();
  productoItem.readOnly = false;
  btnGuardarProducto.textContent = 'Agregar';
  btnCancelarProducto.hidden = true;
}

formProducto.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    item: productoItem.value.trim(),
    descripcion: productoDescripcion.value.trim(),
    categoria_id: productoCategoria.value || null,
    linea_id: productoLinea.value || null,
    marca_id: productoMarca.value || null,
    precio_usd: productoPrecioUsd.value,
    precio_mxn: productoPrecioMxn.value,
  };
  const itemOriginal = productoItemOriginal.value;
  const res = await fetch(itemOriginal ? `/api/productos/${encodeURIComponent(itemOriginal)}` : '/api/productos', {
    method: itemOriginal ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormProducto();
  cargarProductos(productosBuscador.value.trim());
});

btnCancelarProducto.addEventListener('click', limpiarFormProducto);

tablaProductos.addEventListener('click', async (e) => {
  const item = e.target.dataset.id;
  if (!item) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble(`¿Borrar el producto "${item}"?`)) return;
    await eliminarYRecargar(`/api/productos/${encodeURIComponent(item)}`, () => cargarProductos(productosBuscador.value.trim()));
  }

  if (e.target.classList.contains('btn-editar')) {
    const res = await fetch(`/api/productos?q=${encodeURIComponent(item)}`);
    const productos = await res.json();
    const p = productos.find((x) => x.item === item);
    if (!p) return;

    productoItemOriginal.value = p.item;
    productoItem.value = p.item;
    productoItem.readOnly = !esAdminActual;
    productoDescripcion.value = p.descripcion || '';
    productoCategoria.value = p.categoria_id || '';
    productoLinea.value = p.linea_id || '';
    productoMarca.value = p.marca_id || '';
    productoPrecioUsd.value = p.precio_usd;
    productoPrecioMxn.value = p.precio_mxn !== null ? p.precio_mxn : '';

    btnGuardarProducto.textContent = 'Guardar cambios';
    btnCancelarProducto.hidden = false;
    productoDescripcion.focus();
  }
});

// Buscador anti-duplicados: a partir de 3 letras filtra por Item o descripcion.
// Con menos de 3 letras muestra el listado completo.
let temporizadorProductos;
productosBuscador.addEventListener('input', () => {
  clearTimeout(temporizadorProductos);
  const termino = productosBuscador.value.trim();
  temporizadorProductos = setTimeout(() => {
    cargarProductos(termino.length >= 3 ? termino : '');
  }, 250);
});

// ---------- Carga masiva de productos (CSV) ----------

const btnPlantillaProductos = document.getElementById('btn-plantilla-productos');
const formCargaProductos = document.getElementById('form-carga-productos');
const archivoCsvProductos = document.getElementById('archivo-csv-productos');
const btnCargarProductos = document.getElementById('btn-cargar-productos');
const reporteCargaProductos = document.getElementById('reporte-carga-productos');
const listaErroresProductos = document.getElementById('cp-lista-errores');

btnPlantillaProductos.addEventListener('click', () => {
  descargarCsv(
    'plantilla-productos.csv',
    ['item', 'descripcion', 'categoria', 'linea', 'marca', 'precio_usd', 'precio_mxn'],
    ['ITM-001', 'Producto de ejemplo', 'Categoria ejemplo', 'Linea ejemplo', 'Marca ejemplo', '100.00', '1800.00']
  );
});

formCargaProductos.addEventListener('submit', async (e) => {
  e.preventDefault();
  const archivo = archivoCsvProductos.files[0];
  if (!archivo) return;

  btnCargarProductos.disabled = true;
  btnCargarProductos.textContent = 'Cargando...';

  try {
    const data = await cargarCsv('/api/productos/importar-csv', archivo);

    reporteCargaProductos.hidden = false;
    document.getElementById('cp-total').textContent = data.total;
    document.getElementById('cp-insertadas').textContent = data.insertadas;
    document.getElementById('cp-actualizadas').textContent = data.actualizadas;
    document.getElementById('cp-errores-total').textContent = data.errores.length;
    document.getElementById('cp-categorias').textContent = data.categoriasCreadas.length
      ? data.categoriasCreadas.join(', ') : 'ninguna';
    document.getElementById('cp-lineas').textContent = data.lineasCreadas.length
      ? data.lineasCreadas.join(', ') : 'ninguna';
    document.getElementById('cp-marcas').textContent = data.marcasCreadas.length
      ? data.marcasCreadas.join(', ') : 'ninguna';
    renderizarTablaErroresCsv(listaErroresProductos, data.errores);

    cargarCategorias();
    cargarLineas();
    cargarMarcas();
    poblarSelectsProducto();
    cargarProductos(productosBuscador.value.trim());
    formCargaProductos.reset();
  } catch (error) {
    alert('Error al cargar el archivo: ' + error.message);
  } finally {
    btnCargarProductos.disabled = false;
    btnCargarProductos.textContent = 'Cargar archivo';
  }
});

// ---------- Etapa del Negocio (Cotizaciones) ----------

const formEtapaNegocio = document.getElementById('form-etapa-negocio');
const etapaNegocioId = document.getElementById('etapa-negocio-id');
const etapaNegocioNombre = document.getElementById('etapa-negocio-nombre');
const btnCancelarEtapaNegocio = document.getElementById('btn-cancelar-etapa-negocio');
const tablaEtapaNegocio = document.getElementById('tabla-etapa-negocio');

async function cargarEtapasNegocio() {
  const res = await fetch('/api/etapas-negocio');
  const filas = await res.json();
  tablaEtapaNegocio.innerHTML = filas.map((f) => `
    <tr>
      <td>${f.id_etapa}</td>
      <td>${escaparHtml(f.etapa)}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${f.id_etapa}" data-nombre="${escaparHtml(f.etapa)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${f.id_etapa}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
  return filas;
}

function limpiarFormEtapaNegocio() {
  etapaNegocioId.value = '';
  formEtapaNegocio.reset();
  btnCancelarEtapaNegocio.hidden = true;
}

formEtapaNegocio.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { etapa: etapaNegocioNombre.value.trim() };
  const id = etapaNegocioId.value;
  const res = await fetch(id ? `/api/etapas-negocio/${id}` : '/api/etapas-negocio', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormEtapaNegocio();
  cargarEtapasNegocio();
});

btnCancelarEtapaNegocio.addEventListener('click', limpiarFormEtapaNegocio);

tablaEtapaNegocio.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar esta etapa?')) return;
    await eliminarYRecargar(`/api/etapas-negocio/${id}`, cargarEtapasNegocio);
  }

  if (e.target.classList.contains('btn-editar')) {
    etapaNegocioId.value = id;
    etapaNegocioNombre.value = e.target.dataset.nombre;
    btnCancelarEtapaNegocio.hidden = false;
    etapaNegocioNombre.focus();
  }
});

// ---------- Actividades (catalogo para Pendientes/Tareas) ----------

const formActividad = document.getElementById('form-actividad');
const actividadId = document.getElementById('actividad-id');
const actividadNombre = document.getElementById('actividad-nombre');
const btnCancelarActividad = document.getElementById('btn-cancelar-actividad');
const tablaActividades = document.getElementById('tabla-actividades');

async function cargarActividades() {
  const res = await fetch('/api/actividades');
  const filas = await res.json();
  tablaActividades.innerHTML = filas.map((f) => `
    <tr>
      <td>${escaparHtml(f.actividad)}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${f.id_actividad}" data-nombre="${escaparHtml(f.actividad)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${f.id_actividad}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function limpiarFormActividad() {
  actividadId.value = '';
  formActividad.reset();
  btnCancelarActividad.hidden = true;
}

formActividad.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { actividad: actividadNombre.value.trim() };
  const id = actividadId.value;
  const res = await fetch(id ? `/api/actividades/${id}` : '/api/actividades', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  limpiarFormActividad();
  cargarActividades();
});

btnCancelarActividad.addEventListener('click', limpiarFormActividad);

tablaActividades.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar esta actividad?')) return;
    await eliminarYRecargar(`/api/actividades/${id}`, cargarActividades);
  }

  if (e.target.classList.contains('btn-editar')) {
    actividadId.value = id;
    actividadNombre.value = e.target.dataset.nombre;
    btnCancelarActividad.hidden = false;
    actividadNombre.focus();
  }
});

// ---------- Almacenamiento de la base de datos (solo admin) ----------

const tabAlmacenamiento = document.getElementById('tab-almacenamiento');
const reporteAlmacenamiento = document.getElementById('reporte-almacenamiento');
const btnActualizarAlmacenamiento = document.getElementById('btn-actualizar-almacenamiento');

function formatearBytes(bytes) {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
  return (bytes / 1024 ** 2).toFixed(1) + ' MB';
}

async function cargarAlmacenamiento() {
  reporteAlmacenamiento.innerHTML = '<p>Cargando...</p>';
  const res = await fetch('/api/sistema/almacenamiento');
  if (!res.ok) {
    reporteAlmacenamiento.innerHTML = '<p>No se pudo obtener el tamaño de la base de datos.</p>';
    return;
  }
  const { bytesUsados, bytesLimite, plan } = await res.json();
  const porcentaje = Math.min(100, (bytesUsados / bytesLimite) * 100);
  let clase = 'barra-almacenamiento-ok';
  if (porcentaje >= 90) clase = 'barra-almacenamiento-critico';
  else if (porcentaje >= 70) clase = 'barra-almacenamiento-alerta';
  reporteAlmacenamiento.innerHTML = `
    <p><strong>${formatearBytes(bytesUsados)}</strong> usados de <strong>${formatearBytes(bytesLimite)}</strong> (plan ${escaparHtml(plan)}) — ${porcentaje.toFixed(1)}%</p>
    <div class="barra-almacenamiento-fondo">
      <div class="barra-almacenamiento ${clase}" style="width: ${porcentaje.toFixed(1)}%"></div>
    </div>
    ${porcentaje >= 90 ? '<p class="estatus-vencido">La base de datos está cerca del límite del plan. Considera liberar espacio o mejorar el plan de Supabase.</p>' : ''}
  `;
}

btnActualizarAlmacenamiento.addEventListener('click', cargarAlmacenamiento);

promesaAuth.then((sesion) => {
  if (!sesion) return;
  permisosCatalogos = sesion.permisos.catalogos;
  esAdminActual = sesion.esAdmin;

  formDestino.hidden = !permisosCatalogos.editar;
  formPlaza.hidden = !permisosCatalogos.editar;
  formGrupo.hidden = !permisosCatalogos.editar;
  formCadena.hidden = !permisosCatalogos.editar;
  formContacto.hidden = !permisosCatalogos.editar;
  formEstatus.hidden = !permisosCatalogos.editar;
  formEstadoEntrega.hidden = !permisosCatalogos.editar;
  formCategoria.hidden = !permisosCatalogos.editar;
  formLinea.hidden = !permisosCatalogos.editar;
  formMarca.hidden = !permisosCatalogos.editar;
  formProducto.hidden = !permisosCatalogos.editar;
  formEtapaNegocio.hidden = !permisosCatalogos.editar;
  formActividad.hidden = !permisosCatalogos.editar;
  btnUnificarDestinos.hidden = !permisosCatalogos.borrar;
  btnUnificarContactos.hidden = !permisosCatalogos.borrar;
  formCargaProductos.hidden = !permisosCatalogos.editar;
  btnPlantillaProductos.hidden = !permisosCatalogos.editar;
  formCargaContactos.hidden = !permisosCatalogos.editar;
  btnPlantillaContactos.hidden = !permisosCatalogos.editar;

  cargarDestinos();
  cargarPlazas();
  cargarGrupos();
  cargarCadenas();
  refrescarMultiSelectsDestino();
  cargarPanelDestinosContacto().then(() => cargarContactos());
  cargarEstatusCatalogo();
  cargarEstadosEntrega();
  cargarCategorias();
  cargarLineas();
  cargarMarcas();
  poblarSelectsProducto();
  cargarProductos();
  cargarEtapasNegocio();
  cargarActividades();

  if (sesion.esAdmin) {
    cargarUsuarios();
    cargarRepresentantes();
    cargarAlmacenamiento();
  } else {
    tabUsuarios.hidden = true;
    tabAlmacenamiento.hidden = true;
  }
});
