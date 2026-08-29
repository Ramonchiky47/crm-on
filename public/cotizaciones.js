function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let permisosCatalogos = { ver: true, editar: true, borrar: true };

function poblarSelect(select, lista, valor, texto) {
  const actual = select.value;
  select.innerHTML = '<option value="">-- Selecciona --</option>' + lista.map((item) => `
    <option value="${item[valor]}">${escaparHtml(item[texto])}</option>
  `).join('');
  select.value = actual || '';
}

// Ordenamiento ascendente/descendente por columna, con encabezado fijo (via .tabla-scroll +
// th sticky ya definidos en style.css). Cada tabla tiene su propio estado independiente.
function crearOrdenador(tbody, renderizarFn) {
  const encabezados = tbody.closest('table').querySelectorAll('th[data-campo]');
  const estado = { campo: null, direccion: 'asc' };
  let ultimaLista = [];

  function comparar(va, vb) {
    if (va === null || va === undefined) va = '';
    if (vb === null || vb === undefined) vb = '';
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return String(va).localeCompare(String(vb), 'es', { numeric: true });
  }

  function actualizarIndicadores() {
    encabezados.forEach((th) => {
      if (!th.dataset.etiqueta) th.dataset.etiqueta = th.textContent.trim();
      const base = th.dataset.etiqueta;
      th.textContent = th.dataset.campo === estado.campo
        ? `${base} ${estado.direccion === 'asc' ? '▲' : '▼'}`
        : base;
    });
  }

  function render() {
    let lista = ultimaLista;
    if (estado.campo) {
      lista = [...ultimaLista].sort((a, b) => {
        const cmp = comparar(a[estado.campo], b[estado.campo]);
        return estado.direccion === 'asc' ? cmp : -cmp;
      });
    }
    renderizarFn(lista);
    actualizarIndicadores();
  }

  encabezados.forEach((th) => {
    th.classList.add('th-ordenable');
    th.addEventListener('click', () => {
      if (estado.campo === th.dataset.campo) {
        estado.direccion = estado.direccion === 'asc' ? 'desc' : 'asc';
      } else {
        estado.campo = th.dataset.campo;
        estado.direccion = 'asc';
      }
      render();
    });
  });

  return {
    actualizarDatos(lista) {
      ultimaLista = lista;
      render();
    },
  };
}

// ---------- Tarjetas: Negocios / Cotizaciones ----------

document.querySelectorAll('.tarjeta-subcatalogo').forEach((boton) => {
  boton.addEventListener('click', () => activarSubtab(boton.dataset.subtab));
});

function activarSubtab(nombre) {
  document.querySelectorAll('.tarjeta-subcatalogo').forEach((b) => {
    b.classList.toggle('activo', b.dataset.subtab === nombre);
  });
  document.querySelectorAll('[data-subpanel]').forEach((panel) => {
    panel.hidden = panel.dataset.subpanel !== nombre;
  });
}

// ---------- Negocios ----------

const formNegocio = document.getElementById('form-negocio');
const negocioId = document.getElementById('negocio-id');
const negocioNombre = document.getElementById('negocio-nombre');
const negocioContacto = document.getElementById('negocio-contacto');
const negocioEtapa = document.getElementById('negocio-etapa');
const negocioFechaEstimadaCierre = document.getElementById('negocio-fecha-estimada-cierre');
const negocioMotivoPerdidaWrap = document.getElementById('negocio-motivo-perdida-wrap');
const negocioMotivoPerdida = document.getElementById('negocio-motivo-perdida');
const btnGuardarNegocio = document.getElementById('btn-guardar-negocio');
const btnCancelarNegocio = document.getElementById('btn-cancelar-negocio');
const btnMostrarFormNegocio = document.getElementById('btn-mostrar-form-negocio');
const tablaNegocios = document.getElementById('tabla-negocios');
const modalNegocioOverlay = document.getElementById('modal-negocio-overlay');
const modalNegocioCerrar = document.getElementById('modal-negocio-cerrar');
const tituloFormNegocio = document.getElementById('titulo-form-negocio');
const negocioSeguimientoPista = document.getElementById('negocio-seguimiento-pista');
const btnVerNotasNegocio = document.getElementById('btn-ver-notas-negocio');

// La alta y edicion de un Negocio se hacen en el mismo formulario, mostrado como ventana
// emergente (igual que el detalle de una cotizacion): abrirFormNegocio() lo abre ya sea vacio
// (+ Agregar negocio) o precargado (clic en una fila / boton Editar).
function abrirFormNegocio() {
  modalNegocioOverlay.hidden = false;
}

function cerrarFormNegocio() {
  modalNegocioOverlay.hidden = true;
}

// La bitacora de seguimiento (notas con fecha/hora) solo existe para un negocio ya guardado:
// en alta nueva se explica que estara disponible al guardar; en edicion se puede abrir directo.
function actualizarSeguimientoNegocio() {
  const yaExiste = Boolean(negocioId.value);
  btnVerNotasNegocio.hidden = !yaExiste;
  negocioSeguimientoPista.hidden = yaExiste;
}

btnVerNotasNegocio.addEventListener('click', () => {
  cerrarFormNegocio();
  abrirNotasNegocio(negocioId.value, negocioNombre.value);
});

modalNegocioCerrar.addEventListener('click', limpiarFormNegocio);
modalNegocioOverlay.addEventListener('click', (e) => {
  if (e.target === modalNegocioOverlay) limpiarFormNegocio();
});

btnMostrarFormNegocio.addEventListener('click', () => {
  abrirFormNegocio();
  negocioNombre.focus();
});

// El campo Motivo solo se muestra cuando la etapa seleccionada es "Perdida".
function etapaEsPerdida(select) {
  const opcion = select.options[select.selectedIndex];
  return !!opcion && opcion.textContent.trim().toLowerCase().includes('perdid');
}

function actualizarVisibilidadMotivoPerdida() {
  negocioMotivoPerdidaWrap.hidden = !etapaEsPerdida(negocioEtapa);
}

negocioEtapa.addEventListener('change', actualizarVisibilidadMotivoPerdida);

const filtroNegId = document.getElementById('filtro-neg-id');
const filtroNegNombre = document.getElementById('filtro-neg-nombre');
const filtroNegContacto = document.getElementById('filtro-neg-contacto');
const filtroNegEtapaWrap = document.getElementById('filtro-neg-etapa-wrap');
const filtroNegEtapaBtn = document.getElementById('filtro-neg-etapa-btn');
const filtroNegEtapaPanel = document.getElementById('filtro-neg-etapa-panel');
const filtroNegEtapaOpciones = document.getElementById('filtro-neg-etapa-opciones');
const btnAplicarFiltroNegEtapa = document.getElementById('btn-aplicar-filtro-neg-etapa');
const btnCancelarFiltroNegEtapa = document.getElementById('btn-cancelar-filtro-neg-etapa');
const filtroNegFecha = document.getElementById('filtro-neg-fecha');
const btnLimpiarFiltrosNeg = document.getElementById('btn-limpiar-filtros-neg');

function coincideTexto(valor, filtro) {
  return !filtro || String(valor || '').toLowerCase().includes(filtro.toLowerCase());
}

// Filtro de Etapa (Negocios): checkboxes generados a partir del catalogo de etapas_negocio,
// que solo se aplican al presionar "Aplicar" (igual que el filtro de Etapa de Cotizaciones).
// Por defecto se muestran todas las etapas excepto Cierre Ganado y Cierre Perdido; solo se ven
// si el usuario las selecciona explicitamente en el filtro.
let etapasNegSeleccionadas = new Set();
let etapasNegInicializadas = false;
const ETAPAS_NEG_EXCLUIDAS_POR_DEFECTO = ['Cierre Ganado', 'Cierre Perdido'];

function poblarOpcionesFiltroNegEtapa(etapas) {
  filtroNegEtapaOpciones.innerHTML = etapas.map((e) => `
    <label class="multi-select-opcion">
      <input type="checkbox" value="${escaparHtml(e.etapa)}" /><span class="multi-select-texto">${escaparHtml(e.etapa)}</span>
    </label>
  `).join('');
}

function actualizarBotonFiltroNegEtapa() {
  filtroNegEtapaBtn.textContent = etapasNegSeleccionadas.size
    ? `${etapasNegSeleccionadas.size} etapa(s) seleccionada(s)`
    : 'Todas las etapas';
}

function sincronizarChecksFiltroNegEtapa() {
  filtroNegEtapaPanel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = etapasNegSeleccionadas.has(cb.value);
  });
}

filtroNegEtapaBtn.addEventListener('click', () => {
  sincronizarChecksFiltroNegEtapa();
  filtroNegEtapaPanel.hidden = !filtroNegEtapaPanel.hidden;
});

document.addEventListener('click', (e) => {
  if (!filtroNegEtapaWrap.contains(e.target)) filtroNegEtapaPanel.hidden = true;
});

btnAplicarFiltroNegEtapa.addEventListener('click', () => {
  etapasNegSeleccionadas = new Set(
    [...filtroNegEtapaPanel.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value)
  );
  actualizarBotonFiltroNegEtapa();
  filtroNegEtapaPanel.hidden = true;
  aplicarFiltrosNegocios();
});

btnCancelarFiltroNegEtapa.addEventListener('click', () => {
  sincronizarChecksFiltroNegEtapa();
  filtroNegEtapaPanel.hidden = true;
});

async function poblarSelectsNegocio() {
  const [contactos, etapas] = await Promise.all([
    fetch('/api/contactos').then((r) => r.json()),
    fetch('/api/etapas-negocio').then((r) => r.json()),
  ]);
  etapasNegocioCache = etapas;
  poblarSelect(negocioContacto, contactos, 'id_contacto', 'nombre_completo_correo');
  poblarSelect(negocioEtapa, etapas, 'id_etapa', 'etapa');
  poblarOpcionesFiltroNegEtapa(etapas);
  renderizarPipelineNegocios();

  if (!etapasNegInicializadas) {
    etapasNegInicializadas = true;
    etapasNegSeleccionadas = new Set(
      etapas.map((e) => e.etapa).filter((nombre) => !ETAPAS_NEG_EXCLUIDAS_POR_DEFECTO.includes(nombre))
    );
    actualizarBotonFiltroNegEtapa();
    sincronizarChecksFiltroNegEtapa();
    aplicarFiltrosNegocios();
  }

  // Un negocio nuevo nace en la primera etapa del pipeline por default.
  if (!negocioId.value) seleccionarEtapaPorNombre(negocioEtapa, 'prospeccion');
}

function celdaEstatus(estatus) {
  const clase = estatus === 'Vencido' ? 'estatus-vencido' : 'estatus-vigente';
  return `<span class="${clase}">${escaparHtml(estatus)}</span>`;
}

// Catalogo fijo de motivos al marcar una cotizacion como perdida: coincide con las <option> del
// select estatico del formulario de edicion (cotizaciones.html), para que ambos lugares (modal
// de detalle y formulario) ofrezcan exactamente las mismas opciones.
const MOTIVOS_PERDIDA_COTIZACION = [
  'Precio',
  'Tiempo de entrega',
  'Se fue con otro proveedor',
  'Proyecto cancelado o pospuesto',
  'Cambio de especificaciones del cliente',
  'Sin respuesta del cliente',
  'Otro',
];

function htmlOpcionesMotivoPerdida() {
  return `<option value="">-- Selecciona un motivo --</option>`
    + MOTIVOS_PERDIDA_COTIZACION.map((m) => `<option value="${escaparHtml(m)}">${escaparHtml(m)}</option>`).join('');
}

function fechaDe(creadoEn) {
  return (creadoEn || '').split(' ')[0];
}

// Coincide con el patron de etapaEsPerdida: cualquier etapa cuyo nombre contenga "ganado"
// (ej. "Cierre Ganado") se considera una etapa ganada, sin importar mayusculas/acentos.
function etapaNegocioEsGanada(etapaNombre) {
  return String(etapaNombre || '').toLowerCase().includes('ganado');
}

// Seleccion de negocios (checkboxes) para enviarlos a Tareas en lote. Se mantiene por
// id_negocio (no por fila), asi que sobrevive a los filtros/orden de la tabla.
const negociosSeleccionados = new Set();
const checkTodosNegocios = document.getElementById('check-todos-negocios');
const btnEnviarTareasNegocios = document.getElementById('btn-enviar-tareas-negocios');

function actualizarBotonEnviarTareasNegocios() {
  btnEnviarTareasNegocios.textContent = `Enviar a tareas (${negociosSeleccionados.size})`;
  btnEnviarTareasNegocios.disabled = negociosSeleccionados.size === 0;
}

function claseFilaNegocio(n) {
  const clases = ['fila-clicable'];
  if (etapaNegocioEsGanada(n.etapa_nombre)) clases.push('fila-ganada');
  if (n.tiene_tarea_activa) clases.push('fila-en-tareas');
  return ` class="${clases.join(' ')}"`;
}

function renderizarNegocios(negocios) {
  tablaNegocios.innerHTML = negocios.map((n) => `
    <tr${claseFilaNegocio(n)} data-id="${escaparHtml(n.id_negocio)}">
      <td><input type="checkbox" class="check-negocio" value="${escaparHtml(n.id_negocio)}" ${negociosSeleccionados.has(n.id_negocio) ? 'checked' : ''} /></td>
      <td>${escaparHtml(n.id_negocio)}</td>
      <td>${escaparHtml(fechaDe(n.creado_en))}</td>
      <td>${escaparHtml(n.negocio)}</td>
      <td>${escaparHtml(n.contacto_nombre || '')}</td>
      <td>${escaparHtml(n.etapa_nombre || '')}</td>
      <td>${celdaEstatus(n.estatus)}</td>
      <td>${escaparHtml(fechaDe(n.fecha_estimada_cierre))}</td>
      <td>${formatoImporte(n.importe_usd)}</td>
      <td>${formatoImporte(n.importe_mxn)}</td>
      <td><button type="button" class="btn-ver-cotizaciones" data-id="${escaparHtml(n.id_negocio)}" data-nombre="${escaparHtml(n.negocio)}">Ver cotizaciones</button></td>
      <td><button type="button" class="btn-notas-negocio" data-id="${escaparHtml(n.id_negocio)}" data-nombre="${escaparHtml(n.negocio)}">Notas</button></td>
      <td>${permisosCatalogos.editar ? `<button type="button" class="btn-mini btn-nueva-cotizacion-negocio" data-id="${escaparHtml(n.id_negocio)}" data-nombre="${escaparHtml(n.negocio)}" title="Nueva cotización para este negocio">+</button>` : ''}</td>
      <td class="acciones">
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${escaparHtml(n.id_negocio)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${escaparHtml(n.id_negocio)}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
  checkTodosNegocios.checked = negocios.length > 0 && negocios.every((n) => negociosSeleccionados.has(n.id_negocio));
}

const ordenadorNegocios = crearOrdenador(tablaNegocios, renderizarNegocios);

tablaNegocios.addEventListener('change', (e) => {
  if (!e.target.classList.contains('check-negocio')) return;
  if (e.target.checked) negociosSeleccionados.add(e.target.value);
  else negociosSeleccionados.delete(e.target.value);
  checkTodosNegocios.checked = [...tablaNegocios.querySelectorAll('.check-negocio')].every((cb) => cb.checked);
  actualizarBotonEnviarTareasNegocios();
});

checkTodosNegocios.addEventListener('change', () => {
  tablaNegocios.querySelectorAll('.check-negocio').forEach((cb) => {
    cb.checked = checkTodosNegocios.checked;
    if (checkTodosNegocios.checked) negociosSeleccionados.add(cb.value);
    else negociosSeleccionados.delete(cb.value);
  });
  actualizarBotonEnviarTareasNegocios();
});

// Envia a Tareas (como pendientes de Seguimiento) todos los negocios marcados con checkbox.
btnEnviarTareasNegocios.addEventListener('click', async () => {
  if (!negociosSeleccionados.size) return;

  const actividades = await fetch('/api/actividades').then((r) => r.json());
  const seguimiento = actividades.find((a) => a.actividad.trim().toLowerCase() === 'seguimiento');
  if (!seguimiento) {
    alert('No existe la actividad "Seguimiento" en Catálogos → Actividades. Créala primero.');
    return;
  }

  const idsSeleccionados = [...negociosSeleccionados];
  let enviados = 0;
  const errores = [];

  for (const id of idsSeleccionados) {
    const negocio = negociosCache.find((n) => n.id_negocio === id);
    if (!negocio) continue;
    const res = await fetch('/api/pendientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: `Seguimiento: ${negocio.negocio}`,
        actividades: [seguimiento.id_actividad],
        negocio_id: id,
      }),
    });
    if (res.ok) {
      enviados++;
    } else {
      const error = await res.json().catch(() => ({}));
      errores.push(`${negocio.negocio}: ${error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)}`);
    }
  }

  negociosSeleccionados.clear();
  actualizarBotonEnviarTareasNegocios();
  await cargarNegocios();

  if (errores.length) {
    alert(`Se enviaron ${enviados} de ${idsSeleccionados.length} negocio(s) a Tareas.\n\nErrores:\n${errores.join('\n')}`);
  } else {
    alert(`Se enviaron ${enviados} negocio(s) a Tareas de seguimiento.`);
  }
});

async function cargarNegocios() {
  const res = await fetch('/api/negocios');
  const negocios = await res.json();
  negociosCache = negocios;
  aplicarFiltrosNegocios();
  renderizarPipelineNegocios();
  // Mantiene sincronizado el desplegable "Negocio" del formulario de Cotizacion: si se crea o
  // edita un negocio desde esta tarjeta, debe poder seleccionarse de inmediato en Captura.
  poblarSelect(cotizacionNegocio, negocios, 'id_negocio', 'negocio');
  return negocios;
}

function aplicarFiltrosNegocios() {
  const filtrados = negociosCache.filter((n) =>
    coincideTexto(n.id_negocio, filtroNegId.value.trim())
    && coincideTexto(n.negocio, filtroNegNombre.value.trim())
    && coincideTexto(n.contacto_nombre, filtroNegContacto.value.trim())
    && (etapasNegSeleccionadas.size === 0 || etapasNegSeleccionadas.has(n.etapa_nombre))
    && (!filtroNegFecha.value || fechaDe(n.creado_en) === filtroNegFecha.value)
  );
  ordenadorNegocios.actualizarDatos(filtrados);
}

[filtroNegId, filtroNegNombre, filtroNegContacto].forEach((input) => {
  input.addEventListener('input', aplicarFiltrosNegocios);
});
filtroNegFecha.addEventListener('change', aplicarFiltrosNegocios);
btnLimpiarFiltrosNeg.addEventListener('click', () => {
  [filtroNegId, filtroNegNombre, filtroNegContacto, filtroNegFecha].forEach((input) => { input.value = ''; });
  etapasNegSeleccionadas = new Set();
  sincronizarChecksFiltroNegEtapa();
  actualizarBotonFiltroNegEtapa();
  aplicarFiltrosNegocios();
});

function seleccionarEtapaPorNombre(select, nombre) {
  const opcion = [...select.options].find((o) => o.textContent.trim().toLowerCase() === nombre.toLowerCase());
  select.value = opcion ? opcion.value : '';
}

function limpiarFormNegocio() {
  negocioId.value = '';
  formNegocio.reset();
  // Todo negocio nuevo nace en la primera etapa del pipeline por default.
  seleccionarEtapaPorNombre(negocioEtapa, 'prospeccion');
  negocioMotivoPerdida.value = '';
  actualizarVisibilidadMotivoPerdida();
  tituloFormNegocio.textContent = 'Nuevo negocio';
  actualizarSeguimientoNegocio();
  btnGuardarNegocio.textContent = 'Agregar';
  btnCancelarNegocio.hidden = true;
  cerrarFormNegocio();
}

formNegocio.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    negocio: negocioNombre.value.trim(),
    contacto_id: negocioContacto.value || null,
    etapa_id: negocioEtapa.value || null,
    motivo_perdida: negocioMotivoPerdida.value.trim(),
    fecha_estimada_cierre: negocioFechaEstimadaCierre.value || null,
  };
  const id = negocioId.value;
  const res = await fetch(id ? `/api/negocios/${id}` : '/api/negocios', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return;
  }
  limpiarFormNegocio();
  cargarNegocios();
});

btnCancelarNegocio.addEventListener('click', limpiarFormNegocio);

tablaNegocios.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-ver-cotizaciones')) {
    activarSubtab('visualizacion');
    activarFiltroNegocio(id, e.target.dataset.nombre);
    return;
  }

  if (e.target.classList.contains('btn-notas-negocio')) {
    abrirNotasNegocio(id, e.target.dataset.nombre);
    return;
  }

  if (e.target.classList.contains('btn-nueva-cotizacion-negocio')) {
    activarSubtab('captura');
    limpiarFormCotizacion();
    cotizacionNegocio.value = id;
    replicarContactoYDestinoDeNegocio(id);
    abrirFormCotizacion();
    return;
  }

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirm('¿Borrar este negocio? Esto también eliminará todas sus cotizaciones asociadas.')) return;
    if (!confirm('Esta acción no se puede deshacer. ¿Confirmas que quieres borrar el negocio y todas sus cotizaciones?')) return;
    const res = await fetch(`/api/negocios/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
      return;
    }
    cargarNegocios();
  }

  if (e.target.classList.contains('btn-editar')) {
    editarNegocio(id);
  }
});

// Carga un negocio (ya obtenido del servidor) en el formulario y lo abre como ventana
// emergente. Se usa tanto desde el boton "Editar" como desde el clic en la fila.
async function editarNegocio(id) {
  const negocios = await cargarNegocios();
  const n = negocios.find((x) => x.id_negocio === id);
  if (!n) return;

  negocioId.value = n.id_negocio;
  negocioNombre.value = n.negocio;
  negocioContacto.value = n.contacto_id || '';
  negocioEtapa.value = n.etapa_id || '';
  negocioFechaEstimadaCierre.value = n.fecha_estimada_cierre || '';
  negocioMotivoPerdida.value = n.motivo_perdida || '';
  actualizarVisibilidadMotivoPerdida();

  tituloFormNegocio.textContent = 'Editar negocio';
  actualizarSeguimientoNegocio();
  btnGuardarNegocio.textContent = 'Guardar cambios';
  btnCancelarNegocio.hidden = false;
  abrirFormNegocio();
  negocioNombre.focus();
}

// ---- Pipeline de Negocios (tablero) ----
// Vista visual de las 6 etapas activas del pipeline, aparte de la tabla (que sigue sirviendo
// para filtros/orden/acciones masivas). Se recalcula cada vez que cambia negociosCache o
// etapasNegocioCache, sin pedir nada nuevo al servidor.

const tableroPipelineNegocios = document.getElementById('tablero-pipeline-negocios');

// Mismo criterio de color que el widget de pipeline en Inicio (panel.js): claro->oscuro segun
// que tan avanzada esta la etapa dentro del pipeline activo.
function colorEtapaPipelineNegocios(nombreEtapa, indice) {
  if (nombreEtapa === 'Cierre Ganado') return 'var(--exito)';
  if (nombreEtapa === 'Cierre Perdido') return 'var(--peligro)';
  const pasos = ['var(--dato-250)', 'var(--dato-300)', 'var(--dato-400)', 'var(--dato-450)', 'var(--dato-500)', 'var(--dato-600)'];
  return pasos[indice % pasos.length];
}

function renderizarPipelineNegocios() {
  if (!tableroPipelineNegocios || !etapasNegocioCache.length) return;

  const etapasActivas = etapasNegocioCache.filter((e) => !ETAPAS_NEG_EXCLUIDAS_POR_DEFECTO.includes(e.etapa));
  const negociosPorEtapa = new Map();
  for (const n of negociosCache) {
    const lista = negociosPorEtapa.get(n.etapa_id) || [];
    lista.push(n);
    negociosPorEtapa.set(n.etapa_id, lista);
  }

  // % de avance general: promedio de la probabilidad de la etapa de cada negocio activo. Se
  // pondera por cantidad de negocios (no por valor de la cotizacion): un Negocio ya no vive
  // necesariamente ligado a cotizaciones con importe, asi que contar por trato es lo confiable.
  const negociosActivos = negociosCache.filter((n) => !ETAPAS_NEG_EXCLUIDAS_POR_DEFECTO.includes(n.etapa_nombre));
  const promedioAvance = negociosActivos.length
    ? Math.round(negociosActivos.reduce((acc, n) => acc + (n.etapa_probabilidad ?? 0), 0) / negociosActivos.length)
    : 0;
  const ganados = negociosCache.filter((n) => n.etapa_nombre === 'Cierre Ganado').length;
  const perdidos = negociosCache.filter((n) => n.etapa_nombre === 'Cierre Perdido').length;

  document.getElementById('pipeline-avance-pct').textContent = `${promedioAvance}%`;
  document.getElementById('pipeline-avance-total').textContent = negociosActivos.length;
  document.getElementById('pipeline-avance-barra').style.width = `${promedioAvance}%`;
  document.getElementById('pipeline-ganados').textContent = ganados;
  document.getElementById('pipeline-perdidos').textContent = perdidos;

  tableroPipelineNegocios.innerHTML = etapasActivas.map((etapa, indice) => {
    const negociosEtapa = negociosPorEtapa.get(etapa.id_etapa) || [];
    const color = colorEtapaPipelineNegocios(etapa.etapa, indice);
    const probabilidad = etapa.probabilidad ?? 0;
    return `
      <div class="columna-pipeline">
        <div class="columna-pipeline-cabecera" style="background: ${color};">
          <span class="nombre-etapa-pipeline">${escaparHtml(etapa.etapa)}</span>
          <div class="meta-etapa-pipeline"><strong>${negociosEtapa.length}</strong><span>${probabilidad}%</span></div>
        </div>
        <div class="columna-pipeline-cuerpo">
          ${negociosEtapa.length ? negociosEtapa.map((n) => `
            <div class="tarjeta-negocio-pipeline" data-id="${escaparHtml(n.id_negocio)}" style="border-left-color: ${color};">
              <div class="nombre-negocio-pipeline">${escaparHtml(n.negocio)}</div>
              <div class="contacto-negocio-pipeline">${escaparHtml(n.contacto_nombre || 'Sin contacto')}</div>
              <div class="barra-mini-pista"><div class="barra-mini-relleno" style="width: ${probabilidad}%; background: ${color};"></div></div>
              <div class="pie-negocio-pipeline">${n.fecha_estimada_cierre ? `Cierre est. ${escaparHtml(n.fecha_estimada_cierre)}` : 'Sin fecha estimada'}</div>
            </div>
          `).join('') : '<p class="columna-pipeline-vacia">Sin negocios</p>'}
        </div>
      </div>
    `;
  }).join('');
}

tableroPipelineNegocios.addEventListener('click', (e) => {
  const tarjeta = e.target.closest('.tarjeta-negocio-pipeline');
  if (!tarjeta) return;
  editarNegocio(tarjeta.dataset.id);
});

// Clic en cualquier parte de la fila (fuera de botones/checkbox) abre la edicion del negocio,
// igual que el clic en una fila de Cotizaciones abre su detalle.
tablaNegocios.addEventListener('click', (e) => {
  if (!permisosCatalogos.editar) return;
  if (e.target.closest('button, input')) return;
  const fila = e.target.closest('tr');
  if (!fila) return;
  editarNegocio(fila.dataset.id);
});

// ---------- Cotizaciones ----------

const filtroPista = document.getElementById('cotizaciones-filtro-pista');
const btnMostrarFormCotizacion = document.getElementById('btn-mostrar-form-cotizacion');
const modalCotizacionOverlay = document.getElementById('modal-cotizacion-overlay');
const modalCotizacionCerrar = document.getElementById('modal-cotizacion-cerrar');
const tituloFormCotizacion = document.getElementById('titulo-form-cotizacion');
const formCotizacion = document.getElementById('form-cotizacion');
const cotizacionId = document.getElementById('cotizacion-id');
const cotizacionNombre = document.getElementById('cotizacion-nombre');
const cotizacionNegocio = document.getElementById('cotizacion-negocio');
const cotizacionMoneda = document.getElementById('cotizacion-moneda');
const cotizacionEtapa = document.getElementById('cotizacion-etapa');
const cotizacionContacto = document.getElementById('cotizacion-contacto');
const cotizacionDestino = document.getElementById('cotizacion-destino');
const cotizacionRepresentante = document.getElementById('cotizacion-representante');
const cotizacionDescuento = document.getElementById('cotizacion-descuento');
const cotizacionDescuentoTipo = document.getElementById('cotizacion-descuento-tipo');
const cotizacionFechaCreacion = document.getElementById('cotizacion-fecha-creacion');
const cotizacionVencimientoOpcion = document.getElementById('cotizacion-vencimiento-opcion');
const cotizacionVencimientoFecha = document.getElementById('cotizacion-vencimiento-fecha');
const cotizacionMetodoPago = document.getElementById('cotizacion-metodo-pago');
const cotizacionLugarEntrega = document.getElementById('cotizacion-lugar-entrega');
const cotizacionTiempoEntrega = document.getElementById('cotizacion-tiempo-entrega');
const cotizacionFechaSeguimiento = document.getElementById('cotizacion-fecha-seguimiento');
const cotizacionObservaciones = document.getElementById('cotizacion-observaciones');
const tablaPartidas = document.getElementById('tabla-partidas');
const datalistProductos = document.getElementById('lista-productos');

// Marca en rojo el contorno de cualquier campo de la Captura de cotizaciones que no tenga
// captura todavia; en cuanto se llena vuelve al color normal. Observaciones queda fuera de
// esta regla (es el unico campo que se mantiene igual, sin importar si esta vacio).
const camposObligatoriosCotizacion = [
  cotizacionNombre, cotizacionNegocio, cotizacionMoneda, cotizacionContacto, cotizacionDestino, cotizacionRepresentante,
  cotizacionDescuento, cotizacionFechaCreacion, cotizacionVencimientoOpcion, cotizacionVencimientoFecha,
  cotizacionMetodoPago, cotizacionLugarEntrega, cotizacionTiempoEntrega, cotizacionFechaSeguimiento,
];

function actualizarCampoVacio(campo) {
  campo.classList.toggle('campo-vacio', campo.value.trim() === '');
}

function actualizarCamposVaciosCotizacion() {
  camposObligatoriosCotizacion.forEach(actualizarCampoVacio);
}

camposObligatoriosCotizacion.forEach((campo) => {
  campo.addEventListener('input', () => actualizarCampoVacio(campo));
  campo.addEventListener('change', () => actualizarCampoVacio(campo));
});

const btnAgregarPartida = document.getElementById('btn-agregar-partida');
const btnGuardarCotizacion = document.getElementById('btn-guardar-cotizacion');
const btnCancelarCotizacion = document.getElementById('btn-cancelar-cotizacion');
const btnEnviarTareasSeguimiento = document.getElementById('btn-enviar-tareas-seguimiento');
const tablaCotizaciones = document.getElementById('tabla-cotizaciones');

// ---------- Barra de acciones y etapa (Ganada/Perdida) dentro del formulario de edicion ----------
// Solo aplica al editar una cotizacion existente (con id); al capturar una nueva no hay nada
// que visualizar/clonar/descargar todavia, ni una etapa que cambiar.
const cotizacionAccionesEdicion = document.getElementById('cotizacion-acciones-edicion');
const btnFormVerCotizacion = document.getElementById('btn-form-ver-cotizacion');
const btnFormDescargarPdfCotizacion = document.getElementById('btn-form-descargar-pdf-cotizacion');
const btnFormClonarCotizacion = document.getElementById('btn-form-clonar-cotizacion');
const cotizacionFormEstatus = document.getElementById('cotizacion-form-estatus');
const cotizacionPanelEtapa = document.getElementById('cotizacion-panel-etapa');
const btnFormMostrarMarcarGanada = document.getElementById('btn-form-mostrar-marcar-ganada');
const btnFormMostrarMarcarPerdida = document.getElementById('btn-form-mostrar-marcar-perdida');
const cotizacionPanelMarcarGanada = document.getElementById('cotizacion-panel-marcar-ganada');
const cotizacionMarcarGanadaPista = document.getElementById('cotizacion-marcar-ganada-pista');
const btnFormConfirmarMarcarGanada = document.getElementById('btn-form-confirmar-marcar-ganada');
const btnFormCancelarMarcarGanada = document.getElementById('btn-form-cancelar-marcar-ganada');
const cotizacionFormMarcarPerdida = document.getElementById('cotizacion-form-marcar-perdida');
const cotizacionMotivoPerdidaSelect = document.getElementById('cotizacion-motivo-perdida-select');
const cotizacionMotivoPerdidaComentarios = document.getElementById('cotizacion-motivo-perdida-comentarios');
const btnFormConfirmarMarcarPerdida = document.getElementById('btn-form-confirmar-marcar-perdida');
const btnFormCancelarMarcarPerdida = document.getElementById('btn-form-cancelar-marcar-perdida');

// Combina el motivo elegido en el catalogo con el comentario libre en un solo texto (es como se
// guarda motivo_perdida, sin agregar una columna nueva): "Motivo: comentario", o solo uno de los
// dos si el otro viene vacio.
function combinarMotivoPerdida(motivo, comentarios) {
  const c = (comentarios || '').trim();
  if (!motivo) return c;
  return c ? `${motivo}: ${c}` : motivo;
}

function ocultarMarcarPerdidaForm() {
  cotizacionFormMarcarPerdida.hidden = true;
  cotizacionMotivoPerdidaSelect.value = '';
  cotizacionMotivoPerdidaComentarios.value = '';
}

function ocultarMarcarGanadaPanel() {
  cotizacionPanelMarcarGanada.hidden = true;
}

btnFormVerCotizacion.addEventListener('click', () => generarPDFCotizacion(cotizacionId.value));
btnFormDescargarPdfCotizacion.addEventListener('click', () => descargarPDFCotizacion(cotizacionId.value));
btnFormClonarCotizacion.addEventListener('click', () => clonarCotizacion(cotizacionId.value));

btnFormMostrarMarcarGanada.addEventListener('click', async () => {
  const nombreDestino = [...cotizacionDestino.selectedOptions].map((o) => o.textContent).join(', ') || 'este Hotel/Local';
  cotizacionMarcarGanadaPista.textContent =
    `Órdenes de ${nombreDestino} con fecha igual o posterior a la cotización (${cotizacionFechaCreacion.value}). Selecciona las que correspondan (opcional):`;
  cotizacionPanelMarcarGanada.hidden = false;
  await cargarListaOrdenesCandidatas(cotizacionId.value, 'lista-ordenes-candidatas-ganada-form');
});

btnFormCancelarMarcarGanada.addEventListener('click', ocultarMarcarGanadaPanel);

btnFormConfirmarMarcarGanada.addEventListener('click', async () => {
  const ordenIds = ordenesSeleccionadas('lista-ordenes-candidatas-ganada-form');
  const ok = await guardarOrdenesAsociadas(cotizacionId.value, ordenIds);
  if (!ok) return;
  marcarEtapaCotizacion(cotizacionId.value, 'Ganada', '', () => editarCotizacion(cotizacionId.value));
});

btnFormMostrarMarcarPerdida.addEventListener('click', () => {
  cotizacionFormMarcarPerdida.hidden = false;
  cotizacionMotivoPerdidaSelect.focus();
});

btnFormCancelarMarcarPerdida.addEventListener('click', ocultarMarcarPerdidaForm);

btnFormConfirmarMarcarPerdida.addEventListener('click', () => {
  const motivo = combinarMotivoPerdida(cotizacionMotivoPerdidaSelect.value, cotizacionMotivoPerdidaComentarios.value);
  marcarEtapaCotizacion(cotizacionId.value, 'Perdida', motivo, () => editarCotizacion(cotizacionId.value));
});

const cotizacionMostrarTotales = document.getElementById('cotizacion-mostrar-totales');
const resumenSubtotal = document.getElementById('resumen-subtotal');
const resumenDescuento = document.getElementById('resumen-descuento');
const resumenIva = document.getElementById('resumen-iva');
const resumenGranTotal = document.getElementById('resumen-gran-total');

const filtroCotId = document.getElementById('filtro-cot-id');
const filtroCotNombre = document.getElementById('filtro-cot-nombre');
const filtroCotNegocio = document.getElementById('filtro-cot-negocio');
const filtroCotContacto = document.getElementById('filtro-cot-contacto');
const filtroCotFecha = document.getElementById('filtro-cot-fecha');
const filtroCotEtapaWrap = document.getElementById('filtro-cot-etapa-wrap');
const filtroCotEtapaBtn = document.getElementById('filtro-cot-etapa-btn');
const filtroCotEtapaPanel = document.getElementById('filtro-cot-etapa-panel');
const btnAplicarFiltroCotEtapa = document.getElementById('btn-aplicar-filtro-cot-etapa');
const btnCancelarFiltroCotEtapa = document.getElementById('btn-cancelar-filtro-cot-etapa');
const filtroCotRepresentanteWrap = document.getElementById('filtro-cot-representante-wrap');
const filtroCotRepresentanteBtn = document.getElementById('filtro-cot-representante-btn');
const filtroCotRepresentantePanel = document.getElementById('filtro-cot-representante-panel');
const filtroCotRepresentanteOpciones = document.getElementById('filtro-cot-representante-opciones');
const btnAplicarFiltroCotRepresentante = document.getElementById('btn-aplicar-filtro-cot-representante');
const btnCancelarFiltroCotRepresentante = document.getElementById('btn-cancelar-filtro-cot-representante');
const btnLimpiarFiltrosCot = document.getElementById('btn-limpiar-filtros-cot');

// Filtro de Responsable de ventas (Cotizaciones): checkboxes generados a partir del catalogo
// de representantes, mismo patron que el filtro de Etapa (se aplica al presionar "Aplicar").
// "Sin asignar" agrupa las cotizaciones sin representante capturado. Vacio = sin filtro (todas).
const SIN_REPRESENTANTE_ASIGNADO = 'Sin asignar';
let representantesCotSeleccionados = new Set();

function poblarOpcionesFiltroCotRepresentante(representantes) {
  const nombres = [...representantes.map((r) => r.representante), SIN_REPRESENTANTE_ASIGNADO];
  filtroCotRepresentanteOpciones.innerHTML = nombres.map((nombre) => `
    <label class="multi-select-opcion">
      <input type="checkbox" value="${escaparHtml(nombre)}" /><span class="multi-select-texto">${escaparHtml(nombre)}</span>
    </label>
  `).join('');
}

function actualizarBotonFiltroCotRepresentante() {
  filtroCotRepresentanteBtn.textContent = representantesCotSeleccionados.size
    ? `${representantesCotSeleccionados.size} responsable(s) seleccionado(s)`
    : 'Todos los responsables';
}

function sincronizarChecksFiltroCotRepresentante() {
  filtroCotRepresentantePanel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = representantesCotSeleccionados.has(cb.value);
  });
}

filtroCotRepresentanteBtn.addEventListener('click', () => {
  sincronizarChecksFiltroCotRepresentante();
  filtroCotRepresentantePanel.hidden = !filtroCotRepresentantePanel.hidden;
});

document.addEventListener('click', (e) => {
  if (!filtroCotRepresentanteWrap.contains(e.target)) filtroCotRepresentantePanel.hidden = true;
});

btnAplicarFiltroCotRepresentante.addEventListener('click', () => {
  representantesCotSeleccionados = new Set(
    [...filtroCotRepresentantePanel.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value)
  );
  actualizarBotonFiltroCotRepresentante();
  filtroCotRepresentantePanel.hidden = true;
  aplicarFiltrosCotizaciones();
});

btnCancelarFiltroCotRepresentante.addEventListener('click', () => {
  sincronizarChecksFiltroCotRepresentante();
  filtroCotRepresentantePanel.hidden = true;
});

let productosCache = [];
let negociosCache = [];
let etapasNegocioCache = [];
let contactosCache = [];
let destinosCache = [];
let cotizacionesCache = [];
let partidas = [];
let filtroNegocioId = null;

// ---------- Filtro cruzado Contacto <-> Hotel/Local (formulario de Cotizaciones) ----------
// Al elegir un Contacto, el select de Hotel/Local se reduce a los que tiene asociados (mismo
// dato de "Contactos asociados" en Catalogos), y viceversa. Si el contacto/destino elegido no
// tiene NINGUNA asociacion capturada todavia, el otro select queda vacio a proposito (no se cae
// al catalogo completo): eso fuerza a asociarlo antes de seguir. Para resolverlo sin salir de la
// pantalla aparece una pista con un boton que abre un mini-modal para asociar uno existente (ver
// abrirModalAsociar). El valor ya elegido en el otro campo se limpia si deja de ser valido tras
// filtrar, para que el bloqueo siempre sea visible.
let destinosPorContacto = new Map();
let contactosPorDestino = new Map();

function indexarContactoDestinos(contactos) {
  destinosPorContacto = new Map();
  contactosPorDestino = new Map();
  for (const c of contactos) {
    const cid = String(c.id_contacto);
    const destinos = c.destinos || [];
    destinosPorContacto.set(cid, new Set(destinos.map((d) => String(d.id_destino))));
    for (const d of destinos) {
      const did = String(d.id_destino);
      if (!contactosPorDestino.has(did)) contactosPorDestino.set(did, new Set());
      contactosPorDestino.get(did).add(cid);
    }
  }
}

// `idsPermitidos === null` significa "el otro campo no tiene nada elegido": no se filtra, se ve
// el catalogo completo. Cualquier otro caso (incluido un Set vacio) SI filtra, aunque el
// resultado sea una lista vacia: es la senal de que hace falta asociar.
function filtrarSelectAsociado(select, opcionesCompletas, campoValor, campoTexto, idsPermitidos) {
  const valorActual = select.value;
  const opciones = idsPermitidos === null
    ? opcionesCompletas
    : opcionesCompletas.filter((o) => idsPermitidos.has(String(o[campoValor])));
  // poblarSelect conserva select.value tal cual, asi que aqui se limpia antes si ya no es valido.
  if (valorActual && !opciones.some((o) => String(o[campoValor]) === valorActual)) select.value = '';
  poblarSelect(select, opciones, campoValor, campoTexto);
}

// ---------- Hotel(es)/Local(es): un <select multiple> (una cotizacion puede aplicar a varias
// propiedades del mismo contacto, ej. una cadena renovando el mismo equipo en varios hoteles a
// la vez). Sin placeholder "-- Selecciona --" (no aplica a un multiple), asi que estas funciones
// son propias en vez de reusar poblarSelect/filtrarSelectAsociado (pensadas para un solo valor).

function poblarSelectMultiple(select, lista, campoValor, campoTexto) {
  select.innerHTML = lista.map((item) => `<option value="${item[campoValor]}">${escaparHtml(item[campoTexto])}</option>`).join('');
}

function valoresSeleccionados(select) {
  return [...select.selectedOptions].map((o) => o.value);
}

function marcarSeleccionMultiple(select, valoresSet) {
  [...select.options].forEach((o) => { o.selected = valoresSet.has(o.value); });
}

// Si se llega desde una Tarea con la actividad "Cotizacion" (Tareas -> clic en la fila), se
// guarda aqui su ID: al guardar la cotizacion nueva, esa tarea se borra automaticamente.
let pendienteOrigenId = null;

async function poblarSelectsCotizacion() {
  const [negocios, contactos, destinos, productos, representantes] = await Promise.all([
    fetch('/api/negocios').then((r) => r.json()),
    fetch('/api/contactos').then((r) => r.json()),
    fetch('/api/destinos').then((r) => r.json()),
    fetch('/api/productos').then((r) => r.json()),
    fetch('/api/representantes').then((r) => r.json()),
  ]);
  poblarSelect(cotizacionNegocio, negocios, 'id_negocio', 'negocio');
  poblarSelect(cotizacionContacto, contactos, 'id_contacto', 'nombre_completo_correo');
  poblarSelectMultiple(cotizacionDestino, destinos, 'id_destino', 'destino');
  poblarSelect(cotizacionRepresentante, representantes, 'id_representante', 'representante');
  poblarOpcionesFiltroCotRepresentante(representantes);
  negociosCache = negocios;
  contactosCache = contactos;
  destinosCache = destinos;
  indexarContactoDestinos(contactos);
  productosCache = productos;
  poblarDatalistProductos();
}

function filtrarDestinosPorContacto() {
  const cid = cotizacionContacto.value;
  const idsPermitidos = cid ? (destinosPorContacto.get(cid) || new Set()) : null;
  const seleccionActual = new Set(valoresSeleccionados(cotizacionDestino));
  const opciones = idsPermitidos === null
    ? destinosCache
    : destinosCache.filter((d) => idsPermitidos.has(String(d.id_destino)));
  poblarSelectMultiple(cotizacionDestino, opciones, 'id_destino', 'destino');
  marcarSeleccionMultiple(cotizacionDestino, seleccionActual);
  // El filtro puede haber vuelto invalida la seleccion anterior de Hotel/Local (ninguna opcion
  // valida coincide con lo ya marcado): sin esto el campo se queda vacio en silencio, sin el
  // borde rojo que avisa "falta capturar".
  actualizarCampoVacio(cotizacionDestino);
  actualizarPistaAsociar();
}

function filtrarContactosPorDestino() {
  const destinoIds = valoresSeleccionados(cotizacionDestino);
  let idsPermitidos = null;
  if (destinoIds.length) {
    idsPermitidos = new Set();
    destinoIds.forEach((did) => (contactosPorDestino.get(did) || new Set()).forEach((cid) => idsPermitidos.add(cid)));
  }
  filtrarSelectAsociado(cotizacionContacto, contactosCache, 'id_contacto', 'nombre_completo_correo', idsPermitidos);
  // Mismo caso que arriba pero para Contacto: si el filtro lo vacio (el contacto que tenia
  // capturado no esta asociado al Hotel/Local recien elegido), que se note con el borde rojo.
  actualizarCampoVacio(cotizacionContacto);
  actualizarPistaAsociar();
}

cotizacionContacto.addEventListener('change', filtrarDestinosPorContacto);
cotizacionDestino.addEventListener('change', filtrarContactosPorDestino);

// Muestra, cuando corresponde, la pista con el boton para asociar un Hotel/Local o Contacto
// existente al que ya se eligio del otro lado (el select quedo vacio por el filtro cruzado).
const pistaAsociar = document.getElementById('pista-asociar-contacto-destino');

function actualizarPistaAsociar() {
  const contactoId = cotizacionContacto.value;
  const destinosElegidos = valoresSeleccionados(cotizacionDestino);
  // Se avisa siempre que un lado tiene algo elegido y el otro se quedo vacio, sin importar si
  // hay OTRAS opciones disponibles del lado vacio: aunque el Hotel/Local elegido tenga otros
  // contactos asociados, el que ya se habia capturado se pudo haber limpiado por el filtro, y
  // eso necesita avisarse igual (antes solo se avisaba si el lado vacio quedaba sin ninguna
  // opcion, y un contacto recien limpiado en silencio se sentia como "se quedo en blanco").
  const destinoBloqueado = Boolean(contactoId) && destinosElegidos.length === 0;
  const contactoBloqueado = destinosElegidos.length > 0 && !contactoId;

  if (destinoBloqueado) {
    const nombre = cotizacionContacto.options[cotizacionContacto.selectedIndex]?.textContent || 'Este contacto';
    pistaAsociar.innerHTML = `${escaparHtml(nombre)} no tiene Hotel/Local asociado. <button type="button" id="btn-asociar-existente" class="btn-mini">Asociar uno existente</button>`;
    pistaAsociar.dataset.modo = 'destino';
    pistaAsociar.hidden = false;
  } else if (contactoBloqueado) {
    const nombres = [...cotizacionDestino.selectedOptions].map((o) => o.textContent).join(', ') || 'Este Hotel/Local';
    pistaAsociar.innerHTML = `${escaparHtml(nombres)} no tiene Contacto asociado. <button type="button" id="btn-asociar-existente" class="btn-mini">Asociar uno existente</button>`;
    pistaAsociar.dataset.modo = 'contacto';
    pistaAsociar.hidden = false;
  } else {
    pistaAsociar.hidden = true;
    pistaAsociar.innerHTML = '';
  }
}

pistaAsociar.addEventListener('click', (e) => {
  if (e.target.id !== 'btn-asociar-existente') return;
  abrirModalAsociar(pistaAsociar.dataset.modo);
});

// ---------- Mini-modal "Asociar existente" (resuelve el bloqueo de la pista de arriba) ----------

const modalAsociarOverlay = document.getElementById('modal-asociar-overlay');
const modalAsociarCerrar = document.getElementById('modal-asociar-cerrar');
const modalAsociarTitulo = document.getElementById('modal-asociar-titulo');
const modalAsociarEtiqueta = document.getElementById('modal-asociar-etiqueta');
const modalAsociarSelect = document.getElementById('modal-asociar-select');
const formAsociar = document.getElementById('form-asociar');
let modoAsociar = null; // 'destino': falta Hotel/Local para el contacto ya elegido; 'contacto': falta Contacto para el hotel ya elegido

function abrirModalAsociar(modo) {
  modoAsociar = modo;
  modalAsociarSelect.innerHTML = '<option value="">-- Selecciona --</option>';
  if (modo === 'destino') {
    modalAsociarTitulo.textContent = 'Asociar Hotel/Local existente';
    modalAsociarEtiqueta.textContent = 'Hotel / Local';
    poblarSelect(modalAsociarSelect, destinosCache, 'id_destino', 'destino');
  } else {
    modalAsociarTitulo.textContent = 'Asociar Contacto existente';
    modalAsociarEtiqueta.textContent = 'Contacto';
    poblarSelect(modalAsociarSelect, contactosCache, 'id_contacto', 'nombre_completo_correo');
  }
  modalAsociarOverlay.hidden = false;
  modalAsociarSelect.focus();
}

function cerrarModalAsociar() {
  modalAsociarOverlay.hidden = true;
  modoAsociar = null;
}

modalAsociarCerrar.addEventListener('click', cerrarModalAsociar);
modalAsociarOverlay.addEventListener('click', (e) => {
  if (e.target === modalAsociarOverlay) cerrarModalAsociar();
});

// Vuelve a pedir los Contactos (traen sus Hoteles/Locales asociados) para reconstruir los dos
// mapas con la asociacion recien creada, sin recargar toda la pagina.
async function refrescarAsociaciones() {
  const contactos = await fetch('/api/contactos').then((r) => r.json());
  contactosCache = contactos;
  indexarContactoDestinos(contactos);
}

async function asociarDestinoContacto(destinoId, contactoId) {
  const res = await fetch(`/api/destinos/${encodeURIComponent(destinoId)}/contactos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contacto_id: contactoId }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return false;
  }
  return true;
}

formAsociar.addEventListener('submit', async (e) => {
  e.preventDefault();
  const elegidoId = modalAsociarSelect.value;
  if (!elegidoId) return;

  if (modoAsociar === 'destino') {
    // Falta Hotel/Local para el contacto ya elegido: se asocia ese unico destino.
    if (!(await asociarDestinoContacto(elegidoId, cotizacionContacto.value))) return;
  } else {
    // Falta Contacto para el/los Hotel(es) ya elegidos: se asocia a TODOS los seleccionados,
    // no solo al primero, para que ninguno se quede sin contacto.
    for (const destinoId of valoresSeleccionados(cotizacionDestino)) {
      if (!(await asociarDestinoContacto(destinoId, elegidoId))) return;
    }
  }

  await refrescarAsociaciones();
  if (modoAsociar === 'destino') {
    filtrarDestinosPorContacto();
    const opt = [...cotizacionDestino.options].find((o) => o.value === elegidoId);
    if (opt) opt.selected = true;
  } else {
    filtrarContactosPorDestino();
    cotizacionContacto.value = elegidoId;
  }
  actualizarPistaAsociar();
  cerrarModalAsociar();
});

// Al capturar una cotizacion a partir de un negocio, se replican el Contacto del negocio y,
// si ese contacto tiene destinos asociados en su catalogo, el primero de ellos como Destino
// (el usuario puede marcar mas si la cotizacion aplica a varios).
function replicarContactoYDestinoDeNegocio(negocioId) {
  const negocio = negociosCache.find((n) => n.id_negocio === negocioId);
  if (!negocio) return;

  cotizacionContacto.value = negocio.contacto_id || '';
  filtrarDestinosPorContacto();

  const contacto = contactosCache.find((c) => String(c.id_contacto) === String(negocio.contacto_id));
  const destinos = (contacto && contacto.destinos) || [];
  if (destinos.length) {
    const opt = [...cotizacionDestino.options].find((o) => o.value === String(destinos[0].id_destino));
    if (opt) opt.selected = true;
  }
}

function activarFiltroNegocio(id, nombre) {
  filtroNegocioId = id;
  filtroPista.hidden = false;
  filtroPista.innerHTML = `
    <a href="#" id="volver-a-negocios">← Regresar a Negocios</a>
    · Mostrando cotizaciones de: <strong>${escaparHtml(nombre)}</strong> · <a href="#" id="quitar-filtro-negocio">Quitar filtro</a>
  `;
  document.getElementById('volver-a-negocios').addEventListener('click', (e) => {
    e.preventDefault();
    filtroNegocioId = null;
    filtroPista.hidden = true;
    activarSubtab('negocios');
  });
  document.getElementById('quitar-filtro-negocio').addEventListener('click', (e) => {
    e.preventDefault();
    filtroNegocioId = null;
    filtroPista.hidden = true;
    cargarCotizaciones();
  });

  // Al venir de "Ver cotizaciones" de un negocio especifico, se limpian los demas filtros
  // (incluida la etapa, que por default solo muestra "Negociacion") para no ocultar por
  // accidente las cotizaciones de ese negocio si estan en otra etapa o quedo texto de un
  // filtro anterior.
  [filtroCotId, filtroCotNombre, filtroCotNegocio, filtroCotContacto, filtroCotFecha].forEach((input) => { input.value = ''; });
  etapasCotSeleccionadas = new Set();
  sincronizarChecksFiltroCotEtapa();
  actualizarBotonFiltroCotEtapa();
  representantesCotSeleccionados = new Set();
  sincronizarChecksFiltroCotRepresentante();
  actualizarBotonFiltroCotRepresentante();

  cargarCotizaciones();
}

function celdaEtapaCotizacion(etapa) {
  const etiquetas = { Pendiente: 'Pendiente', Negociacion: 'Negociación', Ganada: 'Ganada', Perdida: 'Perdida' };
  if (etapa === 'Ganada') return `<span class="estatus-vigente">${etiquetas[etapa]}</span>`;
  if (etapa === 'Perdida') return `<span class="estatus-vencido">${etiquetas[etapa]}</span>`;
  return etiquetas[etapa] || escaparHtml(etapa || '');
}

// Estatus (a nivel cotizacion) de sus solicitudes a proveedor: "Pendiente" si alguna todavia no
// se responde, "OK" si ya se respondieron todas, vacio si nunca se le mando ninguna.
function celdaSolicitudProveedorCotizacion(estatus) {
  if (estatus === 'Pendiente') return '<span class="pill-estatus pill-neutro">Pendiente</span>';
  if (estatus === 'OK') return '<span class="pill-estatus estatus-vigente">OK</span>';
  return '';
}

function renderizarCotizaciones(cotizaciones) {
  tablaCotizaciones.innerHTML = cotizaciones.map((c) => `
    <tr class="fila-clicable${c.etapa === 'Ganada' ? ' fila-ganada' : ''}" data-id="${escaparHtml(c.id_cotizacion)}">
      <td>${escaparHtml(c.id_cotizacion)}</td>
      <td>${celdaSolicitudProveedorCotizacion(c.solicitud_proveedor_estatus)}</td>
      <td>${escaparHtml(c.fecha_creacion || '')}</td>
      <td>${escaparHtml(c.nombre)}</td>
      <td>${escaparHtml(c.contacto_nombre || '')}</td>
      <td>${escaparHtml(c.destino_nombre || '')}</td>
      <td>${escaparHtml(c.moneda)}</td>
      <td>${celdaEtapaCotizacion(c.etapa)}</td>
      <td>${formatoImporte(c.subtotal)}</td>
      <td>${Number(c.descuento_monto) > 0 ? (c.descuento_tipo === 'monto' ? formatoImporte(c.descuento_monto) : c.descuento_porcentaje + '%') : '-'}</td>
      <td>${formatoImporte(c.iva)}</td>
      <td>${formatoImporte(c.gran_total)}</td>
      <td>${celdaEstatus(c.estatus)}</td>
      <td class="acciones">
        <button type="button" class="btn-mini btn-ver-pdf-cotizacion" data-id="${escaparHtml(c.id_cotizacion)}" title="Ver cotización">Ver</button>
        <button type="button" class="btn-mini btn-descargar-pdf-cotizacion" data-id="${escaparHtml(c.id_cotizacion)}" title="Descargar PDF">Descargar PDF</button>
        ${permisosCatalogos.editar ? `<button type="button" class="btn-mini btn-clonar-cotizacion" data-id="${escaparHtml(c.id_cotizacion)}" title="Crear una copia editable de esta cotización">Clonar</button>` : ''}
        ${permisosCatalogos.editar ? `<button class="btn-editar" data-id="${escaparHtml(c.id_cotizacion)}">Editar</button>` : ''}
        ${permisosCatalogos.borrar ? `<button class="btn-borrar" data-id="${escaparHtml(c.id_cotizacion)}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
}

const ordenadorCotizaciones = crearOrdenador(tablaCotizaciones, renderizarCotizaciones);

async function cargarCotizaciones() {
  const parametros = filtroNegocioId ? `?negocio=${encodeURIComponent(filtroNegocioId)}` : '';
  const res = await fetch(`/api/cotizaciones${parametros}`);
  const cotizaciones = await res.json();
  cotizacionesCache = cotizaciones;
  aplicarFiltrosCotizaciones();
  return cotizaciones;
}

// Filtro por Etapa: checkboxes dentro de un panel desplegable que solo se aplican al
// presionar "Aplicar" (o se descartan con "Cancelar"), no en vivo como los demas filtros.
// Por defecto solo se muestran Pendiente y Negociacion (las etapas abiertas); Ganada y Perdida
// quedan ocultas hasta que el usuario las seleccione explicitamente.
let etapasCotSeleccionadas = new Set(['Pendiente', 'Negociacion']);

function actualizarBotonFiltroCotEtapa() {
  filtroCotEtapaBtn.textContent = etapasCotSeleccionadas.size
    ? `${etapasCotSeleccionadas.size} etapa(s) seleccionada(s)`
    : 'Todas las etapas';
}

function sincronizarChecksFiltroCotEtapa() {
  filtroCotEtapaPanel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = etapasCotSeleccionadas.has(cb.value);
  });
}

filtroCotEtapaBtn.addEventListener('click', () => {
  sincronizarChecksFiltroCotEtapa();
  filtroCotEtapaPanel.hidden = !filtroCotEtapaPanel.hidden;
});

document.addEventListener('click', (e) => {
  if (!filtroCotEtapaWrap.contains(e.target)) filtroCotEtapaPanel.hidden = true;
});

btnAplicarFiltroCotEtapa.addEventListener('click', () => {
  etapasCotSeleccionadas = new Set(
    [...filtroCotEtapaPanel.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value)
  );
  actualizarBotonFiltroCotEtapa();
  filtroCotEtapaPanel.hidden = true;
  aplicarFiltrosCotizaciones();
});

btnCancelarFiltroCotEtapa.addEventListener('click', () => {
  sincronizarChecksFiltroCotEtapa();
  filtroCotEtapaPanel.hidden = true;
});

function aplicarFiltrosCotizaciones() {
  const filtradas = cotizacionesCache.filter((c) =>
    coincideTexto(c.id_cotizacion, filtroCotId.value.trim())
    && coincideTexto(c.nombre, filtroCotNombre.value.trim())
    && coincideTexto(c.negocio_nombre, filtroCotNegocio.value.trim())
    && coincideTexto(c.contacto_nombre, filtroCotContacto.value.trim())
    && (!filtroCotFecha.value || c.fecha_creacion === filtroCotFecha.value)
    && (etapasCotSeleccionadas.size === 0 || etapasCotSeleccionadas.has(c.etapa))
    && (representantesCotSeleccionados.size === 0
      || representantesCotSeleccionados.has(c.representante_nombre || SIN_REPRESENTANTE_ASIGNADO))
  );
  ordenadorCotizaciones.actualizarDatos(filtradas);
}

[filtroCotId, filtroCotNombre, filtroCotNegocio, filtroCotContacto].forEach((input) => {
  input.addEventListener('input', aplicarFiltrosCotizaciones);
});
filtroCotFecha.addEventListener('change', aplicarFiltrosCotizaciones);
btnLimpiarFiltrosCot.addEventListener('click', () => {
  [filtroCotId, filtroCotNombre, filtroCotNegocio, filtroCotContacto, filtroCotFecha].forEach((input) => { input.value = ''; });
  etapasCotSeleccionadas = new Set();
  sincronizarChecksFiltroCotEtapa();
  actualizarBotonFiltroCotEtapa();
  representantesCotSeleccionados = new Set();
  sincronizarChecksFiltroCotRepresentante();
  actualizarBotonFiltroCotRepresentante();
  aplicarFiltrosCotizaciones();
});

// ---- Partidas (productos de la cotizacion) ----

// El campo de producto es un input con datalist (no un <select>): solo muestra el codigo del
// Item (sin descripcion) y filtra en vivo segun lo que se va escribiendo.
function poblarDatalistProductos() {
  datalistProductos.innerHTML = productosCache.map((p) => `<option value="${escaparHtml(p.item)}"></option>`).join('');
}

// Estatus (Pendiente/Cotizada) de la solicitud a proveedor mas reciente para este codigo, si
// existe alguna (cargarSolicitudesProveedor mantiene solicitudesProveedorActuales actualizado).
function pillEstatusPartida(codigo) {
  if (!codigo) return '';
  const solicitud = solicitudesProveedorActuales.find((s) => (s.items || []).some((it) => it.codigo === codigo));
  if (!solicitud) return '';
  const clase = solicitud.estatus === 'Respondida' ? 'estatus-vigente' : 'pill-neutro';
  const texto = solicitud.estatus === 'Respondida' ? 'Cotizada' : 'Pendiente';
  return `<span class="pill-estatus ${clase}">${texto}</span>`;
}

function renderizarPartidas() {
  const sinMoneda = !cotizacionMoneda.value;
  tablaPartidas.innerHTML = partidas.map((it, i) => `
    <div class="fila-producto" data-index="${i}">
      <div class="fp-principal">
        <span class="campo-con-boton">
          <input type="text" class="partida-producto" list="lista-productos" placeholder="Código" value="${escaparHtml(it.producto_item || '')}" ${sinMoneda ? 'disabled title="Selecciona primero la Moneda"' : ''} />
          <button type="button" class="btn-mini btn-nuevo-producto-partida" data-index="${i}" title="Este código no existe en el catálogo, créalo" ${!it.producto_item || productosCache.some((p) => p.item === it.producto_item) ? 'hidden' : ''}>+</button>
        </span>
        <input type="number" class="partida-cantidad" step="1" min="0" value="${it.cantidad || ''}" />
        <input type="number" class="partida-precio" step="0.01" min="0" value="${it.precio_unitario || ''}" />
        <span class="partida-total">${formatoImporte((it.cantidad || 0) * (it.precio_unitario || 0))}</span>
        <button type="button" class="btn-quitar-partida" title="Quitar">✕</button>
      </div>
      <div class="fp-secundaria">
        <label title="Si se desmarca, esta partida no suma IVA">
          <input type="checkbox" class="partida-causa-impuesto" ${it.causa_impuesto !== false ? 'checked' : ''} /> Causa impuesto
        </label>
        ${pillEstatusPartida(it.producto_item)}
        ${cotizacionId.value ? `<button type="button" class="btn-mini btn-solicitar-proveedor" data-index="${i}" title="Pedir precio y tiempo de entrega a un proveedor">Solicitar cotización</button>` : ''}
      </div>
    </div>
  `).join('');
}

function calcularResumen() {
  const montos = partidas.map((it) => ({
    monto: (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0),
    gravable: it.causa_impuesto !== false,
  }));
  const subtotal = montos.reduce((acc, m) => acc + m.monto, 0);
  const subtotalGravable = montos.filter((m) => m.gravable).reduce((acc, m) => acc + m.monto, 0);

  const valor = Math.max(Number(cotizacionDescuento.value) || 0, 0);
  // Como importe, el descuento nunca puede rebasar el Sub Total (evita un Gran Total negativo).
  const descuentoMonto = cotizacionDescuentoTipo.value === 'monto' ? Math.min(valor, subtotal) : subtotal * (valor / 100);

  // El descuento se prorratea entre lo gravable y lo no gravable, en proporcion a su peso en el Sub Total.
  const descuentoGravable = subtotal > 0 ? descuentoMonto * (subtotalGravable / subtotal) : 0;
  const iva = (subtotalGravable - descuentoGravable) * 0.16;

  const base = subtotal - descuentoMonto;
  const granTotal = base + iva;
  return { subtotal, descuentoMonto, iva, granTotal };
}

function actualizarResumen() {
  const { subtotal, descuentoMonto, iva, granTotal } = calcularResumen();
  resumenSubtotal.textContent = formatoImporte(subtotal);
  resumenDescuento.textContent = formatoImporte(descuentoMonto);
  resumenIva.textContent = formatoImporte(iva);
  resumenGranTotal.textContent = formatoImporte(granTotal);
}

// El limite de 100 solo tiene sentido cuando el descuento es un %; como importe fijo no hay
// techo fijo (se acota contra el Sub Total al calcular, no aqui donde aun no se conoce).
function actualizarLimiteDescuento() {
  if (cotizacionDescuentoTipo.value === 'monto') {
    cotizacionDescuento.removeAttribute('max');
  } else {
    cotizacionDescuento.setAttribute('max', '100');
  }
}

cotizacionDescuentoTipo.addEventListener('change', () => {
  actualizarLimiteDescuento();
  actualizarResumen();
});

cotizacionMoneda.addEventListener('change', renderizarPartidas);

btnAgregarPartida.addEventListener('click', () => {
  if (!cotizacionMoneda.value) {
    alert('Selecciona la Moneda antes de agregar productos.');
    cotizacionMoneda.focus();
    return;
  }
  partidas.push({ producto_item: '', cantidad: 1, precio_unitario: 0, causa_impuesto: true });
  renderizarPartidas();
  actualizarResumen();
});

tablaPartidas.addEventListener('input', (e) => {
  const tr = e.target.closest('.fila-producto');
  if (!tr) return;
  const i = Number(tr.dataset.index);

  if (e.target.classList.contains('partida-cantidad')) {
    partidas[i].cantidad = Number(e.target.value) || 0;
  } else if (e.target.classList.contains('partida-precio')) {
    partidas[i].precio_unitario = Number(e.target.value) || 0;
  } else if (e.target.classList.contains('partida-producto')) {
    partidas[i].producto_item = e.target.value.trim();
    const producto = productosCache.find((p) => p.item === partidas[i].producto_item);
    const moneda = cotizacionMoneda.value;
    if (producto && moneda) {
      const sugerido = moneda === 'USD' ? producto.precio_usd : producto.precio_mxn;
      if (sugerido !== null && sugerido !== undefined) {
        partidas[i].precio_unitario = sugerido;
        tr.querySelector('.partida-precio').value = sugerido;
      }
    }
    const btnNuevo = tr.querySelector('.btn-nuevo-producto-partida');
    if (btnNuevo) btnNuevo.hidden = !partidas[i].producto_item || Boolean(producto);
  } else if (e.target.classList.contains('partida-causa-impuesto')) {
    partidas[i].causa_impuesto = e.target.checked;
    actualizarResumen();
    return;
  } else {
    return;
  }
  tr.querySelector('.partida-total').textContent = formatoImporte(partidas[i].cantidad * partidas[i].precio_unitario);
  actualizarResumen();
});

tablaPartidas.addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-quitar-partida')) {
    const i = Number(e.target.closest('.fila-producto').dataset.index);
    partidas.splice(i, 1);
    renderizarPartidas();
    actualizarResumen();
    return;
  }
  if (e.target.classList.contains('btn-solicitar-proveedor')) {
    const i = Number(e.target.dataset.index);
    abrirModalSolicitudProveedor(partidas[i]);
    return;
  }
  if (e.target.classList.contains('btn-nuevo-producto-partida')) {
    const i = Number(e.target.dataset.index);
    irACrearProductoYVolver(partidas[i]);
  }
});

// Si el codigo que se escribio no existe en el catalogo de Productos: manda a crearlo alli
// mismo y guarda en sessionStorage a que cotizacion regresar, para retomar exactamente donde se
// quedo en cuanto vuelva. Si la cotizacion ya esta guardada basta con su ID (se vuelve a pedir
// fresca al servidor); si es una cotizacion nueva que aun no se guarda, se guarda tambien un
// borrador de todos los campos capturados hasta el momento para poder reconstruirla localmente.
function irACrearProductoYVolver(partida) {
  const datosGenerales = cotizacionId.value ? null : {
    nombre: cotizacionNombre.value,
    negocio_id: cotizacionNegocio.value,
    contacto_id: cotizacionContacto.value,
    destino_ids: valoresSeleccionados(cotizacionDestino),
    representante_id: cotizacionRepresentante.value,
    moneda: cotizacionMoneda.value,
    etapa: cotizacionEtapa.value,
    descuento_tipo: cotizacionDescuentoTipo.value,
    descuento_valor: cotizacionDescuento.value,
    mostrar_totales: cotizacionMostrarTotales.checked,
    vencimiento_opcion: cotizacionVencimientoOpcion.value,
    fecha_vencimiento: cotizacionVencimientoFecha.value,
    metodo_pago: cotizacionMetodoPago.value,
    lugar_entrega: cotizacionLugarEntrega.value,
    tiempo_entrega: cotizacionTiempoEntrega.value,
    fecha_seguimiento: cotizacionFechaSeguimiento.value,
    observaciones: cotizacionObservaciones.value,
    partidas: partidas.slice(),
  };
  sessionStorage.setItem('cotizacionPendienteProducto', JSON.stringify({
    cotizacionId: cotizacionId.value || null,
    codigo: partida.producto_item,
    cantidad: partida.cantidad,
    datosGenerales,
  }));
  window.location.href = `catalogos.html?tab=productos&codigo=${encodeURIComponent(partida.producto_item)}&volver=cotizacion`;
}

// Agrega el codigo pendiente a `partidas` (si no quedo ya capturado por otro medio) con un
// precio sugerido segun el catalogo, y refresca la tabla/resumen.
function agregarPendienteAPartidas(pendiente, moneda) {
  if (pendiente.codigo && !partidas.some((p) => p.producto_item === pendiente.codigo)) {
    const producto = productosCache.find((p) => p.item === pendiente.codigo);
    const sugerido = producto ? (moneda === 'USD' ? producto.precio_usd : producto.precio_mxn) : null;
    partidas.push({
      producto_item: pendiente.codigo,
      cantidad: pendiente.cantidad || 1,
      precio_unitario: sugerido ?? 0,
      causa_impuesto: true,
    });
  }
  renderizarPartidas();
  actualizarResumen();
}

async function restaurarCotizacionPendienteProducto() {
  const guardado = sessionStorage.getItem('cotizacionPendienteProducto');
  if (!guardado) return;
  sessionStorage.removeItem('cotizacionPendienteProducto');

  const pendiente = JSON.parse(guardado);
  activarSubtab('captura');

  if (pendiente.cotizacionId) {
    const res = await fetch(`/api/cotizaciones/${encodeURIComponent(pendiente.cotizacionId)}`);
    if (!res.ok) return;
    const c = await res.json();
    cargarCotizacionEnFormulario(c);
    agregarPendienteAPartidas(pendiente, c.moneda);
  } else {
    // Cotizacion nueva que todavia no se guardaba: reconstruye el borrador localmente, no hay
    // nada que pedirle al servidor.
    const d = pendiente.datosGenerales || {};
    limpiarFormCotizacion();
    abrirFormCotizacion();
    cotizacionNombre.value = d.nombre || '';
    cotizacionNegocio.value = d.negocio_id || '';
    poblarSelect(cotizacionContacto, contactosCache, 'id_contacto', 'nombre_completo_correo');
    cotizacionContacto.value = d.contacto_id || '';
    poblarSelectMultiple(cotizacionDestino, destinosCache, 'id_destino', 'destino');
    marcarSeleccionMultiple(cotizacionDestino, new Set((d.destino_ids || []).map(String)));
    cotizacionRepresentante.value = d.representante_id || '';
    cotizacionMoneda.value = d.moneda || '';
    cotizacionEtapa.value = d.etapa || 'Pendiente';
    cotizacionDescuentoTipo.value = d.descuento_tipo || 'porcentaje';
    actualizarLimiteDescuento();
    cotizacionDescuento.value = d.descuento_valor ?? 0;
    cotizacionMostrarTotales.checked = d.mostrar_totales !== false;
    cotizacionVencimientoOpcion.value = d.vencimiento_opcion || '30';
    actualizarVencimientoPorOpcion();
    if (d.vencimiento_opcion === 'personalizada') cotizacionVencimientoFecha.value = d.fecha_vencimiento || '';
    cotizacionMetodoPago.value = d.metodo_pago || '';
    cotizacionLugarEntrega.value = d.lugar_entrega || '';
    cotizacionTiempoEntrega.value = d.tiempo_entrega || '';
    cotizacionFechaSeguimiento.value = d.fecha_seguimiento || '';
    cotizacionObservaciones.value = d.observaciones || '';

    partidas = (d.partidas || []).slice();
    agregarPendienteAPartidas(pendiente, d.moneda);
    actualizarCamposVaciosCotizacion();
  }

  mostrarPasoProductosCotizacion();
}

cotizacionDescuento.addEventListener('input', actualizarResumen);

// ---------- Solicitar cotizacion a un Proveedor (por producto) ----------
// Cuando no se sabe el costo de un producto todavia: genera una liga publica (sin login) para
// que el Proveedor responda precio de venta y tiempo de entrega, sin exponerle nada de la
// cotizacion real. Requiere que la cotizacion ya este guardada (necesita su id).

const modalSolicitudProveedorOverlay = document.getElementById('modal-solicitud-proveedor-overlay');
const modalSolicitudProveedorCerrar = document.getElementById('modal-solicitud-proveedor-cerrar');
const formSolicitudProveedor = document.getElementById('form-solicitud-proveedor');
const solicitudProductoCodigo = document.getElementById('solicitud-producto-codigo');
const solicitudProductoDescripcion = document.getElementById('solicitud-producto-descripcion');
const solicitudProductoCantidad = document.getElementById('solicitud-producto-cantidad');
const solicitudProductoMarca = document.getElementById('solicitud-producto-marca');
const solicitudProveedorSelect = document.getElementById('solicitud-proveedor');
const solicitudLugarEntrega = document.getElementById('solicitud-lugar-entrega');
const solicitudProveedorResultado = document.getElementById('solicitud-proveedor-resultado');
const solicitudLigaGenerada = document.getElementById('solicitud-liga-generada');
const btnCopiarLigaSolicitud = document.getElementById('btn-copiar-liga-solicitud');
const btnCerrarSolicitudProveedor = document.getElementById('btn-cerrar-solicitud-proveedor');

let proveedoresCacheCot = [];
let partidaParaSolicitud = null;

async function cargarProveedoresCotizacion() {
  const res = await fetch('/api/proveedores');
  proveedoresCacheCot = res.ok ? await res.json() : [];
  poblarSelect(solicitudProveedorSelect, proveedoresCacheCot, 'id_proveedor', 'nombre');
}

function abrirModalSolicitudProveedor(partida) {
  partidaParaSolicitud = partida;
  const producto = productosCache.find((p) => p.item === partida.producto_item);
  solicitudProductoCodigo.textContent = partida.producto_item || '';
  solicitudProductoDescripcion.textContent = (producto && producto.descripcion) || '';
  // La marca viene del catalogo de Articulos (productos.marca_id), no se captura a mano.
  solicitudProductoMarca.textContent = (producto && producto.marca_nombre) || 'Sin marca en el catálogo';
  solicitudProductoCantidad.textContent = partida.cantidad;
  solicitudProveedorSelect.value = '';
  solicitudLugarEntrega.value = cotizacionLugarEntrega.value || '';
  formSolicitudProveedor.hidden = false;
  solicitudProveedorResultado.hidden = true;
  modalSolicitudProveedorOverlay.hidden = false;
}

function cerrarModalSolicitudProveedor() {
  modalSolicitudProveedorOverlay.hidden = true;
  formSolicitudProveedor.reset();
  partidaParaSolicitud = null;
}

modalSolicitudProveedorCerrar.addEventListener('click', cerrarModalSolicitudProveedor);
modalSolicitudProveedorOverlay.addEventListener('click', (e) => {
  if (e.target === modalSolicitudProveedorOverlay) cerrarModalSolicitudProveedor();
});
btnCerrarSolicitudProveedor.addEventListener('click', cerrarModalSolicitudProveedor);

formSolicitudProveedor.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!partidaParaSolicitud) return;

  const res = await fetch(`/api/cotizaciones/${encodeURIComponent(cotizacionId.value)}/solicitudes-proveedor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proveedor_id: solicitudProveedorSelect.value,
      lugar_entrega: solicitudLugarEntrega.value.trim(),
      items: [{
        cantidad: partidaParaSolicitud.cantidad,
        codigo: partidaParaSolicitud.producto_item,
        descripcion: solicitudProductoDescripcion.textContent,
        marca: (productosCache.find((p) => p.item === partidaParaSolicitud.producto_item) || {}).marca_nombre || '',
      }],
    }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return;
  }
  const creado = await res.json();
  solicitudLigaGenerada.value = `${window.location.origin}/solicitud-proveedor.html?token=${creado.token_publico}`;
  formSolicitudProveedor.hidden = true;
  solicitudProveedorResultado.hidden = false;
  cargarSolicitudesProveedor();
});

btnCopiarLigaSolicitud.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(solicitudLigaGenerada.value);
    btnCopiarLigaSolicitud.textContent = 'Copiado';
    setTimeout(() => { btnCopiarLigaSolicitud.textContent = 'Copiar'; }, 1500);
  } catch {
    solicitudLigaGenerada.select();
  }
});

// ---- Alta rapida de Proveedor (desde el modal de Solicitud) ----

const btnNuevoProveedorSolicitud = document.getElementById('btn-nuevo-proveedor-solicitud');
const modalRapidoProveedorOverlay = document.getElementById('modal-rapido-proveedor-overlay');
const modalRapidoProveedorCerrar = document.getElementById('modal-rapido-proveedor-cerrar');
const modalRapidoProveedorNombre = document.getElementById('modal-rapido-proveedor-nombre');
const modalRapidoProveedorEmpresa = document.getElementById('modal-rapido-proveedor-empresa');
const formRapidoProveedor = document.getElementById('form-rapido-proveedor');

btnNuevoProveedorSolicitud.addEventListener('click', () => {
  formRapidoProveedor.reset();
  modalRapidoProveedorOverlay.hidden = false;
  modalRapidoProveedorNombre.focus();
});
modalRapidoProveedorCerrar.addEventListener('click', () => { modalRapidoProveedorOverlay.hidden = true; });
modalRapidoProveedorOverlay.addEventListener('click', (e) => {
  if (e.target === modalRapidoProveedorOverlay) modalRapidoProveedorOverlay.hidden = true;
});

formRapidoProveedor.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = modalRapidoProveedorNombre.value.trim();
  if (!nombre) return;
  const res = await fetch('/api/proveedores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, empresa: modalRapidoProveedorEmpresa.value.trim() }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return;
  }
  const creado = await res.json();
  await cargarProveedoresCotizacion();
  solicitudProveedorSelect.value = creado.id_proveedor;
  modalRapidoProveedorOverlay.hidden = true;
});

// ---- Lista de solicitudes ya mandadas para esta cotizacion ----

const tarjetaSolicitudesProveedor = document.getElementById('tarjeta-solicitudes-proveedor');
const listaSolicitudesProveedor = document.getElementById('lista-solicitudes-proveedor');
const btnToggleSolicitudesProveedor = document.getElementById('btn-toggle-solicitudes-proveedor');
const solpDetalle = document.getElementById('solp-detalle');
const solpResumenTexto = document.getElementById('solp-resumen-texto');

btnToggleSolicitudesProveedor.addEventListener('click', () => {
  const expandido = solpDetalle.hidden;
  solpDetalle.hidden = !expandido;
  btnToggleSolicitudesProveedor.setAttribute('aria-expanded', String(expandido));
});

// Solicitudes de la cotizacion actual; se usa tambien desde renderizarPartidas para mostrar la
// columna "Cotización proveedor" (Pendiente/Cotizada) de cada producto.
let solicitudesProveedorActuales = [];

function pillEstatusSolicitud(estatus) {
  const clase = estatus === 'Respondida' ? 'estatus-vigente' : 'pill-neutro';
  return `<span class="pill-estatus ${clase}">${escaparHtml(estatus)}</span>`;
}

async function cargarSolicitudesProveedor() {
  if (!cotizacionId.value) {
    tarjetaSolicitudesProveedor.hidden = true;
    solicitudesProveedorActuales = [];
    return;
  }
  const res = await fetch(`/api/cotizaciones/${encodeURIComponent(cotizacionId.value)}/solicitudes-proveedor`);
  const solicitudes = res.ok ? await res.json() : [];
  solicitudesProveedorActuales = solicitudes;
  tarjetaSolicitudesProveedor.hidden = solicitudes.length === 0;

  const pendientes = solicitudes.filter((s) => s.estatus !== 'Respondida').length;
  solpResumenTexto.textContent = solicitudes.length
    ? `${solicitudes.length} solicitud${solicitudes.length === 1 ? '' : 'es'}${pendientes ? ` · ${pendientes} pendiente${pendientes === 1 ? '' : 's'}` : ' · todas respondidas'}`
    : '';
  // Colapsada por default cada vez que se (re)carga (ej. al abrir la cotizacion o tras crear una
  // solicitud nueva), para no empujar el resto del formulario hacia abajo.
  solpDetalle.hidden = true;
  btnToggleSolicitudesProveedor.setAttribute('aria-expanded', 'false');

  listaSolicitudesProveedor.innerHTML = solicitudes.map((s) => `
    <div class="panel-form panel-form-clicable" data-id="${escaparHtml(s.id_solicitud)}" data-token="${escaparHtml(s.token_publico)}" title="Clic para ver la pantalla que se le envió al proveedor">
      <div>
        <strong>${escaparHtml(s.proveedor_nombre || '')}</strong>
        — ${escaparHtml((s.items || []).map((it) => `${it.codigo} (x${it.cantidad})`).join(', '))}
        ${pillEstatusSolicitud(s.estatus)}
        ${s.tiempo_respuesta ? `<span class="pista">Respondió en ${escaparHtml(s.tiempo_respuesta.texto)}</span>` : ''}
      </div>
      ${s.estatus === 'Respondida' ? `
        <div class="pista">
          ${(s.items || []).map((it) => `${escaparHtml(it.codigo)}: ${it.precio_venta != null ? formatoImporte(it.precio_venta) : 'sin precio'} — ${escaparHtml(it.tiempo_entrega || 'sin tiempo de entrega')}${it.comentarios ? ` (${escaparHtml(it.comentarios)})` : ''}`).join('<br>')}
          ${s.comentarios ? `<br><strong>Comentarios del proveedor:</strong> ${escaparHtml(s.comentarios)}` : ''}
        </div>
      ` : ''}
      <div class="acciones-form" style="margin-top: 0.4rem;">
        <button type="button" class="btn-mini btn-copiar-liga-solicitud" data-token="${escaparHtml(s.token_publico)}" title="Liga única de esta solicitud, sin necesidad de iniciar sesión">Copiar liga</button>
        ${s.estatus === 'Respondida' ? `<button type="button" class="btn-mini btn-copiar-solicitud-a-cotizacion" data-id="${escaparHtml(s.id_solicitud)}">Copiar a la cotización</button>` : ''}
        ${permisosCatalogos.borrar ? `<button type="button" class="btn-mini btn-borrar-solicitud-proveedor" data-id="${escaparHtml(s.id_solicitud)}">Borrar</button>` : ''}
      </div>
    </div>
  `).join('');
  renderizarPartidas();
}

// Compartida entre el panel de una cotizacion y el catalogo global de solicitudes.
async function eliminarSolicitudProveedor(id, alExito) {
  if (!confirmarDoble('¿Borrar esta solicitud a proveedor? No se puede deshacer.')) return;
  const res = await fetch(`/api/solicitudes-proveedor/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return;
  }
  alExito();
}

listaSolicitudesProveedor.addEventListener('click', async (e) => {
  if (e.target.classList.contains('btn-copiar-liga-solicitud')) {
    const liga = `${window.location.origin}/solicitud-proveedor.html?token=${e.target.dataset.token}`;
    try {
      await navigator.clipboard.writeText(liga);
    } catch {
      prompt('Copia la liga:', liga);
      return;
    }
    const textoOriginal = e.target.textContent;
    e.target.textContent = 'Copiada';
    setTimeout(() => { e.target.textContent = textoOriginal; }, 1500);
    return;
  }
  if (e.target.classList.contains('btn-borrar-solicitud-proveedor')) {
    await eliminarSolicitudProveedor(e.target.dataset.id, cargarSolicitudesProveedor);
    return;
  }
  if (!e.target.classList.contains('btn-copiar-solicitud-a-cotizacion')) {
    if (e.target.closest('button')) return;
    const tarjeta = e.target.closest('.panel-form-clicable');
    if (tarjeta) window.open(`solicitud-proveedor.html?token=${tarjeta.dataset.token}`, '_blank');
    return;
  }
  const id = e.target.dataset.id;
  const res = await fetch(`/api/cotizaciones/${encodeURIComponent(cotizacionId.value)}/solicitudes-proveedor/${encodeURIComponent(id)}/aplicar`, {
    method: 'PUT',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return;
  }
  const data = await res.json();
  partidas = data.cotizacion.items.map((it) => ({
    producto_item: it.producto_item,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    causa_impuesto: it.causa_impuesto !== false,
  }));
  renderizarPartidas();
  actualizarResumen();
  alert(`Se actualizó el precio de ${data.actualizados} producto(s) en la cotización.`);
});

// ---- Catalogo global de solicitudes a proveedor (todas las cotizaciones, subtab propio) ----

const tablaSolicitudesProveedorGlobal = document.getElementById('tabla-solicitudes-proveedor-global');
const filtroSolpProveedor = document.getElementById('filtro-solp-proveedor');
const filtroSolpCotizacion = document.getElementById('filtro-solp-cotizacion');
const filtroSolpDestino = document.getElementById('filtro-solp-destino');
const filtroSolpEstatus = document.getElementById('filtro-solp-estatus');

let solicitudesProveedorGlobalCache = [];

// Antes de responder solo tiene sentido mostrar que se pidio (codigo x cantidad); ya respondida,
// se agrega lo que en verdad cotizo el proveedor (precio y tiempo de entrega), que es lo que de
// verdad importa ver en este catalogo una vez contestada.
function resumenProductosSolicitud(s) {
  return (s.items || []).map((it) => {
    const base = `${escaparHtml(it.codigo)} (x${escaparHtml(it.cantidad)})`;
    if (s.estatus !== 'Respondida') return base;
    const precio = it.precio_venta != null ? formatoImporte(it.precio_venta) : 'sin precio';
    const tiempo = escaparHtml(it.tiempo_entrega || 'sin tiempo de entrega');
    return `${base}: ${precio} — ${tiempo}`;
  }).join('<br>');
}

function renderizarSolicitudesProveedorGlobal(lista) {
  tablaSolicitudesProveedorGlobal.innerHTML = lista.map((s) => `
    <tr class="fila-clicable" data-cotizacion-id="${escaparHtml(s.cotizacion_id)}" data-token="${escaparHtml(s.token_publico)}" title="Clic para ver la pantalla que se le envió al proveedor">
      <td>${escaparHtml(s.fecha_creacion || '')}</td>
      <td>${escaparHtml(s.proveedor_nombre || '')}</td>
      <td>${escaparHtml(s.cotizacion_nombre || '')} <span class="pista">(${escaparHtml(s.cotizacion_id)})</span></td>
      <td>${escaparHtml(s.destino_nombre || '')}</td>
      <td>${resumenProductosSolicitud(s)}</td>
      <td>${pillEstatusSolicitud(s.estatus)}</td>
      <td>${s.tiempo_respuesta ? escaparHtml(s.tiempo_respuesta.texto) : ''}</td>
      <td class="acciones">
        <button type="button" class="btn-mini btn-copiar-liga-solicitud" data-token="${escaparHtml(s.token_publico)}" title="Liga única de esta solicitud, sin necesidad de iniciar sesión">Copiar liga</button>
        <button type="button" class="btn-mini btn-ver-cotizacion-solicitud" data-cotizacion-id="${escaparHtml(s.cotizacion_id)}">Ver cotización</button>
        ${permisosCatalogos.borrar ? `<button type="button" class="btn-mini btn-borrar-solicitud-proveedor" data-id="${escaparHtml(s.id_solicitud)}">Borrar</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function aplicarFiltrosSolicitudesProveedorGlobal() {
  const filtradas = solicitudesProveedorGlobalCache.filter((s) =>
    coincideTexto(s.proveedor_nombre, filtroSolpProveedor.value.trim())
    && (coincideTexto(s.cotizacion_nombre, filtroSolpCotizacion.value.trim()) || coincideTexto(s.cotizacion_id, filtroSolpCotizacion.value.trim()))
    && coincideTexto(s.destino_nombre, filtroSolpDestino.value.trim())
    && (!filtroSolpEstatus.value || s.estatus === filtroSolpEstatus.value)
  );
  renderizarSolicitudesProveedorGlobal(filtradas);
}

async function cargarSolicitudesProveedorGlobal() {
  const res = await fetch('/api/solicitudes-proveedor');
  solicitudesProveedorGlobalCache = res.ok ? await res.json() : [];
  aplicarFiltrosSolicitudesProveedorGlobal();
}

[filtroSolpProveedor, filtroSolpCotizacion, filtroSolpDestino].forEach((input) => {
  input.addEventListener('input', aplicarFiltrosSolicitudesProveedorGlobal);
});
filtroSolpEstatus.addEventListener('change', aplicarFiltrosSolicitudesProveedorGlobal);

tablaSolicitudesProveedorGlobal.addEventListener('click', async (e) => {
  if (e.target.classList.contains('btn-copiar-liga-solicitud')) {
    const liga = `${window.location.origin}/solicitud-proveedor.html?token=${e.target.dataset.token}`;
    try {
      await navigator.clipboard.writeText(liga);
    } catch {
      prompt('Copia la liga:', liga);
      return;
    }
    const textoOriginal = e.target.textContent;
    e.target.textContent = 'Copiada';
    setTimeout(() => { e.target.textContent = textoOriginal; }, 1500);
    return;
  }
  if (e.target.classList.contains('btn-borrar-solicitud-proveedor')) {
    await eliminarSolicitudProveedor(e.target.dataset.id, cargarSolicitudesProveedorGlobal);
    return;
  }
  if (e.target.classList.contains('btn-ver-cotizacion-solicitud')) {
    abrirDetalleCotizacion(e.target.dataset.cotizacionId);
    return;
  }
  if (e.target.closest('button')) return;
  const fila = e.target.closest('tr');
  if (!fila || !fila.dataset.token) return;
  window.open(`solicitud-proveedor.html?token=${fila.dataset.token}`, '_blank');
});

// ---- Alta / edicion de la cotizacion ----

// ---- Fecha de creacion / Fecha de vencimiento ----

function hoyISO() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

function sumarDias(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

// Si la fecha de vencimiento guardada coincide con creacion+30/60/90, se preselecciona esa
// opcion; si no coincide con ninguna, se asume "Personalizada".
function detectarOpcionVencimiento(fechaCreacion, fechaVencimiento) {
  if (!fechaVencimiento) return '30';
  for (const dias of [30, 60, 90]) {
    if (sumarDias(fechaCreacion, dias) === fechaVencimiento) return String(dias);
  }
  return 'personalizada';
}

function actualizarVencimientoPorOpcion() {
  const opcion = cotizacionVencimientoOpcion.value;
  if (opcion === 'personalizada') {
    cotizacionVencimientoFecha.disabled = false;
  } else {
    const base = cotizacionFechaCreacion.value || hoyISO();
    cotizacionVencimientoFecha.value = sumarDias(base, Number(opcion));
    cotizacionVencimientoFecha.disabled = true;
  }
}

cotizacionVencimientoOpcion.addEventListener('change', actualizarVencimientoPorOpcion);

function limpiarFormCotizacion() {
  cotizacionId.value = '';
  formCotizacion.reset();
  // reset() solo regresa los VALORES a su default; si Contacto o Destino habian quedado
  // filtrados por un cruce anterior (filtrarContactosPorDestino/filtrarDestinosPorContacto), sus
  // <option> siguen siendo el subconjunto angosto. Se regresan aqui al catalogo completo para
  // que una cotizacion nueva siempre arranque sin ese filtro heredado.
  poblarSelect(cotizacionContacto, contactosCache, 'id_contacto', 'nombre_completo_correo');
  poblarSelectMultiple(cotizacionDestino, destinosCache, 'id_destino', 'destino');
  actualizarLimiteDescuento();
  partidas = [];
  renderizarPartidas();
  actualizarResumen();
  cargarSolicitudesProveedor();
  btnGuardarCotizacion.textContent = 'Guardar cotización';
  btnEnviarTareasSeguimiento.hidden = true;
  cotizacionAccionesEdicion.hidden = true;
  cotizacionPanelEtapa.hidden = true;
  ocultarMarcarPerdidaForm();
  ocultarMarcarGanadaPanel();
  if (filtroNegocioId) {
    cotizacionNegocio.value = filtroNegocioId;
    replicarContactoYDestinoDeNegocio(filtroNegocioId);
  }

  cotizacionFechaCreacion.value = hoyISO();
  cotizacionVencimientoOpcion.value = '30';
  actualizarVencimientoPorOpcion();
  cotizacionFechaSeguimiento.value = sumarDias(hoyISO(), 15);

  actualizarCamposVaciosCotizacion();
  tituloFormCotizacion.textContent = 'Nueva cotización';
  mostrarPasoDatosCotizacion();
}

// La captura solia estar dividida en dos pasos (Datos generales / Productos) con un boton
// "Siguiente" que validaba y cambiaba de pantalla. Se quito: ese cambio de pantalla dependia de
// la validacion nativa del navegador dentro de un modal con su propio scroll, y de forma
// intermitente (distinto navegador/momento) el boton parecia "no hacer nada" sin ningun aviso,
// dejando a quien capturaba sin poder llegar siquiera al boton de Guardar. Ahora todo vive en
// una sola pantalla continua: no hay nada que pueda bloquear el acceso a Guardar.
function mostrarPasoDatosCotizacion() {}
function mostrarPasoProductosCotizacion() {}

function abrirFormCotizacion() {
  modalCotizacionOverlay.hidden = false;
}

function cerrarFormCotizacion() {
  modalCotizacionOverlay.hidden = true;
  limpiarFormCotizacion();
}

modalCotizacionCerrar.addEventListener('click', cerrarFormCotizacion);
modalCotizacionOverlay.addEventListener('click', (e) => {
  if (e.target === modalCotizacionOverlay) cerrarFormCotizacion();
});

btnMostrarFormCotizacion.addEventListener('click', () => {
  limpiarFormCotizacion();
  abrirFormCotizacion();
});

// Atajo desde Visualizacion de cotizaciones: manda a Captura y abre el formulario directo,
// ya que "Captura de cotizaciones" se quito de la barra lateral (este boton la reemplaza).
const btnNuevaCotizacionVisualizacion = document.getElementById('btn-nueva-cotizacion-visualizacion');
btnNuevaCotizacionVisualizacion.addEventListener('click', () => {
  activarSubtab('captura');
  limpiarFormCotizacion();
  abrirFormCotizacion();
});

btnCancelarCotizacion.addEventListener('click', () => {
  cerrarFormCotizacion();
  activarSubtab('visualizacion');
});

// Envia esta cotizacion (ya guardada) a Tareas como un pendiente de Seguimiento: nace con la
// actividad "Seguimiento" y, si la cotizacion tiene Fecha de seguimiento, se usa como Fecha de
// compromiso de la tarea.
btnEnviarTareasSeguimiento.addEventListener('click', async () => {
  const actividades = await fetch('/api/actividades').then((r) => r.json());
  const seguimiento = actividades.find((a) => a.actividad.trim().toLowerCase() === 'seguimiento');
  if (!seguimiento) {
    alert('No existe la actividad "Seguimiento" en Catálogos → Actividades. Créala primero.');
    return;
  }

  const nombreNegocio = cotizacionNegocio.options[cotizacionNegocio.selectedIndex]?.textContent || '';
  const res = await fetch('/api/pendientes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: `Seguimiento: ${cotizacionNombre.value.trim()}${nombreNegocio ? ' - ' + nombreNegocio : ''}`,
      fecha_compromiso: cotizacionFechaSeguimiento.value || null,
      actividades: [seguimiento.id_actividad],
      negocio_id: cotizacionNegocio.value || null,
    }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return;
  }
  cargarNegocios();
  alert('Se envió a Tareas de seguimiento.');
});

formCotizacion.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    nombre: cotizacionNombre.value.trim(),
    negocio_id: cotizacionNegocio.value || null,
    contacto_id: cotizacionContacto.value || null,
    destino_ids: valoresSeleccionados(cotizacionDestino).map(Number),
    representante_id: cotizacionRepresentante.value || null,
    moneda: cotizacionMoneda.value,
    etapa: cotizacionEtapa.value,
    descuento_tipo: cotizacionDescuentoTipo.value,
    descuento_valor: Number(cotizacionDescuento.value) || 0,
    fecha_vencimiento: cotizacionVencimientoFecha.value || null,
    fecha_seguimiento: cotizacionFechaSeguimiento.value || null,
    metodo_pago: cotizacionMetodoPago.value.trim(),
    lugar_entrega: cotizacionLugarEntrega.value.trim(),
    tiempo_entrega: cotizacionTiempoEntrega.value.trim(),
    observaciones: cotizacionObservaciones.value.trim(),
    mostrar_totales: cotizacionMostrarTotales.checked,
    items: partidas.filter((it) => it.producto_item),
  };

  const id = cotizacionId.value;
  const res = await fetch(id ? `/api/cotizaciones/${id}` : '/api/cotizaciones', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return;
  }

  if (!id && pendienteOrigenId) {
    await fetch(`/api/pendientes/${pendienteOrigenId}`, { method: 'DELETE' });
    pendienteOrigenId = null;
  }

  cerrarFormCotizacion();
  activarSubtab('visualizacion');
  cargarCotizaciones();
  cargarNegocios();
});

tablaCotizaciones.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-ver-pdf-cotizacion')) {
    generarPDFCotizacion(id);
    return;
  }

  if (e.target.classList.contains('btn-descargar-pdf-cotizacion')) {
    descargarPDFCotizacion(id);
    return;
  }

  if (e.target.classList.contains('btn-clonar-cotizacion')) {
    clonarCotizacion(id);
    return;
  }

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Borrar esta cotización?')) return;
    const res = await fetch(`/api/cotizaciones/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
      return;
    }
    cargarCotizaciones();
    cargarNegocios();
  }

  if (e.target.classList.contains('btn-editar')) {
    editarCotizacion(id);
  }
});

// Carga una cotizacion (ya obtenida del servidor) en el formulario de Captura y muestra ese
// formulario. Se usa tanto desde el boton "Editar" de la tabla como desde el modal de detalle.
function cargarCotizacionEnFormulario(c) {
  cotizacionId.value = c.id_cotizacion;
  cotizacionNombre.value = c.nombre;
  cotizacionNegocio.value = c.negocio_id || '';
  poblarSelect(cotizacionContacto, contactosCache, 'id_contacto', 'nombre_completo_correo');
  cotizacionContacto.value = c.contacto_id || '';
  poblarSelectMultiple(cotizacionDestino, destinosCache, 'id_destino', 'destino');
  marcarSeleccionMultiple(cotizacionDestino, new Set((c.destinos || []).map((d) => String(d.id_destino))));
  cotizacionRepresentante.value = c.representante_id || '';
  cotizacionMoneda.value = c.moneda;
  cotizacionEtapa.value = c.etapa || 'Negociacion';
  cotizacionDescuentoTipo.value = c.descuento_tipo === 'monto' ? 'monto' : 'porcentaje';
  actualizarLimiteDescuento();
  cotizacionDescuento.value = (c.descuento_tipo === 'monto' ? c.descuento_monto : c.descuento_porcentaje) || 0;
  partidas = c.items.map((it) => ({
    producto_item: it.producto_item,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    causa_impuesto: it.causa_impuesto !== false,
  }));
  renderizarPartidas();
  cotizacionMostrarTotales.checked = c.mostrar_totales !== false;
  actualizarResumen();
  cargarSolicitudesProveedor();

  cotizacionFechaCreacion.value = c.fecha_creacion || '';
  cotizacionVencimientoOpcion.value = detectarOpcionVencimiento(c.fecha_creacion, c.fecha_vencimiento);
  cotizacionVencimientoFecha.value = c.fecha_vencimiento || '';
  cotizacionVencimientoFecha.disabled = cotizacionVencimientoOpcion.value !== 'personalizada';
  cotizacionMetodoPago.value = c.metodo_pago || '';
  cotizacionLugarEntrega.value = c.lugar_entrega || '';
  cotizacionTiempoEntrega.value = c.tiempo_entrega || '';
  cotizacionFechaSeguimiento.value = c.fecha_seguimiento || '';
  cotizacionObservaciones.value = c.observaciones || '';

  btnGuardarCotizacion.textContent = 'Guardar cambios';
  btnEnviarTareasSeguimiento.hidden = false;

  cotizacionAccionesEdicion.hidden = false;
  cotizacionFormEstatus.innerHTML = pillEstatus(c.estatus);
  cotizacionPanelEtapa.hidden = !(permisosCatalogos.editar && ['Pendiente', 'Negociacion'].includes(c.etapa));
  ocultarMarcarPerdidaForm();
  ocultarMarcarGanadaPanel();

  actualizarCamposVaciosCotizacion();
  tituloFormCotizacion.textContent = `Editar cotización · ${c.id_cotizacion}`;
  mostrarPasoDatosCotizacion();
  activarSubtab('captura');
  abrirFormCotizacion();
  cotizacionNombre.focus();
}

async function editarCotizacion(id) {
  const res = await fetch(`/api/cotizaciones/${encodeURIComponent(id)}`);
  if (!res.ok) return;
  const c = await res.json();
  cargarCotizacionEnFormulario(c);
}

// Crea una copia editable de una cotizacion existente: abre Captura con los mismos productos,
// moneda, representante y datos de entrega, pero sin ID (se guarda como una cotizacion nueva),
// con fechas reiniciadas (como una cotizacion recien creada) y lista para cambiar
// Negocio/Contacto/Destino antes de guardar.
async function clonarCotizacion(id) {
  const res = await fetch(`/api/cotizaciones/${encodeURIComponent(id)}`);
  if (!res.ok) return;
  const c = await res.json();

  limpiarFormCotizacion();

  cotizacionNombre.value = `${c.nombre} (copia)`;
  cotizacionNegocio.value = c.negocio_id || '';
  poblarSelect(cotizacionContacto, contactosCache, 'id_contacto', 'nombre_completo_correo');
  cotizacionContacto.value = c.contacto_id || '';
  poblarSelectMultiple(cotizacionDestino, destinosCache, 'id_destino', 'destino');
  marcarSeleccionMultiple(cotizacionDestino, new Set((c.destinos || []).map((d) => String(d.id_destino))));
  cotizacionRepresentante.value = c.representante_id || '';
  cotizacionMoneda.value = c.moneda;
  cotizacionDescuentoTipo.value = c.descuento_tipo === 'monto' ? 'monto' : 'porcentaje';
  actualizarLimiteDescuento();
  cotizacionDescuento.value = (c.descuento_tipo === 'monto' ? c.descuento_monto : c.descuento_porcentaje) || 0;
  cotizacionMetodoPago.value = c.metodo_pago || '';
  cotizacionLugarEntrega.value = c.lugar_entrega || '';
  cotizacionTiempoEntrega.value = c.tiempo_entrega || '';
  cotizacionObservaciones.value = c.observaciones || '';

  partidas = c.items.map((it) => ({
    producto_item: it.producto_item,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    causa_impuesto: it.causa_impuesto !== false,
  }));
  renderizarPartidas();
  cotizacionMostrarTotales.checked = c.mostrar_totales !== false;
  actualizarResumen();

  actualizarCamposVaciosCotizacion();
  activarSubtab('captura');
  abrirFormCotizacion();
  cotizacionNombre.focus();
  cotizacionNombre.select();
}

// ---------- Detalle de una cotizacion (clic en la fila) ----------

const modalOverlay = document.getElementById('modal-overlay');
const modalCaja = document.getElementById('modal-caja');
const modalContenido = document.getElementById('modal-contenido');
const modalCerrar = document.getElementById('modal-cerrar');

function campoFicha(etiqueta, valor) {
  return `<div><span>${escaparHtml(etiqueta)}</span><p>${valor !== null && valor !== undefined && valor !== '' ? escaparHtml(String(valor)) : '-'}</p></div>`;
}

// Campo dentro de una tarjeta del detalle de cotizacion (ver abrirDetalleCotizacion): mismo
// dato que campoFicha, con las clases del rediseno en dos columnas por tarjetas tematicas.
function campoCot(etiqueta, valor) {
  return `<div class="campo-cot"><span class="etiqueta-cot">${escaparHtml(etiqueta)}</span><p class="valor-cot">${valor !== null && valor !== undefined && valor !== '' ? escaparHtml(String(valor)) : '-'}</p></div>`;
}

// Estatus como chip de color (verde/rojo), reutilizando las clases estatus-vigente/estatus-vencido
// ya usadas en tablas (que solo dan color de texto) mas la clase pill-estatus (forma + fondo).
function pillEstatus(estatus) {
  const clase = estatus === 'Vencido' ? 'estatus-vencido' : 'estatus-vigente';
  return `<span class="pill-estatus ${clase}">${escaparHtml(estatus)}</span>`;
}

// La clausula de "reportar daño en 24 horas" se resalta en rojo/negrita/mas grande que el
// resto de Observaciones (mismo criterio que el PDF), sin importar en que renglon venga escrita.
const CLAUSULA_DANIO_24H = /mercanc[ií]a con da[ñn]o debe reportarse/i;

function observacionesConClausulaResaltada(texto) {
  return texto
    .split('\n')
    .map((linea) => (CLAUSULA_DANIO_24H.test(linea) ? `<span class="clausula-danio">${escaparHtml(linea)}</span>` : escaparHtml(linea)))
    .join('\n');
}

// ---- Notas de seguimiento de un Negocio (bitacora, sin limite, con fecha/hora) ----

function fechaHoraNota(creadoEn) {
  if (!creadoEn) return '';
  const [fecha, hora] = creadoEn.split(' ');
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y} ${(hora || '').slice(0, 5)}`;
}

async function abrirNotasNegocio(id, nombre) {
  const res = await fetch(`/api/negocios/${encodeURIComponent(id)}/notas`);
  const notas = res.ok ? await res.json() : [];

  modalContenido.innerHTML = `
    <div class="detalle-negocio">
      <p class="eyebrow-cot">Negocio</p>
      <h2>${escaparHtml(nombre)}</h2>
      <div class="tarjeta">
        <h3>Seguimiento (${notas.length})</h3>
        <div class="notas-lista" id="notas-lista">
          ${notas.length ? notas.map((n) => `
            <div class="nota-item">
              <span class="nota-fecha">${fechaHoraNota(n.creado_en)}</span>
              <p>${escaparHtml(n.nota)}</p>
            </div>
          `).join('') : '<p class="pista">Todavía no hay notas — registra aquí cada llamada, correo o teléfono que consigas.</p>'}
        </div>
        ${permisosCatalogos.editar ? `
          <form id="form-negocio-nota">
            <textarea id="negocio-nota-texto" rows="3" placeholder="Ej. Llamé al hotel, hablé con recepción, me dieron el correo de compras: compras@hotel.com. Prometí enviar cotización de pantallas la próxima semana..." autofocus></textarea>
            <div class="acciones-form">
              <button type="submit" class="btn-marca">Agregar nota</button>
            </div>
          </form>
        ` : ''}
      </div>
    </div>
  `;

  const form = document.getElementById('form-negocio-nota');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('negocio-nota-texto');
      const texto = input.value.trim();
      if (!texto) return;

      const res2 = await fetch(`/api/negocios/${encodeURIComponent(id)}/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota: texto }),
      });
      if (!res2.ok) {
        const error = await res2.json().catch(() => ({}));
        alert('Error: ' + (error.errores ? error.errores.join(', ') : res2.statusText));
        return;
      }
      abrirNotasNegocio(id, nombre);
    });
  }

  modalCaja.classList.remove('modal-caja-ancha');
  modalOverlay.hidden = false;
}

async function abrirDetalleCotizacion(id) {
  const res = await fetch(`/api/cotizaciones/${encodeURIComponent(id)}`);
  if (!res.ok) return;
  const c = await res.json();
  c.mostrarImpuesto = c.items.some((it) => it.causa_impuesto !== false);

  modalContenido.innerHTML = `
    <div class="detalle-cotizacion">
    <p class="eyebrow-cot">Cotización · ${escaparHtml(c.id_cotizacion)}</p>
    <h2>${escaparHtml(c.nombre)}</h2>
    ${pillEstatus(c.estatus)}

    <div class="barra-acciones-cot">
      <div class="grupo-acciones-cot">
        <button type="button" class="btn-marca btn-pdf-cotizacion" data-id="${escaparHtml(c.id_cotizacion)}">Ver cotización</button>
        <button type="button" class="btn-marca btn-descargar-pdf-cotizacion" data-id="${escaparHtml(c.id_cotizacion)}">Descargar PDF</button>
        ${permisosCatalogos.editar ? `<button type="button" class="btn-secundario btn-clonar-cotizacion" data-id="${escaparHtml(c.id_cotizacion)}">Clonar</button>` : ''}
        ${permisosCatalogos.editar ? `<button type="button" class="btn-secundario btn-editar-cotizacion" data-id="${escaparHtml(c.id_cotizacion)}">Editar</button>` : ''}
      </div>
      ${permisosCatalogos.editar && ['Pendiente', 'Negociacion'].includes(c.etapa) ? `
        <div class="separador-vertical-cot"></div>
        <div class="grupo-etapa-cot">
          <span class="etiqueta-etapa-cot">Etapa</span>
          <button type="button" class="btn-texto es-bueno btn-mostrar-marcar-ganada-cotizacion" data-id="${escaparHtml(c.id_cotizacion)}">Marcar como ganada</button>
          <button type="button" class="btn-texto es-malo btn-mostrar-marcar-perdida-cotizacion" data-id="${escaparHtml(c.id_cotizacion)}">Marcar como perdida</button>
        </div>
      ` : ''}
      ${permisosCatalogos.editar && c.etapa === 'Ganada' ? `
        <div class="separador-vertical-cot"></div>
        <div class="grupo-etapa-cot">
          <button type="button" class="btn-texto btn-mostrar-asociar-ordenes" data-id="${escaparHtml(c.id_cotizacion)}">Asociar órdenes</button>
        </div>
      ` : ''}
    </div>
    ${permisosCatalogos.editar && ['Pendiente', 'Negociacion'].includes(c.etapa) ? `
      <div id="panel-marcar-ganada" class="panel-form" hidden>
        <p class="pista">Órdenes de ${escaparHtml((c.destinos || []).map((d) => d.destino).join(', ') || 'este Hotel/Local')} con fecha igual o posterior a la cotización (${escaparHtml(c.fecha_creacion)}). Selecciona las que correspondan (opcional):</p>
        <div id="lista-ordenes-candidatas-ganada"></div>
        <div class="acciones-form">
          <button type="button" id="btn-confirmar-marcar-ganada" class="btn-mini">Confirmar como ganada</button>
          <button type="button" id="btn-cancelar-marcar-ganada" class="btn-mini">Cancelar</button>
        </div>
      </div>
    ` : ''}
    ${permisosCatalogos.editar && ['Pendiente', 'Negociacion'].includes(c.etapa) ? `
      <form id="form-marcar-perdida-cotizacion" class="panel-form" hidden>
        <label>
          Motivo (por qué no se ganó esta cotización)
          <select id="motivo-perdida-cotizacion-select">${htmlOpcionesMotivoPerdida()}</select>
        </label>
        <label>
          Comentarios (opcional)
          <textarea id="motivo-perdida-cotizacion" rows="2" placeholder="Detalles de por qué se perdió, con quién se habló, qué hubiera cambiado el resultado..."></textarea>
        </label>
        <div class="acciones-form">
          <button type="submit" class="btn-mini">Confirmar como perdida</button>
          <button type="button" id="btn-cancelar-marcar-perdida-cotizacion" class="btn-mini">Cancelar</button>
        </div>
      </form>
    ` : ''}
    ${permisosCatalogos.editar && c.etapa === 'Ganada' ? `
      <div id="panel-asociar-ordenes" class="panel-form" hidden>
        <p class="pista">Órdenes de ${escaparHtml((c.destinos || []).map((d) => d.destino).join(', ') || 'este Hotel/Local')} con fecha posterior a la cotización (${escaparHtml(c.fecha_creacion)}):</p>
        <div id="lista-ordenes-candidatas"></div>
        <div class="acciones-form">
          <button type="button" id="btn-guardar-asociar-ordenes" class="btn-mini">Guardar asociación</button>
          <button type="button" id="btn-cancelar-asociar-ordenes" class="btn-mini">Cancelar</button>
        </div>
      </div>
    ` : ''}
    <div class="detalle-cotizacion-grid">
      <div class="detalle-cotizacion-info">
        <div class="tarjeta">
          <h3>Resumen</h3>
          ${campoCot('Fecha de creación', c.fecha_creacion)}
          ${campoCot('Fecha de vencimiento', c.fecha_vencimiento)}
          ${c.etapa === 'Perdida' ? campoCot('Motivo de pérdida', c.motivo_perdida) : ''}
        </div>
        <div class="tarjeta">
          <h3>Cliente y destino</h3>
          ${campoCot('Negocio', c.negocio_nombre)}
          ${campoCot('Contacto', c.contacto_nombre)}
          ${campoCot('Hotel(es) / Local(es)', (c.destinos || []).map((d) => d.destino).join(', ') || c.destino_nombre)}
          ${campoCot('Representante de ventas', c.representante_nombre)}
          ${campoCot('Moneda', c.moneda)}
        </div>
        <div class="tarjeta">
          <h3>Condiciones</h3>
          ${campoCot('Método de pago', c.metodo_pago)}
          ${campoCot('Lugar de entrega', c.lugar_entrega)}
          ${campoCot('Tiempo de entrega', c.tiempo_entrega)}
          ${campoCot('Fecha de seguimiento', c.fecha_seguimiento)}
        </div>
        ${c.etapa === 'Ganada' ? `
        <div class="tarjeta">
          <h3>Órdenes asociadas (${c.ordenes.length})</h3>
          ${c.ordenes.length ? c.ordenes.map((o) => `
            <div class="campo-cot">
              <span class="etiqueta-cot">${escaparHtml(o.fecha)}</span>
              <p class="valor-cot"><a href="ordenes.html?orden=${encodeURIComponent(o.id)}">${escaparHtml(o.id)}</a> — ${escaparHtml(o.moneda || '')} ${formatoImporte(o.importe)}</p>
            </div>
          `).join('') : '<p class="pista">Sin órdenes asociadas todavía.</p>'}
        </div>
        ` : ''}
        ${c.observaciones ? `
        <div class="tarjeta">
          <h3>Observaciones</h3>
          <p class="observaciones-cotizacion">${observacionesConClausulaResaltada(c.observaciones)}</p>
        </div>
        ` : ''}
      </div>
      <div class="detalle-cotizacion-productos">
        <div class="tarjeta-productos-cot">
          <div class="tabla-scroll">
            <table>
              <thead><tr>
                <th>Producto</th><th class="num">Cantidad</th><th class="num">Precio unitario</th>
                ${c.mostrarImpuesto ? '<th class="num">Impuesto %</th><th class="num">Impuesto</th>' : ''}
                <th class="num">Total</th>
              </tr></thead>
              <tbody>
                ${c.items.map((it) => `
                  <tr>
                    <td>
                      <div class="item-codigo">${escaparHtml(it.producto_item)}</div>
                      ${it.producto_descripcion ? `<div class="item-desc">${escaparHtml(it.producto_descripcion)}</div>` : ''}
                    </td>
                    <td class="num">${formatoImporte(it.cantidad)}</td>
                    <td class="num">${formatoImporte(it.precio_unitario)}</td>
                    ${c.mostrarImpuesto ? `<td class="num">${it.impuesto_porcentaje}%</td><td class="num">${formatoImporte(it.impuesto_monto)}</td>` : ''}
                    <td class="num">${formatoImporte(it.total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${c.mostrar_totales === false ? '' : `
          <div class="ficha-detalle resumen-cotizacion">
            <div><span>Sub Total</span><p>${formatoImporte(c.subtotal)}</p></div>
            <div><span>${textoDescuento(c)}</span><p>${formatoImporte(c.descuento_monto)}</p></div>
            ${c.mostrarImpuesto ? `<div><span>IVA (16%)</span><p>${formatoImporte(c.iva)}</p></div>` : ''}
            <div><span>Gran Total</span><p>${formatoImporte(c.gran_total)}</p></div>
          </div>
          `}
        </div>
      </div>
    </div>
    </div>
  `;
  modalCaja.classList.add('modal-caja-ancha');

  const formPerdida = document.getElementById('form-marcar-perdida-cotizacion');
  if (formPerdida) {
    formPerdida.addEventListener('submit', async (e) => {
      e.preventDefault();
      const motivoSelect = document.getElementById('motivo-perdida-cotizacion-select').value;
      const comentarios = document.getElementById('motivo-perdida-cotizacion').value;
      await marcarEtapaCotizacion(c.id_cotizacion, 'Perdida', combinarMotivoPerdida(motivoSelect, comentarios));
    });
    document.getElementById('btn-cancelar-marcar-perdida-cotizacion').addEventListener('click', () => {
      formPerdida.hidden = true;
    });
  }

  const panelOrdenes = document.getElementById('panel-asociar-ordenes');
  if (panelOrdenes) {
    document.getElementById('btn-cancelar-asociar-ordenes').addEventListener('click', () => {
      panelOrdenes.hidden = true;
    });
    document.getElementById('btn-guardar-asociar-ordenes').addEventListener('click', async () => {
      const ordenIds = ordenesSeleccionadas('lista-ordenes-candidatas');
      const ok = await guardarOrdenesAsociadas(c.id_cotizacion, ordenIds);
      if (ok) abrirDetalleCotizacion(c.id_cotizacion);
    });
  }

  const panelMarcarGanada = document.getElementById('panel-marcar-ganada');
  if (panelMarcarGanada) {
    document.getElementById('btn-cancelar-marcar-ganada').addEventListener('click', () => {
      panelMarcarGanada.hidden = true;
    });
    document.getElementById('btn-confirmar-marcar-ganada').addEventListener('click', async () => {
      const ordenIds = ordenesSeleccionadas('lista-ordenes-candidatas-ganada');
      const ok = await guardarOrdenesAsociadas(c.id_cotizacion, ordenIds);
      if (!ok) return;
      marcarEtapaCotizacion(c.id_cotizacion, 'Ganada');
    });
  }

  modalOverlay.hidden = false;
}

// IDs de las ordenes marcadas en el checklist de un panel de asociacion (Marcar como ganada o
// Asociar ordenes: mismo formato de lista, distinto contenedor).
function ordenesSeleccionadas(contenedorId) {
  return [...document.querySelectorAll(`#${contenedorId} input[type="checkbox"]:checked`)].map((el) => el.value);
}

// Guarda la asociacion de ordenes de una cotizacion; muestra el error y regresa false si falla,
// para que quien llama decida si continua (ej. no marcar como ganada si esto fallo).
async function guardarOrdenesAsociadas(id, ordenIds) {
  const res = await fetch(`/api/cotizaciones/${encodeURIComponent(id)}/ordenes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orden_ids: ordenIds }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return false;
  }
  return true;
}

// Carga y muestra las ordenes candidatas (mismo Hotel/Local, fecha igual o posterior a la
// cotizacion) con un checkbox por orden, pre-marcadas las que ya estan asociadas a esta
// cotizacion. Un mismo checklist sirve tanto para "Asociar ordenes" (ya Ganada) como para
// "Marcar como ganada" (todavia en Negociacion, se asocia y se cierra en un solo paso).
async function cargarListaOrdenesCandidatas(id, contenedorId) {
  const lista = document.getElementById(contenedorId);
  lista.innerHTML = '<p class="pista">Cargando…</p>';
  const res = await fetch(`/api/cotizaciones/${encodeURIComponent(id)}/ordenes-candidatas`);
  const ordenes = res.ok ? await res.json() : [];
  lista.innerHTML = ordenes.length
    ? ordenes.map((o) => `
        <label class="opcion-orden-candidata">
          <input type="checkbox" value="${escaparHtml(o.id)}" ${o.cotizacion_id === id ? 'checked' : ''} />
          ${escaparHtml(o.fecha)} · ${escaparHtml(o.id)} — ${escaparHtml(o.moneda || '')} ${formatoImporte(o.importe)}
        </label>
      `).join('')
    : '<p class="pista">No hay órdenes de este Hotel/Local con fecha igual o posterior a la cotización.</p>';
}

async function abrirPanelAsociarOrdenes(id) {
  document.getElementById('panel-asociar-ordenes').hidden = false;
  await cargarListaOrdenesCandidatas(id, 'lista-ordenes-candidatas');
}

async function abrirPanelMarcarGanada(id) {
  document.getElementById('panel-marcar-ganada').hidden = false;
  await cargarListaOrdenesCandidatas(id, 'lista-ordenes-candidatas-ganada');
}

// Cambia la etapa de una cotizacion a Ganada o Perdida (desde el modal de detalle o desde el
// formulario de edicion) y refresca la vista que la llamo para reflejar el nuevo estatus; por
// default refresca el modal de detalle, pero el formulario de edicion pasa su propio refresco.
async function marcarEtapaCotizacion(id, etapa, motivoPerdida, alExito = () => abrirDetalleCotizacion(id)) {
  const res = await fetch(`/api/cotizaciones/${encodeURIComponent(id)}/etapa`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ etapa, motivo_perdida: motivoPerdida || '' }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return;
  }
  alExito();
  cargarCotizaciones();
}

function cerrarModal() {
  modalOverlay.hidden = true;
  modalContenido.innerHTML = '';
  modalCaja.classList.remove('modal-caja-ancha');
}

modalCerrar.addEventListener('click', cerrarModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) cerrarModal();
});
modalContenido.addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-pdf-cotizacion')) {
    generarPDFCotizacion(e.target.dataset.id);
    return;
  }
  if (e.target.classList.contains('btn-descargar-pdf-cotizacion')) {
    descargarPDFCotizacion(e.target.dataset.id);
    return;
  }
  if (e.target.classList.contains('btn-clonar-cotizacion')) {
    cerrarModal();
    clonarCotizacion(e.target.dataset.id);
    return;
  }
  if (e.target.classList.contains('btn-editar-cotizacion')) {
    cerrarModal();
    editarCotizacion(e.target.dataset.id);
    return;
  }
  if (e.target.classList.contains('btn-mostrar-marcar-ganada-cotizacion')) {
    abrirPanelMarcarGanada(e.target.dataset.id);
    return;
  }
  if (e.target.classList.contains('btn-mostrar-marcar-perdida-cotizacion')) {
    document.getElementById('form-marcar-perdida-cotizacion').hidden = false;
    document.getElementById('motivo-perdida-cotizacion-select').focus();
    return;
  }
  if (e.target.classList.contains('btn-mostrar-asociar-ordenes')) {
    abrirPanelAsociarOrdenes(e.target.dataset.id);
  }
});

tablaCotizaciones.addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  const fila = e.target.closest('tr');
  if (!fila) return;
  abrirDetalleCotizacion(fila.dataset.id);
});

// ---------- Alta rapida de Negocio (desde el formulario de Cotizacion) ----------

const btnNuevoNegocio = document.getElementById('btn-nuevo-negocio');
const modalRapidoOverlay = document.getElementById('modal-rapido-overlay');
const modalRapidoCerrar = document.getElementById('modal-rapido-cerrar');
const modalRapidoNombre = document.getElementById('modal-rapido-nombre');
const modalRapidoContacto = document.getElementById('modal-rapido-contacto');
const formRapidoNegocio = document.getElementById('form-rapido-negocio');

function abrirModalRapidoNegocio() {
  modalRapidoNombre.value = '';
  poblarSelect(modalRapidoContacto, contactosCache, 'id_contacto', 'nombre_completo_correo');
  modalRapidoContacto.value = cotizacionContacto.value || '';
  modalRapidoOverlay.hidden = false;
  modalRapidoNombre.focus();
}

function cerrarModalRapidoNegocio() {
  modalRapidoOverlay.hidden = true;
}

btnNuevoNegocio.addEventListener('click', abrirModalRapidoNegocio);
modalRapidoCerrar.addEventListener('click', cerrarModalRapidoNegocio);
modalRapidoOverlay.addEventListener('click', (e) => {
  if (e.target === modalRapidoOverlay) cerrarModalRapidoNegocio();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!modalRapidoOverlay.hidden) cerrarModalRapidoNegocio();
  else if (!modalRapidoContactoOverlay.hidden) cerrarModalRapidoContacto();
  else if (!modalRapidoDestinoOverlay.hidden) cerrarModalRapidoDestino();
  else if (!modalOverlay.hidden) cerrarModal();
});

// Etapa por default para negocios creados desde el alta rapida de Cotizaciones.
async function etapaCotizacionId() {
  const etapas = await fetch('/api/etapas-negocio').then((r) => r.json());
  const etapa = etapas.find((e) => e.etapa.toLowerCase() === 'negociacion');
  return etapa ? etapa.id_etapa : null;
}

formRapidoNegocio.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = modalRapidoNombre.value.trim();
  if (!nombre || !modalRapidoContacto.value) return;

  const res = await fetch('/api/negocios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      negocio: nombre,
      contacto_id: modalRapidoContacto.value,
      etapa_id: await etapaCotizacionId(),
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return;
  }

  const creado = await res.json();
  const opt = document.createElement('option');
  opt.value = creado.id_negocio;
  opt.textContent = creado.negocio;
  cotizacionNegocio.appendChild(opt);
  cotizacionNegocio.value = creado.id_negocio;
  cotizacionContacto.value = creado.contacto_id || '';

  cerrarModalRapidoNegocio();
  cargarNegocios();
});

// ---------- Alta rapida de Contacto (desde el formulario de Cotizacion) ----------

const btnNuevoContactoCotizacion = document.getElementById('btn-nuevo-contacto-cotizacion');
const modalRapidoContactoOverlay = document.getElementById('modal-rapido-contacto-overlay');
const modalRapidoContactoCerrar = document.getElementById('modal-rapido-contacto-cerrar');
const modalRapidoContactoNombre = document.getElementById('modal-rapido-contacto-nombre');
const modalRapidoContactoApellido = document.getElementById('modal-rapido-contacto-apellido');
const modalRapidoContactoCorreo = document.getElementById('modal-rapido-contacto-correo');
const modalRapidoContactoTelLocal = document.getElementById('modal-rapido-contacto-tel-local');
const modalRapidoContactoTelCelular = document.getElementById('modal-rapido-contacto-tel-celular');
const formRapidoContacto = document.getElementById('form-rapido-contacto');

function abrirModalRapidoContacto() {
  formRapidoContacto.reset();
  modalRapidoContactoOverlay.hidden = false;
  modalRapidoContactoNombre.focus();
}

function cerrarModalRapidoContacto() {
  modalRapidoContactoOverlay.hidden = true;
}

btnNuevoContactoCotizacion.addEventListener('click', abrirModalRapidoContacto);
modalRapidoContactoCerrar.addEventListener('click', cerrarModalRapidoContacto);
modalRapidoContactoOverlay.addEventListener('click', (e) => {
  if (e.target === modalRapidoContactoOverlay) cerrarModalRapidoContacto();
});

formRapidoContacto.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = modalRapidoContactoNombre.value.trim();
  if (!nombre) return;

  // Si ya hay Hotel(es)/Local(es) elegidos en la cotizacion, el contacto nuevo nace asociado a
  // todos ellos (misma asociacion que se administra desde Contactos o desde el Hotel/Local).
  const destinosElegidos = valoresSeleccionados(cotizacionDestino);
  const res = await fetch('/api/contactos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre,
      apellido: modalRapidoContactoApellido.value.trim(),
      correo_electronico: modalRapidoContactoCorreo.value.trim(),
      telefono_local: modalRapidoContactoTelLocal.value.trim(),
      telefono_celular: modalRapidoContactoTelCelular.value.trim(),
      destinos: destinosElegidos.map(Number),
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return;
  }

  const creado = await res.json();
  const seleccionPrevia = new Set(destinosElegidos);
  await poblarSelectsCotizacion();
  await poblarSelectsNegocio();
  cotizacionContacto.value = creado.id_contacto;
  marcarSeleccionMultiple(cotizacionDestino, seleccionPrevia);
  actualizarCampoVacio(cotizacionContacto);

  cerrarModalRapidoContacto();
});

// ---------- Alta rapida de Destino (desde el formulario de Cotizacion) ----------

const btnNuevoDestinoCotizacion = document.getElementById('btn-nuevo-destino-cotizacion');
const modalRapidoDestinoOverlay = document.getElementById('modal-rapido-destino-overlay');
const modalRapidoDestinoCerrar = document.getElementById('modal-rapido-destino-cerrar');
const modalRapidoDestinoNombre = document.getElementById('modal-rapido-destino-nombre');
const formRapidoDestino = document.getElementById('form-rapido-destino');

function abrirModalRapidoDestino() {
  formRapidoDestino.reset();
  modalRapidoDestinoOverlay.hidden = false;
  modalRapidoDestinoNombre.focus();
}

function cerrarModalRapidoDestino() {
  modalRapidoDestinoOverlay.hidden = true;
}

btnNuevoDestinoCotizacion.addEventListener('click', abrirModalRapidoDestino);
modalRapidoDestinoCerrar.addEventListener('click', cerrarModalRapidoDestino);
modalRapidoDestinoOverlay.addEventListener('click', (e) => {
  if (e.target === modalRapidoDestinoOverlay) cerrarModalRapidoDestino();
});

formRapidoDestino.addEventListener('submit', async (e) => {
  e.preventDefault();
  const destino = modalRapidoDestinoNombre.value.trim();
  if (!destino) return;

  const res = await fetch('/api/destinos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destino }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : (error.error || `Error ${res.status}`)));
    return;
  }

  const creado = await res.json();

  // Si ya hay un Contacto elegido en la cotizacion, el Hotel/Local nuevo nace asociado a el
  // (viceversa del alta rapida de Contacto: misma asociacion, mismo par contacto_destinos).
  if (cotizacionContacto.value) {
    await fetch(`/api/destinos/${creado.id_destino}/contactos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacto_id: cotizacionContacto.value }),
    }).catch(() => {});
  }

  const seleccionPrevia = new Set(valoresSeleccionados(cotizacionDestino));
  await poblarSelectsCotizacion();
  filtrarDestinosPorContacto();
  seleccionPrevia.add(String(creado.id_destino));
  marcarSeleccionMultiple(cotizacionDestino, seleccionPrevia);
  actualizarCampoVacio(cotizacionDestino);

  cerrarModalRapidoDestino();
});

// ---------- Generar PDF de la cotizacion ----------
// Los datos del vendedor/empresa son fijos (mismos en todas las cotizaciones, como el membrete
// del formato compartido). Si cambian, se ajustan aqui.
const EMISOR_COTIZACION = {
  nombre: 'Ramón Villanueva',
  puesto: 'Ventas',
  correo: 'rvillanueva@gonpal.com.mx',
  telefono: '+528183660778',
  empresa: 'Comercializadora Gonpal',
  direccion: ['Calle Tauro 205', 'Nueva Linda Vista', 'Guadalupe, N.L. 67110', 'México'],
};

const MESES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function fechaLarga(fechaISO) {
  if (!fechaISO) return '-';
  const [y, m, d] = fechaISO.split('-').map(Number);
  return `${d} de ${MESES_LARGO[m - 1]} de ${y}`;
}

function referenciaCotizacion(c) {
  const digitos = (c.creado_en || '').replace(/\D/g, '');
  return digitos ? `${digitos}000` : c.id_cotizacion;
}

function money(valor) {
  return '$' + formatoImporte(valor);
}

// Etiqueta del renglon de descuento, consistente en la tabla, el detalle y el PDF: como % se
// muestra "Descuento (X%)"; como importe fijo el numero ya lo dice todo, no hace falta el %.
function textoDescuento(c) {
  return c.descuento_tipo === 'monto' ? 'Descuento' : `Descuento (${c.descuento_porcentaje || 0}%)`;
}

function formatoCantidad(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero.toLocaleString('es-MX') : formatoImporte(numero);
}

function generarHtmlCotizacionPDF(c) {
  const mostrarImpuesto = c.items.some((it) => it.causa_impuesto !== false);
  const filasItems = c.items.map((it) => `
    <tr>
      <td>
        <div class="item-codigo">${escaparHtml(it.producto_item)}</div>
        <div class="item-desc">${escaparHtml(it.producto_descripcion || '')}</div>
      </td>
      <td class="num">${formatoCantidad(it.cantidad)}</td>
      <td class="num">${money(it.precio_unitario)}</td>
      ${mostrarImpuesto ? `<td class="num">${it.impuesto_porcentaje}%</td><td class="num">${money(it.impuesto_monto)}</td>` : ''}
      <td class="num">${money(it.total)}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>${escaparHtml(c.nombre)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2124; margin: 0; padding: 30px 40px 40px; font-size: 13px; }
  .logo { font-size: 1.3rem; font-weight: 800; color: #c0392b; letter-spacing: 1px; }
  .logo-caption { font-size: 0.72rem; color: #6b7280; margin: 2px 0 14px; }
  .encabezado { background: #fbf1ee; border: 1px solid #f0d9d2; padding: 22px 26px; border-radius: 8px; }
  .encabezado h1 { margin: 0 0 18px; font-size: 1.5rem; }
  .info-grid { display: flex; justify-content: space-between; gap: 24px; }
  .info-izq { max-width: 280px; }
  .info-izq div { margin-bottom: 3px; }
  .info-der { text-align: right; color: #6b7280; flex: 0 0 220px; }
  .info-der div { margin-bottom: 3px; }
  .caja { border: 1px solid #dcdcdc; border-radius: 8px; padding: 16px 20px; margin-top: 24px; }
  .caja p { margin: 4px 0; }
  .observaciones-texto { white-space: pre-line; }
  .clausula-danio { color: #c0392b; font-weight: 700; font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin-top: 26px; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  thead tr { background: #f4f4f5; }
  th { text-align: left; padding: 8px 4px; font-size: 0.72rem; color: #3f3f46; text-transform: uppercase; letter-spacing: 0.4px; }
  td { padding: 10px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .item-codigo { font-weight: 600; }
  .item-desc { color: #757575; font-size: 0.8rem; }
  .totales { width: 280px; margin-left: auto; margin-top: 10px; }
  .totales div { display: flex; justify-content: space-between; padding: 6px 4px; border-bottom: 1px solid #eee; color: #6b7280; }
  .totales div span:last-child { color: #1f2124; }
  .totales .gran-total { border-bottom: none; border-top: 2px solid #1f2124; margin-top: 4px; padding-top: 10px; align-items: baseline; }
  .totales .gran-total span:first-child { font-weight: 700; color: #1f2124; }
  .totales .gran-total span:last-child { font-weight: 700; font-size: 1.3rem; color: #c0392b; }
  .etiqueta { display: block; font-size: 0.78rem; font-weight: 700; color: #c0392b; text-transform: uppercase; letter-spacing: 0.5px; margin: 18px 0 8px; }
  .etiqueta:first-child { margin-top: 0; }
  .condiciones { margin-top: 34px; text-align: left; font-size: 0.78rem; color: #4b4b4b; }
  .consideraciones ol { margin: 0; padding-left: 1.2rem; }
  .consideraciones li { margin-bottom: 6px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e7e2df; }
  .footer p { margin: 0 0 10px; }
  .footer-pregunta { font-weight: 700; }
  .footer-firma { color: #6b7280; }
  .footer-firma strong { color: #1f2124; }
  @media print {
    body { padding: 0 30px 20px; }
    @page { size: letter; margin: 18mm 15mm; }
  }
</style>
</head>
<body>
  <div class="logo">GONPAL</div>
  <div class="logo-caption">${escaparHtml(EMISOR_COTIZACION.empresa)}</div>
  <div class="encabezado">
    <h1>${escaparHtml(c.nombre)}</h1>
    <div class="info-grid">
      <div class="info-izq">
        <div><strong>${escaparHtml(c.negocio_nombre || '')}</strong></div>
        <div>${escaparHtml((c.destinos || []).map((d) => d.destino).join(', ') || c.destino_nombre || '')}</div>
        <div>&nbsp;</div>
        <div><strong>${escaparHtml(c.contacto_nombre || '')}</strong></div>
        ${c.contacto_correo ? `<div>${escaparHtml(c.contacto_correo)}</div>` : ''}
      </div>
      <div class="info-der">
        <div>Referencia: ${escaparHtml(referenciaCotizacion(c))}</div>
        <div>Creación: ${fechaLarga(c.fecha_creacion)}</div>
        <div>Caducidad: ${fechaLarga(c.fecha_vencimiento)}</div>
        <div>Presupuesto por: ${escaparHtml(c.representante_nombre || EMISOR_COTIZACION.nombre)}</div>
        <div>${escaparHtml(c.representante_correo || EMISOR_COTIZACION.correo)}</div>
      </div>
    </div>
  </div>

  <div class="caja">
    <p><strong>Comentarios de ${escaparHtml(c.representante_nombre || EMISOR_COTIZACION.nombre)}</strong></p>
    <p>Cotización basada en: ${escaparHtml(c.moneda)}</p>
    ${c.metodo_pago ? `<p>Condiciones de pago: ${escaparHtml(c.metodo_pago)}</p>` : ''}
    ${c.lugar_entrega ? `<p>Lugar de envío: ${escaparHtml(c.lugar_entrega)}</p>` : ''}
    ${c.tiempo_entrega ? `<p>Tiempo de entrega: ${escaparHtml(c.tiempo_entrega)}</p>` : ''}
    ${c.observaciones ? `<p><strong>Observaciones:</strong></p><p class="observaciones-texto">${observacionesConClausulaResaltada(c.observaciones)}</p>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>Producto</th><th class="num">Cant.</th><th class="num">P. unitario</th>
        ${mostrarImpuesto ? '<th class="num">Impuesto %</th><th class="num">Impuesto</th>' : ''}
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${filasItems}</tbody>
  </table>

  ${c.mostrar_totales === false ? '' : `
  <div class="totales">
    <div><span>Subtotal</span><span>${money(c.subtotal)}</span></div>
    ${c.descuento_monto ? `<div><span>${textoDescuento(c)}</span><span>-${money(c.descuento_monto)}</span></div>` : ''}
    ${mostrarImpuesto ? `<div><span>IVA (16%)</span><span>${money(c.iva)}</span></div>` : ''}
    <div class="gran-total"><span>Total</span><span>${money(c.gran_total)}</span></div>
  </div>
  `}

  <div class="condiciones">
    <span class="etiqueta">Condiciones de compra</span>
    <strong>NOTA:</strong> Toda nuestra mercancía está asegurada en transporte; cualquier incidencia se debe
    reportar en las primeras 24 horas de la recepción para aplicar el seguro, ya que de lo
    contrario el transporte deja de hacerse responsable.
  </div>

  <div class="condiciones consideraciones">
    <span class="etiqueta">Consideraciones de la oferta</span>
    <ol>
      <li>Esta cotización se basa en las cantidades y modelos especificados por el cliente.</li>
      <li>Los precios están sujetos a cambio si se modifican las condiciones originales requeridas por el cliente.</li>
      <li>Los orden de compra debe coincidir y liquidarse en la moneda en que se ha cotizado. La factura se emitirá en la misma moneda.</li>
      <li>Envío: Si no se especifica cargo por flete, los precios incluyen envío a 1 solo punto en la República Mexicana. No incluye gastos no indicados en la cotización.</li>
    </ol>

    <span class="etiqueta">Punto importante</span>
    <ol>
      <li>Al momento de la entrega, el cliente debe verificar que los productos lleguen en condiciones óptimas. Una vez recibidos, serán responsabilidad del cliente. LA MERCANCÍA CON DAÑO DEBE REPORTARSE EN LAS PRIMERAS 24 HORAS DE LA RECEPCIÓN</li>
      <li>La información sobre las características de los productos a adquirir corresponde única y exclusivamente al cliente.</li>
      <li>Los modelos ofertados pueden ser sustituidos sin previo aviso por modelos de características idénticas o superiores.</li>
      <li>Las garantías para las pantallas LED ofertadas tienen una duración de 3 años, conforme al certificado de garantía incluido en el empaque del producto. La garantía de los productos varía según el modelo y marca.</li>
      <li>Los detalles de la garantía y su funcionamiento se encuentran en el certificado de garantía incluido en el empaque del producto.</li>
      <li>La garantía es limitada y no incluye condiciones especiales de servicio (como montaje, instalación y otros). Es importante verificar la mercancía al recibirla, ya que productos dañados o no son haberse reclamado antes no entran en garantía.</li>
      <li>Comercializadora Gonpal se deslinda de cualquier daño o perjuicio que el cliente pudiera tener derivado del uso inadecuado de los equipos cotizados/adquiridos.</li>
      <li>Una vez generada la orden de compra, esta no podrá ser cancelada ni modificada.</li>
    </ol>
  </div>

  <div class="footer">
    <p class="footer-pregunta">¿Tienes alguna pregunta? Ponte en contacto conmigo</p>
    <p class="footer-firma">
      ${lineasFirma(c).map((linea, i) => (i === 0 ? `<strong>${escaparHtml(linea)}</strong>` : escaparHtml(linea))).join('<br />')}
    </p>
  </div>
</body>
</html>`;
}

// La firma del representante seleccionado (texto libre, capturada en su catalogo) reemplaza el
// bloque fijo de Ramon Villanueva/Gonpal cuando esta capturada; si no, se usa ese bloque como
// respaldo para no dejar el pie de la cotizacion en blanco.
function lineasFirma(c) {
  if ((c.representante_firma || '').trim()) {
    return c.representante_firma.split('\n').map((l) => l.trim()).filter(Boolean);
  }
  return [EMISOR_COTIZACION.nombre, EMISOR_COTIZACION.puesto, EMISOR_COTIZACION.correo, EMISOR_COTIZACION.telefono, EMISOR_COTIZACION.empresa, ...EMISOR_COTIZACION.direccion];
}

async function generarPDFCotizacion(id) {
  const res = await fetch(`/api/cotizaciones/${encodeURIComponent(id)}`);
  if (!res.ok) return;
  const c = await res.json();

  const blob = new Blob([generarHtmlCotizacionPDF(c)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const ventana = window.open(url, '_blank');
  if (!ventana) {
    alert('Tu navegador bloqueó la ventana emergente. Permítela para ver la cotización.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Descarga directa del PDF (generado en el servidor), sin pasar por vista previa/imprimir.
function descargarPDFCotizacion(id) {
  window.location.href = `/api/cotizaciones/${encodeURIComponent(id)}/pdf?descargar=1`;
}

promesaAuth.then(async (sesion) => {
  if (!sesion) return;
  permisosCatalogos = sesion.permisos.catalogos;
  btnMostrarFormNegocio.hidden = !permisosCatalogos.editar;
  btnMostrarFormCotizacion.hidden = !permisosCatalogos.editar;
  btnNuevaCotizacionVisualizacion.hidden = !permisosCatalogos.editar;

  poblarSelectsNegocio().then(cargarNegocios);
  poblarSelectsCotizacion().then(() => {
    cargarCotizaciones();
    restaurarCotizacionPendienteProducto();
  });
  cargarSolicitudesProveedorGlobal();
  cargarProveedoresCotizacion();

  const parametros = new URLSearchParams(window.location.search);

  // Enlaces directos a una pestana (ej. desde la barra lateral): ?tab=negocios,
  // ?tab=visualizacion o ?tab=solicitudes-proveedor. "captura" tiene su propio manejo mas abajo
  // porque ademas precarga datos.
  const tabDirecto = parametros.get('tab');
  if (['negocios', 'visualizacion', 'solicitudes-proveedor'].includes(tabDirecto)) activarSubtab(tabDirecto);

  // Se llego desde una Tarea con actividad "Cotizacion": abre directo la captura de una
  // cotizacion nueva y recuerda la tarea para borrarla cuando se guarde.
  const pendienteId = parametros.get('pendiente');
  if (pendienteId) {
    pendienteOrigenId = pendienteId;
    activarSubtab('captura');
    limpiarFormCotizacion();
    abrirFormCotizacion();
  }

  // Se llego desde el Calendario en Inicio: abre directo el detalle de esa cotizacion.
  const cotizacionId = parametros.get('cotizacion');
  if (cotizacionId) {
    activarSubtab('visualizacion');
    abrirDetalleCotizacion(cotizacionId);
  }

  // Se llego desde el detalle de un Contacto o Hotel/Local ("+ Agregar cotizacion"): abre la
  // Captura con negocio/contacto/destino pre-llenados cuando se conocen.
  if (parametros.get('tab') === 'captura') {
    const negocioIdUrl = parametros.get('negocio_id');
    const contactoIdUrl = parametros.get('contacto_id');
    const destinoIdUrl = parametros.get('destino_id');
    await Promise.all([poblarSelectsNegocio(), poblarSelectsCotizacion()]);
    activarSubtab('captura');
    limpiarFormCotizacion();
    abrirFormCotizacion();
    if (negocioIdUrl) {
      cotizacionNegocio.value = negocioIdUrl;
      replicarContactoYDestinoDeNegocio(negocioIdUrl);
    } else if (contactoIdUrl) {
      cotizacionContacto.value = contactoIdUrl;
      filtrarDestinosPorContacto();
    }
    if (destinoIdUrl) {
      const opt = [...cotizacionDestino.options].find((o) => o.value === String(destinoIdUrl));
      if (opt) opt.selected = true;
    }
  }

  suscribirTiempoReal(['negocios'], () => { poblarSelectsNegocio(); cargarNegocios(); });
  suscribirTiempoReal(['cotizaciones', 'cotizacion_items'], cargarCotizaciones);
  suscribirTiempoReal(['contactos', 'destinos', 'productos', 'representantes'], poblarSelectsCotizacion);
  suscribirTiempoReal(['etapas_negocio'], poblarSelectsNegocio);
  suscribirTiempoReal(['solicitudes_proveedor', 'solicitud_proveedor_items'], cargarSolicitudesProveedorGlobal);
});
