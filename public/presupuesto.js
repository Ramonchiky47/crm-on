const form = document.getElementById('form-presupuesto');
const inputMesOriginal = document.getElementById('presupuesto-mes-original');
const campoMes = document.getElementById('mes');
const campoMonto = document.getElementById('monto');
const btnGuardar = document.getElementById('btn-guardar');
const btnCancelar = document.getElementById('btn-cancelar');
const tabla = document.getElementById('tabla-presupuesto');
const estadoVacio = document.getElementById('estado-vacio');

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nombreMes(anioMes) {
  const [anio, mes] = anioMes.split('-');
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombre = meses[Number(mes) - 1] || mes;
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
}

let permisosPresupuesto = { ver: true, editar: true, borrar: true };

function renderizar(lista) {
  tabla.innerHTML = '';
  estadoVacio.hidden = lista.length !== 0;

  for (const fila of lista) {
    const presupuesto = fila.presupuesto === null || fila.presupuesto === undefined ? null : Number(fila.presupuesto);
    const ventas = Number(fila.ventas || 0);
    const diferencia = presupuesto === null ? null : ventas - presupuesto;
    const pctCumplido = presupuesto ? (ventas / presupuesto) * 100 : null;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escaparHtml(nombreMes(fila.anio_mes))}</td>
      <td>${presupuesto === null ? '<span class="pista">Sin capturar</span>' : `$${formatoImporte(presupuesto)}`}</td>
      <td>$${formatoImporte(ventas)}</td>
      <td>${diferencia === null ? '' : `<span class="${diferencia >= 0 ? 'texto-bueno' : 'texto-critico'}">${diferencia >= 0 ? '+' : ''}$${formatoImporte(diferencia)}</span>`}</td>
      <td>${pctCumplido === null ? '' : `${formatoImporte(pctCumplido)}%`}</td>
      <td class="acciones">
        ${permisosPresupuesto.editar ? `<button class="btn-editar" data-mes="${fila.anio_mes}" data-monto="${presupuesto ?? ''}">${presupuesto === null ? 'Capturar' : 'Editar'}</button>` : ''}
        ${permisosPresupuesto.borrar && presupuesto !== null ? `<button class="btn-borrar" data-mes="${fila.anio_mes}">Borrar</button>` : ''}
      </td>
    `;
    tabla.appendChild(tr);
  }
}

async function cargarPresupuesto() {
  const res = await fetch('/api/presupuesto-ventas');
  const lista = res.ok ? await res.json() : [];
  renderizar(lista);
}

function limpiarFormulario() {
  inputMesOriginal.value = '';
  form.reset();
  btnGuardar.textContent = 'Guardar';
  btnCancelar.hidden = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = { anio_mes: campoMes.value, monto: campoMonto.value };

  const res = await fetch('/api/presupuesto-ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error al guardar: ' + (error.error || `Error ${res.status}`));
    return;
  }

  limpiarFormulario();
  cargarPresupuesto();
});

btnCancelar.addEventListener('click', limpiarFormulario);

tabla.addEventListener('click', async (e) => {
  if (e.target.classList.contains('btn-borrar')) {
    const mes = e.target.dataset.mes;
    if (!confirmarDoble(`¿Borrar el presupuesto de ${nombreMes(mes)}?`)) return;
    await fetch(`/api/presupuesto-ventas/${mes}`, { method: 'DELETE' });
    cargarPresupuesto();
    return;
  }

  if (e.target.classList.contains('btn-editar')) {
    const mes = e.target.dataset.mes;
    inputMesOriginal.value = mes;
    campoMes.value = mes;
    campoMonto.value = e.target.dataset.monto || '';
    btnGuardar.textContent = 'Guardar cambios';
    btnCancelar.hidden = false;
    campoMonto.focus();
  }
});

promesaAuth.then((sesion) => {
  if (!sesion) return;
  permisosPresupuesto = sesion.permisos.facturacion;
  if (!permisosPresupuesto.editar) form.hidden = true;
  cargarPresupuesto();

  suscribirTiempoReal(['presupuesto_ventas', 'facturacion'], cargarPresupuesto);
});
