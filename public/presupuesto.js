const form = document.getElementById('form-presupuesto');
const inputMesOriginal = document.getElementById('presupuesto-mes-original');
const campoAnio = document.getElementById('anio');
const campoMes = document.getElementById('mes');
const campoMonto = document.getElementById('monto');
const btnGuardar = document.getElementById('btn-guardar');
const btnCancelar = document.getElementById('btn-cancelar');
const tabla = document.getElementById('tabla-presupuesto');
const estadoVacio = document.getElementById('estado-vacio');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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
  const nombre = MESES[Number(mes) - 1] || mes;
  return `${nombre} ${anio}`;
}

// Año/Mes como dos <select> en vez de un <input type="month">: el picker nativo del navegador
// a veces complica navegar a meses futuros (reportado: no dejaba ir mas alla del mes en curso).
// El rango cubre 1 año atras y 2 adelante, suficiente para capturar el resto del año en curso o
// planear el siguiente sin quedar corto.
function poblarSelectoresFecha() {
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  for (let anio = anioActual - 1; anio <= anioActual + 2; anio++) {
    const option = document.createElement('option');
    option.value = String(anio);
    option.textContent = String(anio);
    campoAnio.appendChild(option);
  }
  MESES.forEach((nombre, indice) => {
    const option = document.createElement('option');
    option.value = String(indice + 1).padStart(2, '0');
    option.textContent = nombre;
    campoMes.appendChild(option);
  });
  campoAnio.value = String(anioActual);
  campoMes.value = String(hoy.getMonth() + 1).padStart(2, '0');
}
poblarSelectoresFecha();

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
  // form.reset() regresa los <select> a la PRIMERA <option> (enero del año mas viejo del rango),
  // no al mes en curso: se reafirma aqui para que "Guardar" repetido siga siendo util sin tener
  // que re-seleccionar año/mes cada vez. (No se vuelve a llamar poblarSelectoresFecha aqui:
  // duplicaria las <option> ya creadas).
  const hoy = new Date();
  campoAnio.value = String(hoy.getFullYear());
  campoMes.value = String(hoy.getMonth() + 1).padStart(2, '0');
  btnGuardar.textContent = 'Guardar';
  btnCancelar.hidden = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = { anio_mes: `${campoAnio.value}-${campoMes.value}`, monto: campoMonto.value };

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
    const [anio, mesNumero] = mes.split('-');
    inputMesOriginal.value = mes;
    campoAnio.value = anio;
    campoMes.value = mesNumero;
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
