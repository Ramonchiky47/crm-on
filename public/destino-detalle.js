function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function fechaDe(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function campoFicha(etiqueta, valor) {
  return `<div><span>${escaparHtml(etiqueta)}</span><p>${valor !== null && valor !== undefined && valor !== '' ? escaparHtml(String(valor)) : '-'}</p></div>`;
}

const idDestino = new URLSearchParams(window.location.search).get('id');
let permisosCatalogos = { ver: false, editar: false, borrar: false };
let destinoActual = null;
let asociadosActual = { cotizaciones: [], ordenes: [], tareas: [], contactos: [] };

const destinoFicha = document.getElementById('destino-ficha');
const tituloDestino = document.getElementById('titulo-destino');
const btnEditarDestino = document.getElementById('btn-editar-destino');
const formEditarDestino = document.getElementById('form-editar-destino');
const btnCancelarEditarDestino = document.getElementById('btn-cancelar-editar-destino');
const editarDestinoNombre = document.getElementById('editar-destino-nombre');
const editarDestinoEmpresas = document.getElementById('editar-destino-empresas');

async function cargarDestino() {
  const res = await fetch(`/api/destinos/${encodeURIComponent(idDestino)}`);
  if (!res.ok) {
    destinoFicha.innerHTML = '<p>Hotel/local no encontrado.</p>';
    return;
  }
  destinoActual = await res.json();
  tituloDestino.textContent = destinoActual.destino;
  document.title = `${destinoActual.destino} · CRM-ON`;
  destinoFicha.innerHTML = `
    ${campoFicha('Nombre', destinoActual.destino)}
    ${campoFicha('Empresas', (destinoActual.empresas || []).join(', '))}
  `;
}

btnEditarDestino.addEventListener('click', () => {
  editarDestinoNombre.value = destinoActual.destino || '';
  editarDestinoEmpresas.value = (destinoActual.empresas || []).join(', ');
  formEditarDestino.hidden = false;
  btnEditarDestino.hidden = true;
});

btnCancelarEditarDestino.addEventListener('click', () => {
  formEditarDestino.hidden = true;
  btnEditarDestino.hidden = false;
});

formEditarDestino.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    destino: editarDestinoNombre.value.trim(),
    empresas: editarDestinoEmpresas.value.split(',').map((s) => s.trim()).filter(Boolean),
  };
  const res = await fetch(`/api/destinos/${encodeURIComponent(idDestino)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  formEditarDestino.hidden = true;
  btnEditarDestino.hidden = false;
  await cargarDestino();
});

// ---------- Contactos: agregar por buscador, quitar con boton ----------

const listaContactosDestino = document.getElementById('lista-contactos-destino');
const contadorContactos = document.getElementById('contador-contactos');
const buscarContactoAgregar = document.getElementById('buscar-contacto-agregar');
const opcionesContactoAgregar = document.getElementById('opciones-contacto-agregar');
let contactosDisponiblesCache = [];

async function cargarContactosDisponibles() {
  const res = await fetch('/api/contactos');
  contactosDisponiblesCache = await res.json();
}

function renderizarContactosDestino() {
  const contactos = asociadosActual.contactos || [];
  contadorContactos.textContent = `(${contactos.length})`;
  listaContactosDestino.innerHTML = contactos.length
    ? contactos.map((c) => `
        <div class="tarjeta-item">
          <a href="contacto-detalle.html?id=${c.id_contacto}">${escaparHtml([c.nombre, c.apellido].filter(Boolean).join(' '))}</a>
          ${permisosCatalogos.editar ? `<button type="button" class="btn-mini btn-quitar-contacto" data-id="${c.id_contacto}">Quitar</button>` : ''}
        </div>
      `).join('')
    : '<p class="tarjeta-vacio">Sin contactos asociados.</p>';
}

buscarContactoAgregar.addEventListener('input', () => {
  const filtro = buscarContactoAgregar.value.trim().toLowerCase();
  if (!filtro) {
    opcionesContactoAgregar.hidden = true;
    opcionesContactoAgregar.innerHTML = '';
    return;
  }
  const yaAsociados = new Set((asociadosActual.contactos || []).map((c) => c.id_contacto));
  const coincidencias = contactosDisponiblesCache
    .filter((c) => !yaAsociados.has(c.id_contacto) && c.nombre_completo_correo.toLowerCase().includes(filtro))
    .slice(0, 20);
  opcionesContactoAgregar.innerHTML = coincidencias.length
    ? coincidencias.map((c) => `<button type="button" data-id="${c.id_contacto}">${escaparHtml(c.nombre_completo_correo)}</button>`).join('')
    : '<button type="button" disabled>Sin resultados</button>';
  opcionesContactoAgregar.hidden = false;
});

opcionesContactoAgregar.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  const res = await fetch(`/api/destinos/${encodeURIComponent(idDestino)}/contactos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contacto_id: Number(id) }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  buscarContactoAgregar.value = '';
  opcionesContactoAgregar.hidden = true;
  await cargarAsociados();
});

listaContactosDestino.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('btn-quitar-contacto')) return;
  const id = e.target.dataset.id;
  const res = await fetch(`/api/destinos/${encodeURIComponent(idDestino)}/contactos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.ok) await cargarAsociados();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.tarjeta-buscador-wrap')) opcionesContactoAgregar.hidden = true;
});

// ---------- Cotizaciones, Ordenes y Tareas (via /asociados) ----------

const listaCotizaciones = document.getElementById('lista-cotizaciones');
const contadorCotizaciones = document.getElementById('contador-cotizaciones');
const listaOrdenes = document.getElementById('lista-ordenes');
const contadorOrdenes = document.getElementById('contador-ordenes');
const listaTareas = document.getElementById('lista-tareas');
const contadorTareas = document.getElementById('contador-tareas');
const linkAgregarCotizacion = document.getElementById('link-agregar-cotizacion');
const selectNuevaTareaOrden = document.getElementById('nueva-tarea-orden');
const btnMostrarFormTarea = document.getElementById('btn-mostrar-form-tarea');
const pistaTareaSinOrden = document.getElementById('pista-tarea-sin-orden');

async function cargarAsociados() {
  const res = await fetch(`/api/destinos/${encodeURIComponent(idDestino)}/asociados`);
  asociadosActual = await res.json();

  renderizarContactosDestino();

  contadorCotizaciones.textContent = `(${asociadosActual.cotizaciones.length})`;
  listaCotizaciones.innerHTML = asociadosActual.cotizaciones.length
    ? asociadosActual.cotizaciones.map((q) => `
        <div class="tarjeta-item">
          <a href="cotizaciones.html?cotizacion=${encodeURIComponent(q.id_cotizacion)}">${escaparHtml(q.nombre)}</a>
          <span>${escaparHtml(q.moneda)} ${formatoImporte(q.gran_total)}</span>
        </div>
      `).join('')
    : '<p class="tarjeta-vacio">Sin cotizaciones.</p>';
  linkAgregarCotizacion.href = `cotizaciones.html?tab=captura&destino_id=${encodeURIComponent(idDestino)}`;
  linkAgregarCotizacion.hidden = !permisosCatalogos.editar;

  contadorOrdenes.textContent = `(${asociadosActual.ordenes.length})`;
  listaOrdenes.innerHTML = asociadosActual.ordenes.length
    ? asociadosActual.ordenes.map((o) => `
        <div class="tarjeta-item">
          <span class="tarjeta-item-nombre" data-ir-orden="${escaparHtml(o.id)}">${escaparHtml(o.id)} — ${escaparHtml(o.nombre || '')}</span>
          <span>${formatoImporte(o.importe)}</span>
        </div>
      `).join('')
    : '<p class="tarjeta-vacio">Sin órdenes.</p>';

  contadorTareas.textContent = `(${asociadosActual.tareas.length})`;
  listaTareas.innerHTML = asociadosActual.tareas.length
    ? asociadosActual.tareas.map((p) => `
        <div class="tarjeta-item">
          <span>${escaparHtml(p.nombre)}</span>
          <span>${escaparHtml(fechaDe(p.fecha_compromiso))}</span>
        </div>
      `).join('')
    : '<p class="tarjeta-vacio">Sin tareas.</p>';

  selectNuevaTareaOrden.innerHTML = asociadosActual.ordenes.map((o) => `<option value="${o.id}">${escaparHtml(o.id)} — ${escaparHtml(o.nombre || '')}</option>`).join('');
  const tieneOrdenes = asociadosActual.ordenes.length > 0;
  btnMostrarFormTarea.hidden = !tieneOrdenes || !permisosCatalogos.editar;
  pistaTareaSinOrden.hidden = tieneOrdenes;
}

listaOrdenes.addEventListener('click', (e) => {
  const id = e.target.dataset.irOrden;
  if (id) window.location.href = `ordenes.html?orden=${encodeURIComponent(id)}`;
});

// ---------- Nueva tarea ----------

const formNuevaTarea = document.getElementById('form-nueva-tarea');
const btnCancelarNuevaTarea = document.getElementById('btn-cancelar-nueva-tarea');
const nuevaTareaNombre = document.getElementById('nueva-tarea-nombre');
const nuevaTareaFecha = document.getElementById('nueva-tarea-fecha');
const nuevaTareaActividades = document.getElementById('nueva-tarea-actividades');

async function cargarActividadesCache() {
  const res = await fetch('/api/actividades');
  const actividades = await res.json();
  nuevaTareaActividades.innerHTML = actividades.map((a) => `
    <label><input type="checkbox" value="${a.id_actividad}" /> ${escaparHtml(a.actividad)}</label>
  `).join('');
}

btnMostrarFormTarea.addEventListener('click', () => {
  formNuevaTarea.hidden = false;
  btnMostrarFormTarea.hidden = true;
});
btnCancelarNuevaTarea.addEventListener('click', () => {
  formNuevaTarea.hidden = true;
  btnMostrarFormTarea.hidden = false;
  formNuevaTarea.reset();
});

formNuevaTarea.addEventListener('submit', async (e) => {
  e.preventDefault();
  const actividades = [...nuevaTareaActividades.querySelectorAll('input:checked')].map((cb) => Number(cb.value));
  if (actividades.length === 0) {
    alert('Selecciona al menos una actividad.');
    return;
  }
  const res = await fetch('/api/pendientes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: nuevaTareaNombre.value.trim(),
      fecha_compromiso: nuevaTareaFecha.value || null,
      orden_id: selectNuevaTareaOrden.value,
      actividades,
    }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }
  formNuevaTarea.reset();
  formNuevaTarea.hidden = true;
  btnMostrarFormTarea.hidden = false;
  await cargarAsociados();
});

promesaAuth.then(async (sesion) => {
  if (!sesion) return;
  if (!idDestino) {
    destinoFicha.innerHTML = '<p>Falta el id del hotel/local.</p>';
    return;
  }
  permisosCatalogos = sesion.permisos.catalogos;
  formEditarDestino.hidden = true;
  btnEditarDestino.hidden = !permisosCatalogos.editar;
  document.querySelector('.tarjeta-buscador-wrap').hidden = !permisosCatalogos.editar;

  await Promise.all([cargarContactosDisponibles(), cargarActividadesCache()]);
  await cargarDestino();
  await cargarAsociados();
});
