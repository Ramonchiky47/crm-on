const form = document.getElementById('form-orden');
const inputIdOriginal = document.getElementById('orden-id-original');
const campos = {
  id: document.getElementById('id'),
  fecha: document.getElementById('fecha'),
  nombre: document.getElementById('nombre'),
  numero_oc: document.getElementById('numero_oc'),
  estatus_id: document.getElementById('estatus_id'),
  moneda: document.getElementById('moneda'),
  importe_moneda_extranjera: document.getElementById('importe_moneda_extranjera'),
  importe: document.getElementById('importe'),
  estado_entrega_id: document.getElementById('estado_entrega_id'),
  destino_id: document.getElementById('destino_id'),
  contacto_id: document.getElementById('contacto_id'),
  nota: document.getElementById('nota'),
  observaciones: document.getElementById('observaciones'),
};
const btnGuardar = document.getElementById('btn-guardar');
const btnCancelar = document.getElementById('btn-cancelar');
const btnMostrarForm = document.getElementById('btn-mostrar-form');
const modalOrdenOverlay = document.getElementById('modal-orden-overlay');
const modalOrdenCerrar = document.getElementById('modal-orden-cerrar');
const tituloFormOrden = document.getElementById('titulo-form-orden');
const tabla = document.getElementById('tabla-ordenes');
const estadoVacio = document.getElementById('estado-vacio');
const buscar = document.getElementById('buscar');
const filtroEstatusBtn = document.getElementById('filtro-estatus-btn');
const filtroEstatusPanel = document.getElementById('filtro-estatus-panel');
const estatusSeleccionados = new Set();
const filtroAnio = document.getElementById('filtro-anio');
const checkTodosOrdenes = document.getElementById('check-todos-ordenes');
const btnEnviarTareasOrdenes = document.getElementById('btn-enviar-tareas-ordenes');
const ordenesSeleccionadas = new Set();

function actualizarBotonEnviarTareasOrdenes() {
  btnEnviarTareasOrdenes.textContent = `Enviar a tareas (${ordenesSeleccionadas.size})`;
  btnEnviarTareasOrdenes.disabled = ordenesSeleccionadas.size === 0;
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- Modal de detalle (misma ficha que en Buscar) ----------

const modalOverlay = document.getElementById('modal-overlay');
const modalCaja = document.getElementById('modal-caja');
const modalContenido = document.getElementById('modal-contenido');
const modalCerrar = document.getElementById('modal-cerrar');

function campoFicha(etiqueta, valor) {
  return `<div><span>${escaparHtml(etiqueta)}</span><p>${valor !== null && valor !== undefined && valor !== '' ? escaparHtml(String(valor)) : '-'}</p></div>`;
}

// Campo dentro de una tarjeta del detalle de orden (mismo patron que cotizaciones.js: campoCot).
function campoOrden(etiqueta, valor, { vacioTexto = 'Sin capturar' } = {}) {
  const tieneValor = valor !== null && valor !== undefined && valor !== '';
  return `<div class="campo-cot">
    <span class="etiqueta-cot">${escaparHtml(etiqueta)}</span>
    <p class="valor-cot${tieneValor ? '' : ' valor-vacio-cot'}">${tieneValor ? escaparHtml(String(valor)) : vacioTexto}</p>
  </div>`;
}

// Chip de estatus: verde para Facturada, rojo para Cancelado (mismo criterio que ya usan las
// filas de la tabla), gris neutro para cualquier otro estatus capturado libremente.
function pillEstatusOrden(nombre) {
  if (!nombre) return '';
  let clase = 'pill-neutro';
  if (nombre === '2.-Facturada') clase = 'estatus-vigente';
  else if (nombre === 'Cancelado') clase = 'estatus-vencido';
  return `<span class="pill-estatus ${clase}">${escaparHtml(nombre)}</span>`;
}

async function abrirDetalle(id) {
  const [orden, articulos] = await Promise.all([
    fetch(`/api/ordenes/${encodeURIComponent(id)}`).then((r) => r.json()),
    fetch(`/api/detalle-compra?id=${encodeURIComponent(id)}`).then((r) => r.json()),
  ]);

  modalContenido.innerHTML = `
    <div class="detalle-orden">
    <p class="eyebrow-cot">Orden de venta</p>
    <h2>${escaparHtml(orden.id)}</h2>
    ${pillEstatusOrden(orden.estatus_nombre)}

    <div class="barra-acciones-cot">
      <div class="grupo-acciones-cot">
        ${permisosOrdenes.editar ? `<button type="button" class="btn-marca btn-editar-orden-modal" data-id="${escaparHtml(orden.id)}">Editar</button>` : ''}
      </div>
    </div>

    <div class="detalle-cotizacion-grid">
      <div class="detalle-cotizacion-info">
        <div class="tarjeta">
          <h3>Resumen</h3>
          ${campoOrden('Fecha', orden.fecha)}
          ${campoOrden('Número de OC / cheque', orden.numero_oc)}
          ${campoOrden('Número de seguimiento', orden.numero_seguimiento)}
          ${campoOrden('Estatus del sistema', orden.estatus_sistema)}
          ${campoOrden('Imprimir', orden.imprimir)}
        </div>
        <div class="tarjeta">
          <h3>Cliente y destino</h3>
          ${campoOrden('Nombre', orden.nombre)}
          ${campoOrden('Hotel / Local', orden.destino_nombre, { vacioTexto: 'Sin asignar' })}
          ${campoOrden('Contacto', orden.contacto_nombre, { vacioTexto: 'Sin asignar' })}
          ${campoOrden('Estado de la República', orden.estado_entrega_nombre, { vacioTexto: 'Sin asignar' })}
        </div>
        <div class="tarjeta">
          <h3>Importes</h3>
          ${campoOrden('Moneda', orden.moneda)}
          ${campoOrden('Importe (moneda extranjera)', orden.importe_moneda_extranjera !== null ? formatoImporte(orden.importe_moneda_extranjera) : null)}
          ${campoOrden('Importe', orden.importe !== null ? formatoImporte(orden.importe) : null)}
        </div>
        ${orden.cotizacion_id ? `
        <div class="tarjeta">
          <h3>Cotización</h3>
          <div class="campo-cot">
            <span class="etiqueta-cot">Generada a partir de</span>
            <p class="valor-cot"><a href="cotizaciones.html?cotizacion=${encodeURIComponent(orden.cotizacion_id)}">${escaparHtml(orden.cotizacion_id)}</a>${orden.cotizacion_nombre ? ` — ${escaparHtml(orden.cotizacion_nombre)}` : ''}</p>
          </div>
        </div>
        ` : (permisosOrdenes.editar && orden.destino_id ? `
        <div class="tarjeta">
          <h3>Cotización</h3>
          <p class="pista">Esta orden no está asociada a ninguna cotización.</p>
          <button type="button" id="btn-mostrar-asociar-cotizacion" class="btn-mini">Asociar a cotización</button>
          <div id="panel-asociar-cotizacion-orden" class="panel-form" hidden>
            <p class="pista">Cotizaciones vigentes de ${escaparHtml(orden.destino_nombre || 'este Hotel/Local')}. Selecciona una para asociarla y marcarla como ganada:</p>
            <div id="lista-cotizaciones-candidatas"></div>
            <div class="acciones-form">
              <button type="button" id="btn-confirmar-asociar-cotizacion" class="btn-mini">Asociar y marcar como ganada</button>
              <button type="button" id="btn-cancelar-asociar-cotizacion" class="btn-mini">Cancelar</button>
            </div>
          </div>
        </div>
        ` : '')}
        ${orden.nota ? `
        <div class="tarjeta">
          <h3>Nota</h3>
          <p class="observaciones-cotizacion">${escaparHtml(orden.nota)}</p>
        </div>
        ` : ''}
        ${orden.observaciones ? `
        <div class="tarjeta">
          <h3>Observaciones</h3>
          <p class="observaciones-cotizacion">${escaparHtml(orden.observaciones)}</p>
        </div>
        ` : ''}
      </div>
      <div class="detalle-cotizacion-productos">
        <div class="tarjeta-productos-cot">
          <div class="tarjeta-articulos-encabezado">
            <h3>Artículos</h3>
            <span>${articulos.length} artículo${articulos.length === 1 ? '' : 's'}</span>
          </div>
          ${articulos.length ? `
            <div class="tabla-scroll">
              <table>
                <thead><tr>
                  <th>Artículo</th><th>Tipo</th><th>Fecha</th><th>Serie</th>
                  <th class="num">Cantidad</th><th class="num">Importe</th>
                </tr></thead>
                <tbody>
                  ${articulos.map((a) => `
                    <tr>
                      <td>${escaparHtml(a.articulo || '')}</td>
                      <td>${escaparHtml(a.tipo || '')}</td>
                      <td>${escaparHtml(a.fecha || '')}</td>
                      <td>${escaparHtml(a.numero_serie || '')}</td>
                      <td class="num">${a.cantidad_vendida ?? ''}</td>
                      <td class="num">${formatoImporte(a.importe)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p class="vacio-articulos-orden">Esta orden no tiene artículos capturados en Detalle de compra.</p>'}
        </div>
      </div>
    </div>
    </div>
  `;

  modalCaja.classList.add('modal-caja-ancha');
  modalOverlay.hidden = false;

  const btnMostrarAsociarCotizacion = document.getElementById('btn-mostrar-asociar-cotizacion');
  if (btnMostrarAsociarCotizacion) {
    btnMostrarAsociarCotizacion.addEventListener('click', async () => {
      document.getElementById('panel-asociar-cotizacion-orden').hidden = false;
      await cargarListaCotizacionesCandidatas(orden.id);
    });
    document.getElementById('btn-cancelar-asociar-cotizacion').addEventListener('click', () => {
      document.getElementById('panel-asociar-cotizacion-orden').hidden = true;
    });
    document.getElementById('btn-confirmar-asociar-cotizacion').addEventListener('click', async () => {
      const seleccionada = document.querySelector('#lista-cotizaciones-candidatas input[type="radio"]:checked');
      if (!seleccionada) return;
      const ok = await guardarAsociarCotizacion(orden.id, seleccionada.value);
      if (ok) abrirDetalle(orden.id);
    });
  }
}

// Cotizaciones vigentes del mismo Hotel/Local que la orden, candidatas para asociar en el sentido
// inverso a "Marcar como ganada" en Cotizaciones (aqui se parte de una orden real y se cierra la
// cotizacion correspondiente).
async function cargarListaCotizacionesCandidatas(ordenId) {
  const lista = document.getElementById('lista-cotizaciones-candidatas');
  lista.innerHTML = '<p class="pista">Cargando…</p>';
  const res = await fetch(`/api/ordenes/${encodeURIComponent(ordenId)}/cotizaciones-candidatas`);
  const cotizaciones = res.ok ? await res.json() : [];
  lista.innerHTML = cotizaciones.length
    ? cotizaciones.map((c) => `
        <label class="opcion-orden-candidata">
          <input type="radio" name="cotizacion-candidata" value="${escaparHtml(c.id_cotizacion)}" />
          ${escaparHtml(c.fecha_creacion)} · ${escaparHtml(c.id_cotizacion)} — ${escaparHtml(c.nombre)} (${escaparHtml(c.moneda || '')} ${formatoImporte(c.gran_total)})
        </label>
      `).join('')
    : '<p class="pista">No hay cotizaciones vigentes de este Hotel/Local.</p>';
}

async function guardarAsociarCotizacion(ordenId, cotizacionId) {
  const res = await fetch(`/api/ordenes/${encodeURIComponent(ordenId)}/asociar-cotizacion`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cotizacion_id: cotizacionId }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return false;
  }
  return true;
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

modalContenido.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('btn-editar-orden-modal')) return;
  const id = e.target.dataset.id;
  const res = await fetch(`/api/ordenes/${encodeURIComponent(id)}`);
  const o = await res.json();
  cerrarModal();
  cargarOrdenEnFormulario(o);
});

// ---------- Alta rapida de Destino/Contacto (cuando no existen en el desplegable) ----------

const modalRapidoOverlay = document.getElementById('modal-rapido-overlay');
const modalRapidoCerrar = document.getElementById('modal-rapido-cerrar');
const modalRapidoTitulo = document.getElementById('modal-rapido-titulo');
const modalRapidoEtiqueta = document.getElementById('modal-rapido-etiqueta');
const modalRapidoNombre = document.getElementById('modal-rapido-nombre');
const formRapido = document.getElementById('form-rapido');
const btnNuevoDestino = document.getElementById('btn-nuevo-destino');
const btnNuevoContacto = document.getElementById('btn-nuevo-contacto');

let tipoModalRapido = null;

function abrirModalRapido(tipo) {
  tipoModalRapido = tipo;
  modalRapidoTitulo.textContent = tipo === 'destino' ? 'Nuevo hotel/local' : 'Nuevo contacto';
  modalRapidoEtiqueta.textContent = tipo === 'destino' ? 'Nombre del hotel/local' : 'Nombre del contacto';
  modalRapidoNombre.value = '';
  modalRapidoOverlay.hidden = false;
  modalRapidoNombre.focus();
}

function cerrarModalRapido() {
  modalRapidoOverlay.hidden = true;
  tipoModalRapido = null;
}

btnNuevoDestino.addEventListener('click', () => abrirModalRapido('destino'));
btnNuevoContacto.addEventListener('click', () => abrirModalRapido('contacto'));
modalRapidoCerrar.addEventListener('click', cerrarModalRapido);
modalRapidoOverlay.addEventListener('click', (e) => {
  if (e.target === modalRapidoOverlay) cerrarModalRapido();
});

formRapido.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = modalRapidoNombre.value.trim();
  if (!nombre) return;

  const endpoint = tipoModalRapido === 'destino' ? '/api/destinos' : '/api/contactos';
  const payload = tipoModalRapido === 'destino' ? { destino: nombre } : { nombre };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }

  const creado = await res.json();
  const select = tipoModalRapido === 'destino' ? campos.destino_id : campos.contacto_id;
  const opt = document.createElement('option');
  opt.value = tipoModalRapido === 'destino' ? creado.id_destino : creado.id_contacto;
  opt.textContent = tipoModalRapido === 'destino' ? creado.destino : creado.nombre;
  select.appendChild(opt);
  select.value = opt.value;

  cerrarModalRapido();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!modalOverlay.hidden) cerrarModal();
  if (!modalRapidoOverlay.hidden) cerrarModalRapido();
});

let ultimaListaOrdenes = [];
const orden = { campo: 'fecha', direccion: 'desc' };

function comparar(va, vb) {
  if (va === null || va === undefined) va = '';
  if (vb === null || vb === undefined) vb = '';
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  return String(va).localeCompare(String(vb), 'es', { numeric: true });
}

function ordenarYRenderizar() {
  const lista = [...ultimaListaOrdenes].sort((a, b) => {
    const cmp = comparar(a[orden.campo], b[orden.campo]);
    return orden.direccion === 'asc' ? cmp : -cmp;
  });
  renderizar(lista);
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

function poblarSelect(select, lista, campoValor, campoTexto) {
  for (const item of lista) {
    const opt = document.createElement('option');
    opt.value = item[campoValor];
    opt.textContent = item[campoTexto];
    select.appendChild(opt);
  }
}

// ---------- Filtro cruzado Contacto <-> Hotel/Local ----------
// Al elegir un Contacto, el select de Hotel/Local se reduce a los que tiene asociados (tabla
// contacto_destinos, la misma que alimenta "Contactos asociados" en Catalogos), y viceversa. Si
// el contacto/destino elegido no tiene NINGUNA asociacion capturada todavia, el otro select
// queda vacio a proposito (no se cae al catalogo completo): eso fuerza a asociarlo antes de
// seguir, en vez de dejar capturar cualquier combinacion sin relacion. Para resolverlo sin salir
// de la pantalla, aparece una pista con un boton que abre un mini-modal para asociar uno
// existente (ver abrirModalAsociar). El valor ya seleccionado en el otro campo se limpia si deja
// de ser valido tras filtrar, para que el bloqueo/filtro siempre sea visible.
let listaDestinos = [];
let listaContactos = [];
let destinosPorContacto = new Map();
let contactosPorDestino = new Map();

// La lista de Contactos ya trae, por cada uno, sus Hoteles/Locales asociados (campo
// `destinos`, mismo dato que alimenta "Contactos asociados" en Catalogos) — de ahi se derivan
// los dos mapas, sin pedir nada extra al servidor.
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

  select.innerHTML = '<option value="">-- Selecciona --</option>';
  poblarSelect(select, opciones, campoValor, campoTexto);
  select.value = opciones.some((o) => String(o[campoValor]) === valorActual) ? valorActual : '';
}

function filtrarDestinosPorContacto() {
  const cid = campos.contacto_id.value;
  filtrarSelectAsociado(campos.destino_id, listaDestinos, 'id_destino', 'destino',
    cid ? (destinosPorContacto.get(cid) || new Set()) : null);
  actualizarPistaAsociar();
}

function filtrarContactosPorDestino() {
  const did = campos.destino_id.value;
  filtrarSelectAsociado(campos.contacto_id, listaContactos, 'id_contacto', 'nombre_completo',
    did ? (contactosPorDestino.get(did) || new Set()) : null);
  actualizarPistaAsociar();
}

// Muestra, cuando corresponde, la pista con el boton para asociar un Hotel/Local o Contacto
// existente al que ya se eligio del otro lado (el select quedo vacio por el filtro cruzado).
const pistaAsociar = document.getElementById('pista-asociar-contacto-destino');

function actualizarPistaAsociar() {
  const contactoId = campos.contacto_id.value;
  const destinoId = campos.destino_id.value;
  const destinoBloqueado = contactoId && campos.destino_id.options.length <= 1;
  const contactoBloqueado = destinoId && campos.contacto_id.options.length <= 1;

  if (destinoBloqueado) {
    const nombre = campos.contacto_id.options[campos.contacto_id.selectedIndex]?.textContent || 'Este contacto';
    pistaAsociar.innerHTML = `${escaparHtml(nombre)} no tiene Hotel/Local asociado. <button type="button" id="btn-asociar-existente" class="btn-mini">Asociar uno existente</button>`;
    pistaAsociar.dataset.modo = 'destino';
    pistaAsociar.hidden = false;
  } else if (contactoBloqueado) {
    const nombre = campos.destino_id.options[campos.destino_id.selectedIndex]?.textContent || 'Este Hotel/Local';
    pistaAsociar.innerHTML = `${escaparHtml(nombre)} no tiene Contacto asociado. <button type="button" id="btn-asociar-existente" class="btn-mini">Asociar uno existente</button>`;
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
    poblarSelect(modalAsociarSelect, listaDestinos, 'id_destino', 'destino');
  } else {
    modalAsociarTitulo.textContent = 'Asociar Contacto existente';
    modalAsociarEtiqueta.textContent = 'Contacto';
    poblarSelect(modalAsociarSelect, listaContactos, 'id_contacto', 'nombre_completo');
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
  listaContactos = contactos;
  indexarContactoDestinos(contactos);
}

formAsociar.addEventListener('submit', async (e) => {
  e.preventDefault();
  const elegidoId = modalAsociarSelect.value;
  if (!elegidoId) return;

  const destinoId = modoAsociar === 'destino' ? elegidoId : campos.destino_id.value;
  const contactoId = modoAsociar === 'contacto' ? elegidoId : campos.contacto_id.value;

  const res = await fetch(`/api/destinos/${encodeURIComponent(destinoId)}/contactos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contacto_id: contactoId }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }

  await refrescarAsociaciones();
  if (modoAsociar === 'destino') {
    filtrarDestinosPorContacto();
    campos.destino_id.value = elegidoId;
  } else {
    filtrarContactosPorDestino();
    campos.contacto_id.value = elegidoId;
  }
  actualizarPistaAsociar();
  cerrarModalAsociar();
});

campos.contacto_id.addEventListener('change', filtrarDestinosPorContacto);
campos.destino_id.addEventListener('change', filtrarContactosPorDestino);

async function cargarCatalogos() {
  const [destinos, contactos, estatusLista, estadosEntrega] = await Promise.all([
    fetch('/api/destinos').then((r) => r.json()),
    fetch('/api/contactos').then((r) => r.json()),
    fetch('/api/estatus').then((r) => r.json()),
    fetch('/api/estados-entrega').then((r) => r.json()),
  ]);

  listaDestinos = destinos;
  listaContactos = contactos;
  indexarContactoDestinos(contactos);

  poblarSelect(campos.destino_id, destinos, 'id_destino', 'destino');
  poblarSelect(campos.contacto_id, contactos, 'id_contacto', 'nombre_completo');
  poblarSelect(campos.estatus_id, estatusLista, 'id_estatus', 'estatus');
  poblarSelect(campos.estado_entrega_id, estadosEntrega, 'id_estado_entrega', 'estado_entrega');
}

async function cargarFiltroEstatus() {
  const res = await fetch('/api/estatus');
  const lista = (await res.json()).filter((e) => e.estatus);

  if (!lista.length) {
    filtroEstatusPanel.innerHTML = '<p class="pista">No hay estatus capturados.</p>';
    return;
  }

  filtroEstatusPanel.innerHTML = `
    <label class="multi-select-opcion multi-select-todos">
      <input type="checkbox" id="filtro-estatus-todos" /><span class="multi-select-texto">Seleccionar todos</span>
    </label>
  ` + lista.map((e) => `
    <label class="multi-select-opcion">
      <input type="checkbox" value="${e.id_estatus}" /><span class="multi-select-texto">${escaparHtml(e.estatus)}</span>
    </label>
  `).join('');
}

// Filtro de Año: por default solo se ve el año en curso (la mayoria de las consultas del dia a
// dia son sobre ordenes recientes); los años anteriores con datos quedan disponibles en el
// desplegable para quien los necesite.
async function cargarFiltroAnio() {
  const res = await fetch('/api/ordenes/anios');
  const anios = await res.json();
  const anioActual = String(new Date().getFullYear());
  if (!anios.includes(anioActual)) anios.unshift(anioActual);

  filtroAnio.innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join('');
  filtroAnio.value = anioActual;
}

filtroAnio.addEventListener('change', cargarOrdenes);

function actualizarBotonFiltroEstatus() {
  filtroEstatusBtn.textContent = estatusSeleccionados.size
    ? `${estatusSeleccionados.size} estatus seleccionado(s)`
    : 'Todos los estatus';
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
  cargarOrdenes();
});

document.addEventListener('click', (e) => {
  if (!document.getElementById('filtro-estatus-wrap').contains(e.target)) {
    filtroEstatusPanel.hidden = true;
  }
});

async function cargarOrdenes() {
  const parametros = new URLSearchParams();
  const q = buscar.value.trim();
  if (q) parametros.set('q', q);
  if (estatusSeleccionados.size) parametros.set('estatus', [...estatusSeleccionados].join(','));
  if (filtroAnio.value) parametros.set('anio', filtroAnio.value);

  const url = parametros.toString() ? `/api/ordenes?${parametros}` : '/api/ordenes';
  const res = await fetch(url);
  ultimaListaOrdenes = await res.json();
  ordenarYRenderizar();
}

let permisosOrdenes = { ver: true, editar: true, borrar: true };

function renderizar(ordenes) {
  tabla.innerHTML = '';
  estadoVacio.hidden = ordenes.length !== 0;

  for (const o of ordenes) {
    const tr = document.createElement('tr');
    tr.dataset.id = o.id;
    if (o.estatus_nombre === '2.-Facturada') tr.classList.add('fila-facturada');
    else if (o.estatus_nombre === 'Cancelado') tr.classList.add('fila-cancelado');
    if (o.tiene_tarea_activa) tr.classList.add('fila-en-tareas');
    tr.innerHTML = `
      <td><input type="checkbox" class="check-orden" value="${escaparHtml(o.id)}" ${ordenesSeleccionadas.has(o.id) ? 'checked' : ''} /></td>
      <td>${escaparHtml(o.id)}</td>
      <td>${escaparHtml(o.fecha || '')}</td>
      <td>${escaparHtml(o.estatus_nombre || '')}</td>
      <td>${formatoImporte(o.importe)}</td>
      <td>${escaparHtml(o.destino_nombre || '')}</td>
      <td>${escaparHtml(o.contacto_nombre || '')}</td>
      <td>${escaparHtml(o.estado_entrega_nombre || '')}</td>
      <td class="acciones">
        ${permisosOrdenes.borrar ? `<button class="btn-borrar btn-icono" data-id="${escaparHtml(o.id)}" title="Borrar" aria-label="Borrar">🗑️</button>` : ''}
      </td>
    `;
    tabla.appendChild(tr);
  }
  checkTodosOrdenes.checked = ordenes.length > 0 && ordenes.every((o) => ordenesSeleccionadas.has(o.id));
}

function limpiarFormulario() {
  inputIdOriginal.value = '';
  form.reset();
  campos.id.disabled = false;
  btnGuardar.textContent = 'Agregar orden';
  tituloFormOrden.textContent = 'Nueva orden';
}

function abrirFormulario() {
  modalOrdenOverlay.hidden = false;
  campos.id.focus();
}

function cerrarFormulario() {
  limpiarFormulario();
  modalOrdenOverlay.hidden = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    id: campos.id.value.trim(),
    fecha: campos.fecha.value,
    nombre: campos.nombre.value.trim(),
    numero_oc: campos.numero_oc.value.trim(),
    estatus_id: campos.estatus_id.value,
    moneda: campos.moneda.value,
    importe_moneda_extranjera: campos.importe_moneda_extranjera.value,
    importe: campos.importe.value,
    estado_entrega_id: campos.estado_entrega_id.value,
    destino_id: campos.destino_id.value,
    contacto_id: campos.contacto_id.value,
    nota: campos.nota.value.trim(),
    observaciones: campos.observaciones.value.trim(),
  };

  const idOriginal = inputIdOriginal.value;
  const esEdicion = Boolean(idOriginal);

  const res = await fetch(esEdicion ? `/api/ordenes/${idOriginal}` : '/api/ordenes', {
    method: esEdicion ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error al guardar: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }

  cerrarFormulario();
  cargarOrdenes();
});

btnCancelar.addEventListener('click', cerrarFormulario);
btnMostrarForm.addEventListener('click', abrirFormulario);
modalOrdenCerrar.addEventListener('click', cerrarFormulario);
modalOrdenOverlay.addEventListener('click', (e) => {
  if (e.target === modalOrdenOverlay) cerrarFormulario();
});

tabla.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('btn-borrar')) {
    if (!confirmarDoble('¿Seguro que quieres borrar esta orden?')) return;
    await fetch(`/api/ordenes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    cargarOrdenes();
  }
});

function cargarOrdenEnFormulario(o) {
  inputIdOriginal.value = o.id;
  campos.id.value = o.id;
  campos.id.disabled = true;
  campos.fecha.value = o.fecha || '';
  campos.nombre.value = o.nombre || '';
  campos.numero_oc.value = o.numero_oc || '';
  campos.estatus_id.value = o.estatus_id ?? '';
  campos.moneda.value = o.moneda ?? '';
  campos.importe_moneda_extranjera.value = o.importe_moneda_extranjera ?? '';
  campos.importe.value = o.importe ?? '';
  campos.estado_entrega_id.value = o.estado_entrega_id ?? '';
  campos.destino_id.value = o.destino_id ?? '';
  campos.contacto_id.value = o.contacto_id ?? '';
  campos.nota.value = o.nota || '';
  campos.observaciones.value = o.observaciones || '';

  btnGuardar.textContent = 'Guardar cambios';
  tituloFormOrden.textContent = `Editar orden ${o.id}`;
  abrirFormulario();
  campos.fecha.focus();
}

tabla.addEventListener('click', (e) => {
  if (e.target.closest('button') || e.target.classList.contains('check-orden')) return;
  const fila = e.target.closest('tr');
  if (!fila) return;
  abrirDetalle(fila.dataset.id);
});

tabla.addEventListener('change', (e) => {
  if (!e.target.classList.contains('check-orden')) return;
  if (e.target.checked) ordenesSeleccionadas.add(e.target.value);
  else ordenesSeleccionadas.delete(e.target.value);
  checkTodosOrdenes.checked = [...tabla.querySelectorAll('.check-orden')].every((cb) => cb.checked);
  actualizarBotonEnviarTareasOrdenes();
});

checkTodosOrdenes.addEventListener('change', () => {
  tabla.querySelectorAll('.check-orden').forEach((cb) => {
    cb.checked = checkTodosOrdenes.checked;
    if (checkTodosOrdenes.checked) ordenesSeleccionadas.add(cb.value);
    else ordenesSeleccionadas.delete(cb.value);
  });
  actualizarBotonEnviarTareasOrdenes();
});

// Envia a Tareas (como pendientes de Seguimiento) todas las ordenes marcadas con checkbox.
btnEnviarTareasOrdenes.addEventListener('click', async () => {
  if (!ordenesSeleccionadas.size) return;

  const actividades = await fetch('/api/actividades').then((r) => r.json());
  const seguimiento = actividades.find((a) => a.actividad.trim().toLowerCase() === 'seguimiento');
  if (!seguimiento) {
    alert('No existe la actividad "Seguimiento" en Catálogos → Actividades. Créala primero.');
    return;
  }

  const idsSeleccionados = [...ordenesSeleccionadas];
  let enviados = 0;
  const errores = [];

  for (const id of idsSeleccionados) {
    const ordenDatos = ultimaListaOrdenes.find((o) => o.id === id);
    if (!ordenDatos) continue;
    const res = await fetch('/api/pendientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: `Seguimiento: ${id}${ordenDatos.nombre ? ' - ' + ordenDatos.nombre : ''}`,
        actividades: [seguimiento.id_actividad],
        orden_id: id,
      }),
    });
    if (res.ok) {
      enviados++;
    } else {
      const error = await res.json().catch(() => ({}));
      errores.push(`${id}: ${error.errores ? error.errores.join(', ') : res.statusText}`);
    }
  }

  ordenesSeleccionadas.clear();
  actualizarBotonEnviarTareasOrdenes();
  await cargarOrdenes();

  if (errores.length) {
    alert(`Se enviaron ${enviados} de ${idsSeleccionados.length} orden(es) a Tareas.\n\nErrores:\n${errores.join('\n')}`);
  } else {
    alert(`Se enviaron ${enviados} orden(es) a Tareas de seguimiento.`);
  }
});

let temporizadorBusqueda;
buscar.addEventListener('input', () => {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(cargarOrdenes, 250);
});

promesaAuth.then((sesion) => {
  if (!sesion) return;
  permisosOrdenes = sesion.permisos.ordenes;
  if (!permisosOrdenes.editar) btnMostrarForm.hidden = true;

  Promise.all([cargarCatalogos(), cargarFiltroAnio()]).then(cargarOrdenes).then(() => {
    // Se llego desde el detalle de un Contacto/Hotel-Local: abre directo esa orden.
    const ordenId = new URLSearchParams(window.location.search).get('orden');
    if (ordenId) abrirDetalle(ordenId);
  });
  cargarFiltroEstatus();

  suscribirTiempoReal(['ordenes'], cargarOrdenes);
  suscribirTiempoReal(['destinos', 'contactos', 'estados_entrega'], cargarCatalogos);
  suscribirTiempoReal(['estatus_catalogo'], () => { cargarCatalogos(); cargarFiltroEstatus(); });
});
