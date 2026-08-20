const ENCABEZADOS_PLANTILLA = [
  'id', 'fecha', 'imprimir', 'nombre', 'numero_oc', 'estatus_sistema', 'numero_seguimiento', 'nota',
  'moneda', 'importe_moneda_extranjera', 'importe', 'estatus', 'observaciones',
  'destino', 'contacto', 'empresa', 'estado_entrega',
];
const FILA_EJEMPLO = [
  'ORD-001', '2026-07-01', '', 'Pedido ejemplo', 'OC-100', 'Activo', 'GUIA-123', '',
  'USD', '1500.50', '1500.50', 'Abierto', '',
  'CDMX', 'Juan Perez', 'Acme SA', 'Pendiente',
];

document.getElementById('btn-plantilla').addEventListener('click', () => {
  const contenido = [ENCABEZADOS_PLANTILLA.join(','), FILA_EJEMPLO.join(',')].join('\n');
  const blob = new Blob([contenido], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla-ordenes.csv';
  a.click();
  URL.revokeObjectURL(url);
});

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

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

// ---------- Carga desde exportacion de NetSuite ("Vista predeterminada Transaccion") ----------
// El archivo que exporta NetSuite suele llegar con los acentos codificados dos veces (UTF-8
// leido como Latin-1 y vuelto a guardar como UTF-8: "Ã³" en vez de "ó"). Esto reinterpreta cada
// caracter como el byte original y lo vuelve a decodificar como UTF-8; si el texto ya estaba
// bien (no es mojibake), la decodificacion falla y se deja el texto tal cual.
function arreglarMojibake(texto) {
  try {
    const bytes = Uint8Array.from(texto, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return texto;
  }
}

// Parser de CSV con comillas (mismo criterio que el parsearCSV del servidor): separa por comas
// fuera de comillas, respeta comillas dobles escapadas ("") y saltos de linea dentro de campos.
function analizarCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let dentroComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else { dentroComillas = false; }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      dentroComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.length > 1 || f[0] !== '');
}

function normalizarEncabezado(h) {
  return h.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita acentos para comparar
}

// Encabezado normalizado (sin acentos) de la exportacion de NetSuite -> columna que espera
// /api/ordenes/importar-csv. Las columnas de NetSuite que no aparecen aqui (SAT, XML, bancos,
// etc.) se ignoran: no tienen equivalente en Ordenes.
const MAPA_ENCABEZADOS_NETSUITE = {
  'fecha': 'fecha',
  'imprimir': 'imprimir',
  'numero de documento': 'id',
  'nombre': 'nombre',
  'numero de oc/cheque': 'numero_oc',
  'estado': 'estatus_sistema',
  'numeros de seguimiento': 'numero_seguimiento',
  'nota': 'nota',
  'moneda': 'moneda',
  'importe (moneda extranjera)': 'importe_moneda_extranjera',
  'importe': 'importe',
};

function limpiarImporte(valor) {
  return valor.replace(/[^0-9.-]/g, '');
}

function serializarCampoCSV(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// Convierte el texto (ya sin mojibake) de una exportacion de NetSuite al formato de CSV que
// espera /api/ordenes/importar-csv (mismos encabezados que la plantilla de la app).
function transformarNetSuiteAOrdenes(texto) {
  const filas = analizarCSV(texto);
  if (!filas.length) return '';
  const encabezadosOrigen = filas[0].map(normalizarEncabezado);

  const columnasDestino = ['id', 'fecha', 'imprimir', 'nombre', 'numero_oc', 'estatus_sistema', 'numero_seguimiento', 'nota', 'moneda', 'importe_moneda_extranjera', 'importe'];
  const salida = [columnasDestino.join(',')];

  for (const fila of filas.slice(1)) {
    const registro = {};
    encabezadosOrigen.forEach((h, idx) => {
      const destino = MAPA_ENCABEZADOS_NETSUITE[h];
      if (!destino) return;
      registro[destino] = (fila[idx] || '').trim();
    });
    if (!registro.id) continue; // fila vacia o de otro tipo de transaccion sin numero de documento

    if (registro.numero_seguimiento) {
      registro.numero_seguimiento = registro.numero_seguimiento.replace(/<br\s*\/?>/gi, '; ');
    }
    if (registro.importe) registro.importe = limpiarImporte(registro.importe);
    if (registro.importe_moneda_extranjera) registro.importe_moneda_extranjera = limpiarImporte(registro.importe_moneda_extranjera);

    salida.push(columnasDestino.map((col) => serializarCampoCSV(registro[col] || '')).join(','));
  }

  return salida.join('\n');
}

const form = document.getElementById('form-carga');
const inputArchivo = document.getElementById('archivo-csv');
const checkEsNetsuite = document.getElementById('es-netsuite');
const btnCargar = document.getElementById('btn-cargar');
const reporte = document.getElementById('reporte');
const listaErrores = document.getElementById('lista-errores');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const archivo = inputArchivo.files[0];
  if (!archivo) return;

  btnCargar.disabled = true;
  btnCargar.textContent = 'Cargando...';

  try {
    let contenido = await leerArchivoComoTexto(archivo);
    if (checkEsNetsuite.checked) {
      contenido = transformarNetSuiteAOrdenes(arreglarMojibake(contenido));
    }
    const res = await fetch('/api/ordenes/importar-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: contenido,
    });

    const data = await res.json();
    if (!res.ok) {
      alert('Error al cargar el archivo: ' + (data.error || res.statusText));
      return;
    }

    mostrarReporte(data);
  } finally {
    btnCargar.disabled = false;
    btnCargar.textContent = 'Cargar archivo';
  }
});

function renderizarTablaErrores(contenedor, errores) {
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

function mostrarReporte(data) {
  reporte.hidden = false;
  document.getElementById('r-total').textContent = data.total;
  document.getElementById('r-insertadas').textContent = data.insertadas;
  document.getElementById('r-actualizadas').textContent = data.actualizadas;
  document.getElementById('r-errores-total').textContent = data.errores.length;
  document.getElementById('r-destinos').textContent = data.destinosCreados.length
    ? data.destinosCreados.join(', ') : 'ninguno';
  document.getElementById('r-contactos').textContent = data.contactosCreados.length
    ? data.contactosCreados.join(', ') : 'ninguno';
  document.getElementById('r-empresas').textContent = data.empresasAgregadas.length
    ? data.empresasAgregadas.join(', ') : 'ninguna';

  renderizarTablaErrores(listaErrores, data.errores);
}

// ---------- Detalle de compra ----------

const ENCABEZADOS_PLANTILLA_DETALLE = ['id', 'articulo', 'tipo', 'fecha', 'numero_serie', 'cantidad_vendida', 'importe'];
const FILA_EJEMPLO_DETALLE = ['ORD-001', 'Laptop 14"', 'Equipo', '2026-07-01', 'SN-12345', '1', '15000.00'];

document.getElementById('btn-plantilla-detalle').addEventListener('click', () => {
  const contenido = [ENCABEZADOS_PLANTILLA_DETALLE.join(','), FILA_EJEMPLO_DETALLE.join(',')].join('\n');
  const blob = new Blob([contenido], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla-detalle-compra.csv';
  a.click();
  URL.revokeObjectURL(url);
});

const formDetalle = document.getElementById('form-carga-detalle');
const inputArchivoDetalle = document.getElementById('archivo-csv-detalle');
const btnCargarDetalle = document.getElementById('btn-cargar-detalle');
const reporteDetalle = document.getElementById('reporte-detalle');
const listaErroresDetalle = document.getElementById('lista-errores-detalle');

formDetalle.addEventListener('submit', async (e) => {
  e.preventDefault();
  const archivo = inputArchivoDetalle.files[0];
  if (!archivo) return;

  btnCargarDetalle.disabled = true;
  btnCargarDetalle.textContent = 'Cargando...';

  try {
    const contenido = await leerArchivoComoTexto(archivo);
    const res = await fetch('/api/detalle-compra/importar-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: contenido,
    });

    const data = await res.json();
    if (!res.ok) {
      alert('Error al cargar el archivo: ' + (data.error || res.statusText));
      return;
    }

    mostrarReporteDetalle(data);
  } finally {
    btnCargarDetalle.disabled = false;
    btnCargarDetalle.textContent = 'Cargar archivo';
  }
});

function mostrarReporteDetalle(data) {
  reporteDetalle.hidden = false;
  document.getElementById('rd-total').textContent = data.total;
  document.getElementById('rd-insertadas').textContent = data.insertadas;
  document.getElementById('rd-errores-total').textContent = data.errores.length;
  renderizarTablaErrores(listaErroresDetalle, data.errores);
}

promesaAuth.then((sesion) => {
  if (!sesion) return;
  document.getElementById('seccion-carga-ordenes').hidden = !sesion.permisos.ordenes.editar;
  document.getElementById('seccion-carga-detalle').hidden = !sesion.permisos.detalle_compra.editar;
});
