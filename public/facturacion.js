const form = document.getElementById('form-facturacion');
const inputIdOriginal = document.getElementById('facturacion-id-original');
const campos = {
  id: document.getElementById('id'),
  articulo: document.getElementById('articulo'),
  tipo: document.getElementById('tipo'),
  fecha: document.getElementById('fecha'),
  descripcion: document.getElementById('descripcion'),
  numero_serie: document.getElementById('numero_serie'),
  cantidad_vendida: document.getElementById('cantidad_vendida'),
  precio_venta: document.getElementById('precio_venta'),
  ingresos: document.getElementById('ingresos'),
  pedido_id: document.getElementById('pedido_id'),
};
const btnGuardar = document.getElementById('btn-guardar');
const btnCancelar = document.getElementById('btn-cancelar');
const btnMostrarForm = document.getElementById('btn-mostrar-form');
const tabla = document.getElementById('tabla-facturacion');
const estadoVacio = document.getElementById('estado-vacio');
const buscar = document.getElementById('buscar');
const filtroMes = document.getElementById('filtro-mes-facturacion');
const filtroSinPedido = document.getElementById('filtro-sin-pedido');
const resumenCantidad = document.getElementById('resumen-fact-cantidad');
const resumenIngresos = document.getElementById('resumen-fact-ingresos');

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let ultimaLista = [];
let filtroPedidoUrl = null;
const bannerFiltroPedido = document.getElementById('banner-filtro-pedido');
const orden = { campo: 'fecha', direccion: 'desc' };

function comparar(va, vb) {
  if (va === null || va === undefined) va = '';
  if (vb === null || vb === undefined) vb = '';
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  return String(va).localeCompare(String(vb), 'es', { numeric: true });
}

function nombreMes(anioMes) {
  const [anio, mes] = anioMes.split('-');
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombre = meses[Number(mes) - 1] || mes;
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
}

// El desplegable de meses se arma con lo que ya esta cargado en ultimaLista (no pide nada
// extra al servidor); si el mes seleccionado sigue existiendo en la lista nueva se respeta,
// si no, regresa a "Todos" en vez de quedarse en un valor que ya no aplica.
function actualizarOpcionesMes() {
  const seleccionActual = filtroMes.value;
  const meses = [...new Set(ultimaLista.map((f) => (f.fecha || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  filtroMes.innerHTML = '<option value="">Todos</option>'
    + meses.map((m) => `<option value="${m}">${escaparHtml(nombreMes(m))}</option>`).join('');
  filtroMes.value = meses.includes(seleccionActual) ? seleccionActual : '';
}

function actualizarResumen(lista) {
  const ingresos = lista.reduce((acc, f) => acc + Number(f.ingresos || 0), 0);
  resumenCantidad.textContent = lista.length;
  resumenIngresos.textContent = `$${formatoImporte(ingresos)}`;
}

function ordenarYRenderizar() {
  let filtrada = filtroMes.value
    ? ultimaLista.filter((f) => (f.fecha || '').startsWith(filtroMes.value))
    : ultimaLista;
  // "Solo sin pedido asociado": para ir resolviendo poco a poco las facturas que todavia no
  // tienen un pedido_id capturado (ver Resultados, donde estas se agrupan aparte del ranking
  // de hoteles por venta).
  if (filtroSinPedido.checked) filtrada = filtrada.filter((f) => !f.pedido_id);
  const lista = [...filtrada].sort((a, b) => {
    const cmp = comparar(a[orden.campo], b[orden.campo]);
    return orden.direccion === 'asc' ? cmp : -cmp;
  });
  renderizar(lista);
  actualizarIndicadoresOrden();
  actualizarResumen(lista);
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

async function cargarFacturacion() {
  const q = buscar.value.trim();
  const url = filtroPedidoUrl
    ? `/api/facturacion?pedido=${encodeURIComponent(filtroPedidoUrl)}`
    : (q ? `/api/facturacion?q=${encodeURIComponent(q)}` : '/api/facturacion');
  const res = await fetch(url);
  ultimaLista = await res.json();
  actualizarOpcionesMes();
  ordenarYRenderizar();
}

filtroMes.addEventListener('change', ordenarYRenderizar);
filtroSinPedido.addEventListener('change', ordenarYRenderizar);

let permisosFacturacion = { ver: true, editar: true, borrar: true };

function renderizar(lista) {
  tabla.innerHTML = '';
  estadoVacio.hidden = lista.length !== 0;

  for (const f of lista) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escaparHtml(f.id)}</td>
      <td>${escaparHtml(f.articulo || '')}</td>
      <td>${escaparHtml(f.tipo || '')}</td>
      <td>${escaparHtml(f.fecha || '')}</td>
      <td>${escaparHtml(f.descripcion || '')}</td>
      <td>${escaparHtml(f.numero_serie || '')}</td>
      <td>${f.cantidad_vendida ?? ''}</td>
      <td>${formatoImporte(f.precio_venta)}</td>
      <td>${formatoImporte(f.ingresos)}</td>
      <td>${escaparHtml(f.pedido_id || '')}</td>
      <td>${escaparHtml(f.hotel_nombre || '')}</td>
      <td class="acciones">
        ${permisosFacturacion.editar ? `<button class="btn-editar" data-id="${f.id_facturacion}">Editar</button>` : ''}
        ${permisosFacturacion.borrar ? `<button class="btn-borrar" data-id="${f.id_facturacion}">Borrar</button>` : ''}
      </td>
    `;
    tr.dataset.id = f.id_facturacion;
    tr.classList.add('fila-clicable');
    tabla.appendChild(tr);
  }
}

function limpiarFormulario() {
  inputIdOriginal.value = '';
  form.reset();
  btnGuardar.textContent = 'Agregar registro';
}

function abrirFormulario() {
  form.hidden = false;
  btnMostrarForm.hidden = true;
}

function cerrarFormulario() {
  limpiarFormulario();
  form.hidden = true;
  btnMostrarForm.hidden = false;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    id: campos.id.value.trim(),
    articulo: campos.articulo.value.trim(),
    tipo: campos.tipo.value.trim(),
    fecha: campos.fecha.value,
    descripcion: campos.descripcion.value.trim(),
    numero_serie: campos.numero_serie.value.trim(),
    cantidad_vendida: campos.cantidad_vendida.value,
    precio_venta: campos.precio_venta.value,
    ingresos: campos.ingresos.value,
    pedido_id: campos.pedido_id.value.trim(),
  };

  const idOriginal = inputIdOriginal.value;
  const esEdicion = Boolean(idOriginal);

  const res = await fetch(esEdicion ? `/api/facturacion/${idOriginal}` : '/api/facturacion', {
    method: esEdicion ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error al guardar: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return;
  }

  cerrarFormulario();
  cargarFacturacion();
});

btnCancelar.addEventListener('click', cerrarFormulario);
btnMostrarForm.addEventListener('click', abrirFormulario);

// Abre el formulario ya lleno con los datos del registro (se usa tanto desde el boton "Editar"
// como al hacer clic en cualquier parte de la fila, para poder asociar el ID de pedido rapido).
async function abrirDetalleFacturacion(idFacturacion, { enfocarPedido = false } = {}) {
  const res = await fetch(`/api/facturacion/${idFacturacion}`);
  const f = await res.json();

  inputIdOriginal.value = f.id_facturacion;
  campos.id.value = f.id;
  campos.articulo.value = f.articulo || '';
  campos.tipo.value = f.tipo || '';
  campos.fecha.value = f.fecha || '';
  campos.descripcion.value = f.descripcion || '';
  campos.numero_serie.value = f.numero_serie || '';
  campos.cantidad_vendida.value = f.cantidad_vendida ?? '';
  campos.precio_venta.value = f.precio_venta ?? '';
  campos.ingresos.value = f.ingresos ?? '';
  campos.pedido_id.value = f.pedido_id || '';

  btnGuardar.textContent = 'Guardar cambios';
  abrirFormulario();
  (enfocarPedido ? campos.pedido_id : campos.articulo).focus();
}

tabla.addEventListener('click', async (e) => {
  if (e.target.classList.contains('btn-borrar')) {
    const idFacturacion = e.target.dataset.id;
    if (!confirmarDoble('¿Seguro que quieres borrar este registro?')) return;
    await fetch(`/api/facturacion/${idFacturacion}`, { method: 'DELETE' });
    cargarFacturacion();
    return;
  }

  if (e.target.classList.contains('btn-editar')) {
    await abrirDetalleFacturacion(e.target.dataset.id);
    return;
  }

  const fila = e.target.closest('tr[data-id]');
  if (fila && permisosFacturacion.editar) {
    await abrirDetalleFacturacion(fila.dataset.id, { enfocarPedido: true });
  }
});

let temporizadorBusqueda;
buscar.addEventListener('input', () => {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(cargarFacturacion, 250);
});

promesaAuth.then((sesion) => {
  if (!sesion) return;
  permisosFacturacion = sesion.permisos.facturacion;
  if (!permisosFacturacion.editar) btnMostrarForm.hidden = true;

  // Se llego desde el detalle de una orden ("Facturas asociadas"): precarga el buscador con ese
  // ID de documento para llegar directo a esa factura en vez de la lista completa.
  const idUrl = new URLSearchParams(window.location.search).get('id');
  if (idUrl) buscar.value = idUrl;

  // Se llego desde la columna "Facturas" de Ordenes: muestra solo las facturas de ese pedido
  // (busqueda por texto no alcanza, no busca por pedido_id) y deja visible como quitarlo.
  const pedidoUrl = new URLSearchParams(window.location.search).get('pedido');
  if (pedidoUrl) {
    filtroPedidoUrl = pedidoUrl;
    bannerFiltroPedido.innerHTML = `Mostrando solo las facturas del pedido <strong>${escaparHtml(pedidoUrl)}</strong> · <a href="facturacion.html">Quitar filtro</a>`;
    bannerFiltroPedido.hidden = false;
  }

  cargarFacturacion();

  suscribirTiempoReal(['facturacion'], cargarFacturacion);
});
