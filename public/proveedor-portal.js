function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function resumenProductos(items) {
  return items.map((it) => `${it.codigo} (x${it.cantidad})`).join(', ');
}

const vistaCargando = document.getElementById('vista-cargando');
const vistaPortal = document.getElementById('vista-portal');
const portalTitulo = document.getElementById('portal-titulo');
const btnLogoutProveedor = document.getElementById('btn-logout-proveedor');

const vistaLista = document.getElementById('vista-lista');
const tablaPendientes = document.getElementById('tabla-pendientes');
const tablaRespondidas = document.getElementById('tabla-respondidas');
const pendientesVacio = document.getElementById('pendientes-vacio');
const respondidasVacio = document.getElementById('respondidas-vacio');

const vistaDetalle = document.getElementById('vista-detalle');
const btnVolverLista = document.getElementById('btn-volver-lista');
const formDetalleSolicitud = document.getElementById('form-detalle-solicitud');
const detalleDestino = formDetalleSolicitud.querySelector('.campo-destino');
const detalleLugarEntrega = formDetalleSolicitud.querySelector('.campo-lugar-entrega');
const detalleTablaItems = formDetalleSolicitud.querySelector('.tabla-items');
const detalleComentarios = formDetalleSolicitud.querySelector('.campo-comentarios');
const detalleBtnEnviar = formDetalleSolicitud.querySelector('button[type="submit"]');

const plantillaItemEditable = document.getElementById('plantilla-item-editable');
const plantillaItemSoloLectura = document.getElementById('plantilla-item-solo-lectura');

let solicitudesPendientes = [];
let solicitudesRespondidas = [];

function mostrarVistaLista() {
  vistaDetalle.hidden = true;
  vistaLista.hidden = false;
}

function mostrarVistaDetalle() {
  vistaLista.hidden = true;
  vistaDetalle.hidden = false;
}

function abrirDetalle(solicitud, editable) {
  formDetalleSolicitud.dataset.id = solicitud.id_solicitud;
  formDetalleSolicitud.dataset.editable = editable ? 'true' : 'false';
  detalleDestino.textContent = solicitud.destino_nombre || 'Sin especificar';
  detalleLugarEntrega.textContent = solicitud.lugar_entrega || 'Sin especificar';

  detalleTablaItems.innerHTML = '';
  solicitud.items.forEach((it) => {
    const plantilla = editable ? plantillaItemEditable : plantillaItemSoloLectura;
    const fila = plantilla.content.cloneNode(true);
    const tr = fila.querySelector('tr');
    tr.dataset.id = it.id;
    tr.querySelector('.celda-codigo').textContent = it.codigo;
    tr.querySelector('.celda-descripcion').textContent = it.descripcion || '';
    tr.querySelector('.celda-marca').textContent = it.marca || '';
    tr.querySelector('.celda-cantidad').textContent = it.cantidad;
    if (editable) {
      tr.querySelector('.item-precio-venta').value = it.precio_venta ?? '';
      tr.querySelector('.item-tiempo-entrega').value = it.tiempo_entrega || '';
      tr.querySelector('.item-comentarios').value = it.comentarios || '';
    } else {
      tr.querySelector('.celda-precio').textContent = it.precio_venta != null ? formatoImporte(it.precio_venta) : 'sin precio';
      tr.querySelector('.celda-tiempo').textContent = it.tiempo_entrega || 'sin tiempo de entrega';
      tr.querySelector('.celda-comentarios').textContent = it.comentarios || '';
    }
    detalleTablaItems.appendChild(fila);
  });

  detalleComentarios.value = solicitud.comentarios || '';
  detalleComentarios.disabled = !editable;
  detalleBtnEnviar.hidden = !editable;

  mostrarVistaDetalle();
}

function renderizarTablas() {
  pendientesVacio.hidden = solicitudesPendientes.length > 0;
  tablaPendientes.hidden = solicitudesPendientes.length === 0;
  tablaPendientes.querySelector('tbody').innerHTML = solicitudesPendientes.map((s) => `
    <tr data-id="${escaparHtml(s.id_solicitud)}">
      <td>${escaparHtml(s.destino_nombre || 'Sin especificar')}</td>
      <td>${escaparHtml(s.lugar_entrega || 'Sin especificar')}</td>
      <td>${escaparHtml(resumenProductos(s.items))}</td>
      <td><button type="button" class="btn-mini btn-abrir-pendiente" data-id="${escaparHtml(s.id_solicitud)}">Cotizar</button></td>
    </tr>
  `).join('');

  respondidasVacio.hidden = solicitudesRespondidas.length > 0;
  tablaRespondidas.hidden = solicitudesRespondidas.length === 0;
  tablaRespondidas.querySelector('tbody').innerHTML = solicitudesRespondidas.map((s) => `
    <tr data-id="${escaparHtml(s.id_solicitud)}">
      <td>${escaparHtml(s.destino_nombre || 'Sin especificar')}</td>
      <td>${escaparHtml(s.lugar_entrega || 'Sin especificar')}</td>
      <td>${escaparHtml(resumenProductos(s.items))}</td>
      <td>${s.tiempo_respuesta ? escaparHtml(s.tiempo_respuesta.texto) : ''}</td>
      <td><button type="button" class="btn-mini btn-abrir-respondida" data-id="${escaparHtml(s.id_solicitud)}">Ver</button></td>
    </tr>
  `).join('');
}

async function cargarSolicitudes() {
  const res = await fetch('/api/proveedor-portal/solicitudes');
  const solicitudes = await res.json();
  solicitudesPendientes = solicitudes.filter((s) => s.estatus !== 'Respondida');
  solicitudesRespondidas = solicitudes.filter((s) => s.estatus === 'Respondida');
  renderizarTablas();
}

tablaPendientes.addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (!id || !e.target.classList.contains('btn-abrir-pendiente')) return;
  const solicitud = solicitudesPendientes.find((s) => s.id_solicitud === id);
  if (solicitud) abrirDetalle(solicitud, true);
});

tablaRespondidas.addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (!id || !e.target.classList.contains('btn-abrir-respondida')) return;
  const solicitud = solicitudesRespondidas.find((s) => s.id_solicitud === id);
  if (solicitud) abrirDetalle(solicitud, false);
});

btnVolverLista.addEventListener('click', mostrarVistaLista);

formDetalleSolicitud.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (formDetalleSolicitud.dataset.editable !== 'true') return;

  const id = formDetalleSolicitud.dataset.id;
  const items = [...detalleTablaItems.querySelectorAll('tr')].map((tr) => ({
    id: Number(tr.dataset.id),
    precio_venta: tr.querySelector('.item-precio-venta').value,
    tiempo_entrega: tr.querySelector('.item-tiempo-entrega').value,
    comentarios: tr.querySelector('.item-comentarios').value,
  }));
  const comentarios = detalleComentarios.value.trim();

  detalleBtnEnviar.disabled = true;
  const res = await fetch(`/api/proveedor-portal/solicitudes/${encodeURIComponent(id)}/responder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, comentarios }),
  });
  detalleBtnEnviar.disabled = false;

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || res.statusText)));
    return;
  }

  await cargarSolicitudes();
  mostrarVistaLista();
});

btnLogoutProveedor.addEventListener('click', async () => {
  await fetch('/api/proveedor-portal/logout', { method: 'POST' });
  window.location.href = 'proveedor-login.html';
});

async function iniciar() {
  const res = await fetch('/api/proveedor-portal/me');
  if (!res.ok) {
    window.location.href = 'proveedor-login.html';
    return;
  }
  const proveedor = await res.json();
  portalTitulo.textContent = `Hola, ${proveedor.nombre}`;

  await cargarSolicitudes();
  mostrarVistaLista();
  vistaCargando.hidden = true;
  vistaPortal.hidden = false;
}

iniciar();
