function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const vistaCargando = document.getElementById('vista-cargando');
const vistaPortal = document.getElementById('vista-portal');
const portalTitulo = document.getElementById('portal-titulo');
const listaPendientes = document.getElementById('lista-pendientes');
const listaRespondidas = document.getElementById('lista-respondidas');
const pendientesVacio = document.getElementById('pendientes-vacio');
const respondidasVacio = document.getElementById('respondidas-vacio');
const btnLogoutProveedor = document.getElementById('btn-logout-proveedor');
const plantillaPendiente = document.getElementById('plantilla-solicitud-pendiente');
const plantillaItemEditable = document.getElementById('plantilla-item-editable');
const plantillaRespondida = document.getElementById('plantilla-solicitud-respondida');

function renderizarPendiente(solicitud) {
  const nodo = plantillaPendiente.content.cloneNode(true);
  const form = nodo.querySelector('form');
  form.dataset.id = solicitud.id_solicitud;
  form.querySelector('.campo-destino').textContent = solicitud.destino_nombre || 'Sin especificar';
  form.querySelector('.campo-lugar-entrega').textContent = solicitud.lugar_entrega || 'Sin especificar';

  const tbody = form.querySelector('.tabla-items');
  solicitud.items.forEach((it) => {
    const fila = plantillaItemEditable.content.cloneNode(true);
    const tr = fila.querySelector('tr');
    tr.dataset.id = it.id;
    tr.querySelector('.celda-codigo').textContent = it.codigo;
    tr.querySelector('.celda-descripcion').textContent = it.descripcion || '';
    tr.querySelector('.celda-marca').textContent = it.marca || '';
    tr.querySelector('.celda-cantidad').textContent = it.cantidad;
    tbody.appendChild(fila);
  });

  return form;
}

function renderizarRespondida(solicitud) {
  const nodo = plantillaRespondida.content.cloneNode(true);
  const contenedor = nodo.querySelector('.panel-form');
  contenedor.querySelector('.campo-destino').textContent = solicitud.destino_nombre || 'Sin especificar';
  contenedor.querySelector('.campo-resumen-items').innerHTML = solicitud.items
    .map((it) => `${escaparHtml(it.codigo)}: ${it.precio_venta != null ? formatoImporte(it.precio_venta) : 'sin precio'} — ${escaparHtml(it.tiempo_entrega || 'sin tiempo de entrega')}`)
    .join('<br>');
  const comentariosEl = contenedor.querySelector('.campo-comentarios-resp');
  if (solicitud.comentarios) {
    comentariosEl.innerHTML = `<strong>Comentarios:</strong> ${escaparHtml(solicitud.comentarios)}`;
  } else {
    comentariosEl.remove();
  }
  return contenedor;
}

async function cargarSolicitudes() {
  const res = await fetch('/api/proveedor-portal/solicitudes');
  const solicitudes = await res.json();

  const pendientes = solicitudes.filter((s) => s.estatus !== 'Respondida');
  const respondidas = solicitudes.filter((s) => s.estatus === 'Respondida');

  listaPendientes.innerHTML = '';
  pendientesVacio.hidden = pendientes.length > 0;
  pendientes.forEach((s) => listaPendientes.appendChild(renderizarPendiente(s)));

  listaRespondidas.innerHTML = '';
  respondidasVacio.hidden = respondidas.length > 0;
  respondidas.forEach((s) => listaRespondidas.appendChild(renderizarRespondida(s)));
}

listaPendientes.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.dataset.id;
  const btn = form.querySelector('button[type="submit"]');

  const items = [...form.querySelectorAll('.tabla-items tr')].map((tr) => ({
    id: Number(tr.dataset.id),
    precio_venta: tr.querySelector('.item-precio-venta').value,
    tiempo_entrega: tr.querySelector('.item-tiempo-entrega').value,
  }));
  const comentarios = form.querySelector('.campo-comentarios').value.trim();

  btn.disabled = true;
  const res = await fetch(`/api/proveedor-portal/solicitudes/${encodeURIComponent(id)}/responder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, comentarios }),
  });
  btn.disabled = false;

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || res.statusText)));
    return;
  }

  await cargarSolicitudes();
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
  vistaCargando.hidden = true;
  vistaPortal.hidden = false;
}

iniciar();
