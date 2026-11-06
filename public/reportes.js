function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- Pendiente por facturar / Pendiente por entregar (por modelo) ----------
// Dos reportes "por modelo" independientes del de Hotel/Artículo de abajo: ya vienen ordenados
// por importe (desc) desde el servidor, asi que no tienen su propio encabezado ordenable (para no
// chocar con el "th[data-campo]" generico, que es solo de la tabla de Hotel/Artículo).

const REPORTES_PENDIENTE = {
  entregar: {
    endpoint: '/api/reportes/pendiente-entregar',
    endpointDetalle: '/api/reportes/pendiente-entregar/detalle',
    tbody: document.getElementById('tabla-pendiente-entregar'),
    totalCantidad: document.getElementById('total-cantidad-pendiente-entregar'),
    totalImporte: document.getElementById('total-importe-pendiente-entregar'),
    estadoVacio: document.getElementById('estado-vacio-pendiente-entregar'),
    titulo: 'Pendiente por entregar',
  },
};

// "Pendiente por facturar" trae del servidor filas CRUDAS (una por Orden+Articulo, sin agregar) y
// arma 3 vistas en el cliente a partir del mismo arreglo: Por pedido (checkbox para ocultar a
// mano), Por cliente (agrupa por hotel) y Detalle por producto (agrupa por codigo). Asi un mismo
// modelo fisico partido en dos codigos de NetSuite (ej. sufijo "_OLD") no se mezcla con otro
// pedido/cliente, y cada vista se arma sin volver a pedir al servidor.
//
// A veces el sistema no puede distinguir una orden ya resuelta en la realidad de una pendiente de
// verdad (ej. factura hecha fuera de NetSuite). Por eso, en la vista "Por pedido", hay un checkbox
// para ocultarlas a mano (reportes_ocultos en el servidor) sin borrar la orden, con un chip para
// verlas/restaurarlas.
const encabezadoPendienteFacturar = document.getElementById('encabezado-pendiente-facturar');
const tablaPendienteFacturar = document.getElementById('tabla-pendiente-facturar');
const piePendienteFacturar = document.getElementById('pie-pendiente-facturar');
const estadoVacioPendienteFacturar = document.getElementById('estado-vacio-pendiente-facturar');
const barraSeleccionPendienteFacturar = document.getElementById('barra-seleccion-pendiente-facturar');
const btnOcultarPendienteFacturar = document.getElementById('btn-ocultar-pendiente-facturar');
const conteoSeleccionPendienteFacturar = document.getElementById('conteo-seleccion-pendiente-facturar');
const chipVerOcultasPendienteFacturar = document.getElementById('chip-ver-ocultas-pendiente-facturar');
const chipOcultasPendienteFacturarConteo = document.getElementById('chip-ocultas-pendiente-facturar-conteo');
const resumenPedidosPendienteFacturar = document.getElementById('resumen-pedidos-pendiente-facturar');
const resumenCodigosPendienteFacturar = document.getElementById('resumen-codigos-pendiente-facturar');
const resumenCantidadPendienteFacturar = document.getElementById('resumen-cantidad-pendiente-facturar');
const resumenImportePendienteFacturar = document.getElementById('resumen-importe-pendiente-facturar');
const botonesVistaPendienteFacturar = document.querySelectorAll('#vistas-pendiente-facturar [data-vista]');

let mostrarOcultasPendienteFacturar = false;
let vistaPendienteFacturar = 'pedido';
let filasCrudasPendienteFacturar = [];
const seleccionPendienteFacturar = new Set();

function enlacesPedidos(ids) {
  return [...ids].sort().map((id) => `<a href="ordenes.html?orden=${encodeURIComponent(id)}">${escaparHtml(id)}</a>`).join(', ');
}

function actualizarBarraSeleccionPendienteFacturar() {
  conteoSeleccionPendienteFacturar.textContent = seleccionPendienteFacturar.size;
  btnOcultarPendienteFacturar.hidden = seleccionPendienteFacturar.size === 0 || mostrarOcultasPendienteFacturar;
  btnOcultarPendienteFacturar.textContent = mostrarOcultasPendienteFacturar
    ? `Restaurar seleccionadas (${seleccionPendienteFacturar.size})`
    : `Ocultar seleccionadas (${seleccionPendienteFacturar.size})`;
}

function renderVistaPedidoPendienteFacturar() {
  const porOrden = new Map();
  for (const f of filasCrudasPendienteFacturar) {
    if (!porOrden.has(f.orden_id)) {
      porOrden.set(f.orden_id, { hotel: f.hotel, estatus_sistema: f.estatus_sistema, modelos: new Set(), cantidad: 0, importe: 0 });
    }
    const g = porOrden.get(f.orden_id);
    g.modelos.add(f.modelo);
    g.cantidad += Number(f.cantidad) || 0;
    g.importe += Number(f.importe) || 0;
  }
  const filas = [...porOrden.entries()].sort((a, b) => b[1].importe - a[1].importe);

  encabezadoPendienteFacturar.innerHTML = `
    <tr>
      <th><input type="checkbox" id="check-todas-pendiente-facturar" /></th>
      <th>Orden</th><th>Hotel</th><th>Estatus</th><th>Modelo</th><th>Cantidad</th><th>Importe</th>
    </tr>
  `;
  tablaPendienteFacturar.innerHTML = filas.map(([ordenId, g]) => `
    <tr>
      <td><input type="checkbox" class="check-pendiente-facturar" data-orden="${escaparHtml(ordenId)}" /></td>
      <td><a href="ordenes.html?orden=${encodeURIComponent(ordenId)}">${escaparHtml(ordenId)}</a></td>
      <td>${escaparHtml(g.hotel || '(sin hotel/local)')}</td>
      <td>${escaparHtml(g.estatus_sistema || '')}</td>
      <td>${escaparHtml([...g.modelos].join(', '))}</td>
      <td>${g.cantidad}</td>
      <td>${formatoImporte(g.importe)}</td>
    </tr>
  `).join('');
  piePendienteFacturar.innerHTML = `
    <tr>
      <td colspan="5"><strong>Total</strong></td>
      <td>${filas.reduce((s, [, g]) => s + g.cantidad, 0)}</td>
      <td>${formatoImporte(filas.reduce((s, [, g]) => s + g.importe, 0))}</td>
    </tr>
  `;

  document.getElementById('check-todas-pendiente-facturar').addEventListener('change', (e) => {
    const marcar = e.target.checked;
    tablaPendienteFacturar.querySelectorAll('.check-pendiente-facturar').forEach((chk) => {
      chk.checked = marcar;
      if (marcar) seleccionPendienteFacturar.add(chk.dataset.orden);
      else seleccionPendienteFacturar.delete(chk.dataset.orden);
    });
    actualizarBarraSeleccionPendienteFacturar();
  });
}

function renderVistaClientePendienteFacturar() {
  const porHotel = new Map();
  for (const f of filasCrudasPendienteFacturar) {
    const clave = f.hotel || '(sin hotel/local)';
    if (!porHotel.has(clave)) porHotel.set(clave, { pedidos: new Set(), cantidad: 0, importe: 0 });
    const g = porHotel.get(clave);
    g.pedidos.add(f.orden_id);
    g.cantidad += Number(f.cantidad) || 0;
    g.importe += Number(f.importe) || 0;
  }
  const filas = [...porHotel.entries()].sort((a, b) => b[1].importe - a[1].importe);

  encabezadoPendienteFacturar.innerHTML = `<tr><th>Hotel</th><th>Pedidos</th><th>Cantidad</th><th>Importe</th></tr>`;
  tablaPendienteFacturar.innerHTML = filas.map(([hotel, g]) => `
    <tr>
      <td>${escaparHtml(hotel)}</td>
      <td>${enlacesPedidos(g.pedidos)}</td>
      <td>${g.cantidad}</td>
      <td>${formatoImporte(g.importe)}</td>
    </tr>
  `).join('');
  piePendienteFacturar.innerHTML = `
    <tr>
      <td><strong>Total</strong></td>
      <td></td>
      <td>${filas.reduce((s, [, g]) => s + g.cantidad, 0)}</td>
      <td>${formatoImporte(filas.reduce((s, [, g]) => s + g.importe, 0))}</td>
    </tr>
  `;
}

function renderVistaProductoPendienteFacturar() {
  const porModelo = new Map();
  for (const f of filasCrudasPendienteFacturar) {
    if (!porModelo.has(f.modelo)) porModelo.set(f.modelo, { pedidos: new Set(), cantidad: 0, importe: 0 });
    const g = porModelo.get(f.modelo);
    g.pedidos.add(f.orden_id);
    g.cantidad += Number(f.cantidad) || 0;
    g.importe += Number(f.importe) || 0;
  }
  const filas = [...porModelo.entries()].sort((a, b) => b[1].importe - a[1].importe);

  encabezadoPendienteFacturar.innerHTML = `<tr><th>Código</th><th>Pedidos</th><th>Cantidad</th><th>Importe</th></tr>`;
  tablaPendienteFacturar.innerHTML = filas.map(([modelo, g]) => `
    <tr>
      <td>${escaparHtml(modelo)}</td>
      <td>${enlacesPedidos(g.pedidos)}</td>
      <td>${g.cantidad}</td>
      <td>${formatoImporte(g.importe)}</td>
    </tr>
  `).join('');
  piePendienteFacturar.innerHTML = `
    <tr>
      <td><strong>Total</strong></td>
      <td></td>
      <td>${filas.reduce((s, [, g]) => s + g.cantidad, 0)}</td>
      <td>${formatoImporte(filas.reduce((s, [, g]) => s + g.importe, 0))}</td>
    </tr>
  `;
}

function renderVistaPendienteFacturar() {
  seleccionPendienteFacturar.clear();
  barraSeleccionPendienteFacturar.hidden = vistaPendienteFacturar !== 'pedido';
  if (vistaPendienteFacturar === 'pedido') renderVistaPedidoPendienteFacturar();
  else if (vistaPendienteFacturar === 'cliente') renderVistaClientePendienteFacturar();
  else renderVistaProductoPendienteFacturar();
  actualizarBarraSeleccionPendienteFacturar();
}

async function cargarReportePendienteFacturar() {
  const res = await fetch(`/api/reportes/pendiente-facturar${mostrarOcultasPendienteFacturar ? '?ocultas=1' : ''}`);
  const { filas, totalOcultas } = await res.json();
  filasCrudasPendienteFacturar = filas;

  estadoVacioPendienteFacturar.hidden = filas.length !== 0;
  chipOcultasPendienteFacturarConteo.textContent = `(${totalOcultas})`;
  chipVerOcultasPendienteFacturar.classList.toggle('chip-estatus-activo', mostrarOcultasPendienteFacturar);

  const pedidosDistintos = new Set();
  const codigosDistintos = new Set();
  let cantidadTotal = 0;
  let importeTotal = 0;
  for (const f of filas) {
    pedidosDistintos.add(f.orden_id);
    codigosDistintos.add(f.modelo);
    cantidadTotal += Number(f.cantidad) || 0;
    importeTotal += Number(f.importe) || 0;
  }
  resumenPedidosPendienteFacturar.textContent = pedidosDistintos.size;
  resumenCodigosPendienteFacturar.textContent = codigosDistintos.size;
  resumenCantidadPendienteFacturar.textContent = cantidadTotal;
  resumenImportePendienteFacturar.textContent = `$${formatoImporte(importeTotal)}`;

  renderVistaPendienteFacturar();
}

tablaPendienteFacturar.addEventListener('change', (e) => {
  if (!e.target.classList.contains('check-pendiente-facturar')) return;
  const ordenId = e.target.dataset.orden;
  if (e.target.checked) seleccionPendienteFacturar.add(ordenId);
  else seleccionPendienteFacturar.delete(ordenId);
  actualizarBarraSeleccionPendienteFacturar();
});

btnOcultarPendienteFacturar.addEventListener('click', async () => {
  const ordenes = [...seleccionPendienteFacturar];
  if (!ordenes.length) return;
  const accion = mostrarOcultasPendienteFacturar ? 'restaurar' : 'ocultar';
  await fetch(`/api/reportes/pendiente-facturar/${accion}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordenes }),
  });
  await cargarReportePendienteFacturar();
});

chipVerOcultasPendienteFacturar.addEventListener('click', async () => {
  mostrarOcultasPendienteFacturar = !mostrarOcultasPendienteFacturar;
  vistaPendienteFacturar = 'pedido';
  botonesVistaPendienteFacturar.forEach((b) => b.classList.toggle('chip-estatus-activo', b.dataset.vista === 'pedido'));
  await cargarReportePendienteFacturar();
});

botonesVistaPendienteFacturar.forEach((boton) => {
  boton.addEventListener('click', () => {
    vistaPendienteFacturar = boton.dataset.vista;
    botonesVistaPendienteFacturar.forEach((b) => b.classList.toggle('chip-estatus-activo', b === boton));
    if (vistaPendienteFacturar !== 'pedido' && mostrarOcultasPendienteFacturar) {
      mostrarOcultasPendienteFacturar = false;
      chipVerOcultasPendienteFacturar.classList.remove('chip-estatus-activo');
      cargarReportePendienteFacturar();
    } else {
      renderVistaPendienteFacturar();
    }
  });
});

async function cargarReportePendiente(clave) {
  const cfg = REPORTES_PENDIENTE[clave];
  const res = await fetch(cfg.endpoint);
  const filas = await res.json();

  cfg.tbody.innerHTML = '';
  cfg.estadoVacio.hidden = filas.length !== 0;

  let cantidadTotal = 0;
  let importeTotal = 0;
  for (const f of filas) {
    cantidadTotal += Number(f.cantidad_total) || 0;
    importeTotal += Number(f.importe_total) || 0;

    const tr = document.createElement('tr');
    tr.classList.add('fila-clicable');
    tr.dataset.clave = clave;
    tr.dataset.articulo = f.articulo;
    tr.innerHTML = `
      <td>${escaparHtml(f.articulo)}</td>
      <td>${f.cantidad_total ?? ''}</td>
      <td>${formatoImporte(f.importe_total)}</td>
      <td>${f.num_ordenes}</td>
    `;
    cfg.tbody.appendChild(tr);
  }

  cfg.totalCantidad.textContent = filas.length ? cantidadTotal : '';
  cfg.totalImporte.textContent = filas.length ? formatoImporte(importeTotal) : '';
}

const modalPendienteOverlay = document.getElementById('modal-pendiente-overlay');
const modalPendienteContenido = document.getElementById('modal-pendiente-contenido');
const modalPendienteCerrar = document.getElementById('modal-pendiente-cerrar');

async function abrirDetallePendiente(clave, articulo) {
  const cfg = REPORTES_PENDIENTE[clave];
  const res = await fetch(`${cfg.endpointDetalle}?articulo=${encodeURIComponent(articulo)}`);
  const filas = await res.json();

  modalPendienteContenido.innerHTML = `
    <h2>${escaparHtml(articulo)}</h2>
    <p class="pista">${escaparHtml(cfg.titulo)} · ${filas.length} orden(es)</p>
    <div class="tabla-scroll">
      <table>
        <thead>
          <tr><th>Cliente</th><th>Fecha de pedido</th><th>Orden</th><th>Cantidad</th><th>Importe</th></tr>
        </thead>
        <tbody>
          ${filas.map((f) => `
            <tr>
              <td>${escaparHtml(f.hotel || '(sin hotel/local)')}${f.contacto_nombre ? ` · ${escaparHtml(f.contacto_nombre)}` : ''}</td>
              <td>${escaparHtml(f.fecha_pedido || '')}</td>
              <td><a href="ordenes.html?orden=${encodeURIComponent(f.orden_id)}">${escaparHtml(f.orden_id)}</a></td>
              <td>${f.cantidad ?? ''}</td>
              <td>${formatoImporte(f.importe)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  modalPendienteOverlay.hidden = false;
}

function cerrarModalPendiente() {
  modalPendienteOverlay.hidden = true;
  modalPendienteContenido.innerHTML = '';
}

modalPendienteCerrar.addEventListener('click', cerrarModalPendiente);
modalPendienteOverlay.addEventListener('click', (e) => {
  if (e.target === modalPendienteOverlay) cerrarModalPendiente();
});
REPORTES_PENDIENTE.entregar.tbody.addEventListener('click', (e) => {
  const fila = e.target.closest('tr[data-articulo]');
  if (fila) abrirDetallePendiente(fila.dataset.clave, fila.dataset.articulo);
});

const filtroArticulo = document.getElementById('filtro-articulo');
const filtroHotel = document.getElementById('filtro-hotel');
const filtroEstatusBtn = document.getElementById('filtro-estatus-btn');
const filtroEstatusPanel = document.getElementById('filtro-estatus-panel');
const resumenReporte = document.getElementById('resumen-reporte');
const tablaReporte = document.getElementById('tabla-reporte');
const totalCantidad = document.getElementById('total-cantidad');
const totalImporte = document.getElementById('total-importe');
const estadoVacio = document.getElementById('estado-vacio');

const estatusSeleccionados = new Set();

// ---------- Filtro multi-seleccion de Estatus (preseleccionado en "Pendiente") ----------

async function cargarFiltroEstatus() {
  const res = await fetch('/api/estatus');
  const lista = (await res.json()).filter((e) => e.estatus);

  const pendiente = lista.find((e) => e.estatus === 'Pendiente');
  if (pendiente) estatusSeleccionados.add(String(pendiente.id_estatus));

  if (!lista.length) {
    filtroEstatusPanel.innerHTML = '<p class="pista">No hay estatus capturados.</p>';
    return;
  }

  filtroEstatusPanel.innerHTML = `
    <label class="multi-select-opcion multi-select-todos">
      <input type="checkbox" id="filtro-estatus-todos" /> Seleccionar todos
    </label>
  ` + lista.map((e) => `
    <label class="multi-select-opcion">
      <input type="checkbox" value="${e.id_estatus}" ${estatusSeleccionados.has(String(e.id_estatus)) ? 'checked' : ''} /> ${escaparHtml(e.estatus)}
    </label>
  `).join('');

  actualizarBotonFiltroEstatus();
}

function actualizarBotonFiltroEstatus() {
  if (estatusSeleccionados.size === 0) {
    filtroEstatusBtn.textContent = 'Todos los estatus';
  } else if (estatusSeleccionados.size === 1) {
    const opcion = filtroEstatusPanel.querySelector(`input[value="${[...estatusSeleccionados][0]}"]`);
    filtroEstatusBtn.textContent = opcion ? opcion.parentElement.textContent.trim() : '1 estatus seleccionado';
  } else {
    filtroEstatusBtn.textContent = `${estatusSeleccionados.size} estatus seleccionados`;
  }
}

filtroEstatusBtn.addEventListener('click', () => {
  filtroEstatusPanel.hidden = !filtroEstatusPanel.hidden;
});

filtroEstatusPanel.addEventListener('change', (e) => {
  if (e.target.type !== 'checkbox') return;

  if (e.target.id === 'filtro-estatus-todos') {
    filtroEstatusPanel.querySelectorAll('input[type="checkbox"]:not(#filtro-estatus-todos)').forEach((cb) => {
      cb.checked = e.target.checked;
      if (e.target.checked) estatusSeleccionados.add(cb.value);
      else estatusSeleccionados.delete(cb.value);
    });
  } else if (e.target.checked) {
    estatusSeleccionados.add(e.target.value);
  } else {
    estatusSeleccionados.delete(e.target.value);
  }

  actualizarBotonFiltroEstatus();
  cargarReporte();
});

document.addEventListener('click', (e) => {
  if (!document.getElementById('filtro-estatus-wrap').contains(e.target)) {
    filtroEstatusPanel.hidden = true;
  }
});

// ---------- Reporte ----------

let ultimasFilas = [];
const orden = { campo: null, direccion: 'asc' };

async function cargarReporte() {
  const parametros = new URLSearchParams();
  parametros.set('estatus', [...estatusSeleccionados].join(','));
  const articulo = filtroArticulo.value.trim();
  if (articulo) parametros.set('articulo', articulo);
  const hotel = filtroHotel.value.trim();
  if (hotel) parametros.set('hotel', hotel);

  const res = await fetch(`/api/reportes/articulos?${parametros}`);
  const data = await res.json();
  ultimasFilas = data.filas;
  ordenarYRenderizar();
}

function comparar(va, vb) {
  if (va === null || va === undefined) va = '';
  if (vb === null || vb === undefined) vb = '';
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  return String(va).localeCompare(String(vb), 'es', { numeric: true });
}

function ordenarYRenderizar() {
  let filas = ultimasFilas;
  if (orden.campo) {
    filas = [...ultimasFilas].sort((a, b) => {
      const cmp = comparar(a[orden.campo], b[orden.campo]);
      return orden.direccion === 'asc' ? cmp : -cmp;
    });
  }
  renderizar(filas);
  actualizarIndicadoresOrden();
}

function actualizarIndicadoresOrden() {
  document.querySelectorAll('th[data-campo]').forEach((th) => {
    if (!th.dataset.etiqueta) th.dataset.etiqueta = th.textContent.trim();
    const base = th.dataset.etiqueta;
    th.textContent = th.dataset.campo === orden.campo
      ? `${base} ${orden.direccion === 'asc' ? '▲' : '▼'}`
      : base;
  });
}

document.querySelectorAll('th[data-campo]').forEach((th) => {
  th.classList.add('th-ordenable');
  th.addEventListener('click', () => {
    if (orden.campo === th.dataset.campo) {
      orden.direccion = orden.direccion === 'asc' ? 'desc' : 'asc';
    } else {
      orden.campo = th.dataset.campo;
      orden.direccion = 'asc';
    }
    ordenarYRenderizar();
  });
});

function renderizar(filas) {
  tablaReporte.innerHTML = '';
  estadoVacio.hidden = filas.length !== 0;

  let cantidadTotal = 0;
  let importeTotal = 0;

  for (const f of filas) {
    cantidadTotal += f.cantidad_total || 0;
    importeTotal += f.importe_total || 0;

    const pedidosHtml = (f.pedidos || '').split(',').map((id) => id.trim()).filter(Boolean)
      .map((id) => `<a href="ordenes.html?orden=${encodeURIComponent(id)}">${escaparHtml(id)}</a>`)
      .join(', ');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escaparHtml(f.hotel || '(sin hotel/local)')}</td>
      <td>${escaparHtml(f.articulo)}</td>
      <td>${pedidosHtml}</td>
      <td>${f.cantidad_total ?? ''}</td>
      <td>${formatoImporte(f.importe_total)}</td>
      <td><button type="button" class="btn-ordenes-combo" data-hotel="${escaparHtml(f.hotel || '')}" data-articulo="${escaparHtml(f.articulo)}">${f.num_ordenes}</button></td>
    `;
    tablaReporte.appendChild(tr);
  }

  totalCantidad.textContent = filas.length ? cantidadTotal : '';
  totalImporte.textContent = filas.length ? formatoImporte(importeTotal) : '';

  resumenReporte.textContent = filas.length
    ? `${filas.length} combinación(es) hotel/artículo · ${cantidadTotal} unidades · $${formatoImporte(importeTotal)}`
    : '';
}

let temporizador;
filtroArticulo.addEventListener('input', () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(cargarReporte, 250);
});
filtroHotel.addEventListener('input', () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(cargarReporte, 250);
});

// ---------- Tarjetas de ordenes (al hacer clic en el numero de "Ordenes") ----------

const modalOrdenesOverlay = document.getElementById('modal-ordenes-overlay');
const modalOrdenesContenido = document.getElementById('modal-ordenes-contenido');
const modalOrdenesCerrar = document.getElementById('modal-ordenes-cerrar');

async function abrirTarjetasOrdenes(hotel, articulo) {
  const parametros = new URLSearchParams();
  parametros.set('articulo', articulo);
  if (hotel) parametros.set('hotel', hotel);
  parametros.set('estatus', [...estatusSeleccionados].join(','));

  const res = await fetch(`/api/reportes/ordenes?${parametros}`);
  const ordenes = await res.json();

  modalOrdenesContenido.innerHTML = `
    <h2>${escaparHtml(articulo)}</h2>
    <p class="pista">${escaparHtml(hotel || '(sin hotel/local)')} · ${ordenes.length} orden(es)</p>
    <div class="resultados">
      ${ordenes.map((o) => `
        <div class="tarjeta-producto tarjeta-orden" data-id="${escaparHtml(o.id)}">
          <h3>${escaparHtml(o.id)} · ${escaparHtml(o.nombre || '')}</h3>
          <p class="descripcion">OC: ${escaparHtml(o.numero_oc || '-')} · Fecha: ${escaparHtml(o.fecha || '-')}</p>
          <p class="precio">${o.importe !== null ? '$' + formatoImporte(o.importe) : ''}</p>
          <p class="stock">Estatus: ${escaparHtml(o.estatus_nombre || '-')}</p>
          <p class="stock">Contacto: ${escaparHtml(o.contacto_nombre || '-')}</p>
        </div>
      `).join('')}
    </div>
  `;

  modalOrdenesOverlay.hidden = false;
}

function cerrarModalOrdenes() {
  modalOrdenesOverlay.hidden = true;
  modalOrdenesContenido.innerHTML = '';
}

tablaReporte.addEventListener('click', (e) => {
  if (!e.target.classList.contains('btn-ordenes-combo')) return;
  abrirTarjetasOrdenes(e.target.dataset.hotel, e.target.dataset.articulo);
});

modalOrdenesCerrar.addEventListener('click', cerrarModalOrdenes);
modalOrdenesOverlay.addEventListener('click', (e) => {
  if (e.target === modalOrdenesOverlay) cerrarModalOrdenes();
});

modalOrdenesContenido.addEventListener('click', (e) => {
  const tarjeta = e.target.closest('.tarjeta-orden');
  if (tarjeta) abrirDetalle(tarjeta.dataset.id);
});

// ---------- Modal de detalle de una orden (misma ficha que en Buscar) ----------

const modalOverlay = document.getElementById('modal-overlay');
const modalContenido = document.getElementById('modal-contenido');
const modalCerrar = document.getElementById('modal-cerrar');

function campoFicha(etiqueta, valor) {
  return `<div><span>${escaparHtml(etiqueta)}</span><p>${valor !== null && valor !== undefined && valor !== '' ? escaparHtml(String(valor)) : '-'}</p></div>`;
}

async function abrirDetalle(id) {
  const [orden, articulos] = await Promise.all([
    fetch(`/api/ordenes/${encodeURIComponent(id)}`).then((r) => r.json()),
    fetch(`/api/detalle-compra?id=${encodeURIComponent(id)}`).then((r) => r.json()),
  ]);

  modalContenido.innerHTML = `
    <h2>${escaparHtml(orden.id)}</h2>
    <div class="ficha-detalle">
      ${campoFicha('Fecha', orden.fecha)}
      ${campoFicha('Nombre', orden.nombre)}
      ${campoFicha('Número de OC/cheque', orden.numero_oc)}
      ${campoFicha('Estatus', orden.estatus_nombre)}
      ${campoFicha('Estatus del sistema', orden.estatus_sistema)}
      ${campoFicha('Número de seguimiento', orden.numero_seguimiento)}
      ${campoFicha('Moneda', orden.moneda)}
      ${campoFicha('Importe (moneda extranjera)', orden.importe_moneda_extranjera !== null ? formatoImporte(orden.importe_moneda_extranjera) : null)}
      ${campoFicha('Importe', orden.importe !== null ? formatoImporte(orden.importe) : null)}
      ${campoFicha('Hotel / Local', orden.destino_nombre)}
      ${campoFicha('Contacto', orden.contacto_nombre)}
      ${campoFicha('Estado de la República', orden.estado_entrega_nombre)}
      ${campoFicha('Imprimir', orden.imprimir)}
    </div>
    ${orden.nota ? `<p><strong>Nota:</strong> ${escaparHtml(orden.nota)}</p>` : ''}
    ${orden.observaciones ? `<p><strong>Observaciones:</strong> ${escaparHtml(orden.observaciones)}</p>` : ''}
    <h3>Artículos (${articulos.length})</h3>
    ${articulos.length ? `
      <div class="tabla-scroll">
        <table>
          <thead><tr><th>Artículo</th><th>Tipo</th><th>Fecha</th><th>Serie</th><th>Cantidad</th><th>Importe</th></tr></thead>
          <tbody>
            ${articulos.map((a) => `
              <tr>
                <td>${escaparHtml(a.articulo || '')}</td>
                <td>${escaparHtml(a.tipo || '')}</td>
                <td>${escaparHtml(a.fecha || '')}</td>
                <td>${escaparHtml(a.numero_serie || '')}</td>
                <td>${a.cantidad_vendida ?? ''}</td>
                <td>${formatoImporte(a.importe)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<p class="pista">Esta orden no tiene artículos capturados en Detalle de compra.</p>'}
  `;

  modalOverlay.hidden = false;
}

function cerrarModal() {
  modalOverlay.hidden = true;
  modalContenido.innerHTML = '';
}

modalCerrar.addEventListener('click', cerrarModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) cerrarModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!modalOverlay.hidden) cerrarModal();
  else if (!modalOrdenesOverlay.hidden) cerrarModalOrdenes();
});

function cargarReportesPendientes() {
  cargarReportePendienteFacturar();
  cargarReportePendiente('entregar');
}

promesaAuth.then((sesion) => {
  if (!sesion) return;
  if (!sesion.permisos.ordenes.ver) {
    window.location.href = 'panel.html';
    return;
  }
  cargarFiltroEstatus().then(cargarReporte);
  cargarReportesPendientes();

  suscribirTiempoReal(['ordenes'], cargarReporte);
  suscribirTiempoReal(['estatus_catalogo'], () => cargarFiltroEstatus().then(cargarReporte));
  suscribirTiempoReal(['ordenes', 'facturacion_pedido_id', 'detalle_de_compra'], cargarReportesPendientes);
});
