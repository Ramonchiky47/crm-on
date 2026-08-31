function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLarga(fecha) {
  return `${DIAS_SEMANA[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;
}

document.getElementById('panel-fecha').innerHTML = `<strong>${fechaLarga(new Date())}</strong>`;

function colorEtapaPipeline(nombreEtapa, indiceEnCurso) {
  if (nombreEtapa === 'Cierre Ganado') return 'var(--exito)';
  if (nombreEtapa === 'Cierre Perdido') return 'var(--peligro)';
  // Una entrada por cada etapa "en curso" del pipeline (Prospeccion..Cierre): claro->oscuro
  // conforme el negocio avanza y se acerca a cerrarse.
  const pasos = ['var(--dato-250)', 'var(--dato-300)', 'var(--dato-400)', 'var(--dato-450)', 'var(--dato-500)', 'var(--dato-600)'];
  return pasos[indiceEnCurso % pasos.length];
}

function renderizarPipeline(pipeline) {
  const contenedor = document.getElementById('pipeline-lista');
  const maximo = Math.max(1, ...pipeline.map((p) => p.cantidad));
  let indiceEnCurso = 0;
  contenedor.innerHTML = pipeline.map((p) => {
    const color = colorEtapaPipeline(p.etapa, indiceEnCurso);
    if (!['Cierre Ganado', 'Cierre Perdido'].includes(p.etapa)) indiceEnCurso++;
    const ancho = Math.max(4, Math.round((p.cantidad / maximo) * 100));
    return `
      <div class="pipeline__fila" tabindex="0" data-href="cotizaciones.html?tab=negocios" title="Ver Negocios">
        <span class="pipeline__etapa">${escaparHtml(p.etapa)}</span>
        <span class="pipeline__pista"><span class="pipeline__barra" style="width:${ancho}%; background:${color}"></span></span>
        <span class="pipeline__valor">${p.cantidad}</span>
      </div>
    `;
  }).join('');
}

function diasHasta(fechaIso) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = fechaIso.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  return Math.round((fecha - hoy) / 86400000);
}

function chipVencimiento(fechaIso) {
  const dias = diasHasta(fechaIso);
  if (dias <= 0) return '<span class="chip es-critico">Vence hoy</span>';
  if (dias <= 3) return `<span class="chip es-alerta">Vence en ${dias} día${dias === 1 ? '' : 's'}</span>`;
  return `<span class="chip es-bueno">Vigente ${dias} días</span>`;
}

function renderizarCotizacionesPorVencer(lista) {
  const contenedor = document.getElementById('lista-vencer');
  contenedor.innerHTML = lista.length
    ? lista.map((c) => `
        <div class="fila-lista" tabindex="0" data-href="cotizaciones.html?cotizacion=${encodeURIComponent(c.id_cotizacion)}" title="Abrir cotización">
          <div class="fila-lista__texto">
            <div class="fila-lista__principal">${escaparHtml(c.id_cotizacion)} &middot; ${escaparHtml(c.destino_nombre || c.nombre)}</div>
            <div class="fila-lista__secundario">${escaparHtml(c.contacto_nombre || '')} &middot; ${escaparHtml(c.moneda)} ${formatoImporte(c.gran_total)}</div>
          </div>
          ${chipVencimiento(c.fecha_vencimiento)}
        </div>
      `).join('')
    : '<p class="tarjeta-vacio">Sin cotizaciones por vencer.</p>';
}

function chipVencida(fechaIso) {
  const dias = -diasHasta(fechaIso);
  return `<span class="chip es-critico">Vencida hace ${dias} día${dias === 1 ? '' : 's'}</span>`;
}

function renderizarCotizacionesVencidas(lista) {
  const contenedor = document.getElementById('lista-vencidas');
  contenedor.innerHTML = lista.length
    ? lista.map((c) => `
        <div class="fila-lista" tabindex="0" data-href="cotizaciones.html?cotizacion=${encodeURIComponent(c.id_cotizacion)}" title="Abrir cotización">
          <div class="fila-lista__texto">
            <div class="fila-lista__principal">${escaparHtml(c.id_cotizacion)} &middot; ${escaparHtml(c.destino_nombre || c.nombre)}</div>
            <div class="fila-lista__secundario">${escaparHtml(c.contacto_nombre || '')} &middot; ${escaparHtml(c.moneda)} ${formatoImporte(c.gran_total)}</div>
          </div>
          ${chipVencida(c.fecha_vencimiento)}
        </div>
      `).join('')
    : '<p class="tarjeta-vacio">Sin cotizaciones vencidas.</p>';
}

function renderizarTareasHoy(lista) {
  document.getElementById('tareas-subtitulo').textContent = `${lista.length} pendiente${lista.length === 1 ? '' : 's'}`;
  const contenedor = document.getElementById('lista-tareas');
  contenedor.innerHTML = lista.length
    ? lista.map((p) => `
        <div class="fila-lista" tabindex="0" data-href="index.html" title="Ir a Tareas">
          <div class="fila-lista__texto">
            <div class="fila-lista__principal">${escaparHtml(p.nombre)}</div>
          </div>
        </div>
      `).join('')
    : '<p class="tarjeta-vacio">Sin tareas para hoy.</p>';
}

// "Que hacer hoy" combina dos señales que antes no se veian en ningun lado: cotizaciones en
// Negociacion cuya Fecha de seguimiento ya paso (el vendedor prometio dar seguimiento y no hay
// registro de que lo hizo) y tareas cuyo compromiso ya paso. Se ordenan juntas por dias de
// atraso (lo mas atrasado primero), sin importar si es una cosa u otra: es una sola cola de
// pendientes, no dos listas que revisar por separado.
function chipAtraso(dias) {
  const d = Math.abs(dias);
  return `<span class="chip es-critico">${d} día${d === 1 ? '' : 's'} de retraso</span>`;
}

function renderizarQueHacerHoy(seguimientos, tareas) {
  const items = [
    ...seguimientos.map((c) => ({
      tipo: 'Seguimiento',
      dias: diasHasta(c.fecha_seguimiento),
      href: `cotizaciones.html?cotizacion=${encodeURIComponent(c.id_cotizacion)}`,
      principal: `${escaparHtml(c.id_cotizacion)} · ${escaparHtml(c.destino_nombre || c.nombre)}`,
      secundario: `${escaparHtml(c.contacto_nombre || '')} · ${escaparHtml(c.moneda)} ${formatoImporte(c.gran_total)}`,
    })),
    ...tareas.map((t) => ({
      tipo: 'Tarea',
      dias: diasHasta(t.fecha_compromiso),
      href: 'index.html',
      principal: escaparHtml(t.nombre),
      secundario: '',
    })),
  ].sort((a, b) => a.dias - b.dias);

  document.getElementById('que-hacer-hoy-subtitulo').textContent =
    items.length ? `${items.length} atrasado${items.length === 1 ? '' : 's'}` : 'Al día';

  document.getElementById('lista-que-hacer-hoy').innerHTML = items.length
    ? items.map((it) => `
        <div class="fila-lista" tabindex="0" data-href="${it.href}" title="Abrir">
          <div class="fila-lista__texto">
            <div class="fila-lista__principal">
              <span class="chip-tipo chip-tipo-${it.tipo === 'Tarea' ? 'tarea' : 'seguimiento'}">${it.tipo}</span>
              ${it.principal}
            </div>
            ${it.secundario ? `<div class="fila-lista__secundario">${it.secundario}</div>` : ''}
          </div>
          ${chipAtraso(it.dias)}
        </div>
      `).join('')
    : '<p class="tarjeta-vacio">Sin pendientes atrasados.</p>';
}

function tarjetaKpi(etiqueta, valor, delta, clase) {
  return `
    <article class="kpi">
      <div class="kpi__etiqueta">${escaparHtml(etiqueta)}</div>
      <div class="kpi__valor">${valor}</div>
      ${delta ? `<div class="kpi__delta ${clase || 'es-neutro'}">${delta}</div>` : ''}
    </article>
  `;
}

// Importe por moneda de un grupo de cotizaciones: si no hubo en una moneda no se muestra esa
// linea (evita mostrar "USD 0.00 · MXN 0.00" cuando no paso nada ese dia).
function textoImportePorMoneda(usd, mxn) {
  const partes = [];
  if (usd) partes.push(`USD ${formatoImporte(usd)}`);
  if (mxn) partes.push(`MXN ${formatoImporte(mxn)}`);
  return partes.join(' · ');
}

function hoyISO() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

function sumarDiasIso(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

// Mismo dia-de-mes pero en el mes anterior (para "Mes": 1-19 de agosto se compara contra
// 1-19 de julio, no contra los 19 dias de calendario justo antes). Si el mes anterior es mas
// corto y no tiene ese dia (ej. 31 de marzo -> febrero), se recorta a su ultimo dia.
function mesAnteriorMismoDia(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const mesPrevio = m === 1 ? 12 : m - 1;
  const anioPrevio = m === 1 ? y - 1 : y;
  const ultimoDiaMesPrevio = new Date(Date.UTC(anioPrevio, mesPrevio, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDiaMesPrevio);
  return `${anioPrevio}-${String(mesPrevio).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function fechaCortaIso(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

// Texto de comparacion tipo "↑ 30.8% · 39 periodo anterior". positivoEsBueno indica si subir
// es una buena noticia (creadas/ganadas) o mala (perdidas), para colorear en verde/rojo.
function textoDelta(actual, previo, positivoEsBueno) {
  if (!previo) {
    if (!actual) return { texto: 'Sin cambio vs. periodo anterior', clase: '' };
    return { texto: `${previo} el periodo anterior`, clase: positivoEsBueno ? 'es-bueno' : 'es-alerta' };
  }
  const cambio = actual - previo;
  if (cambio === 0) return { texto: `${previo} el periodo anterior`, clase: '' };
  const pct = Math.round((cambio / previo) * 100);
  const flecha = cambio > 0 ? '↑' : '↓';
  const clase = (cambio > 0) === positivoEsBueno ? 'es-bueno' : 'es-alerta';
  return { texto: `${flecha} ${Math.abs(pct)}% · ${previo} el periodo anterior`, clase };
}

function renderizarResumenPeriodo(rp) {
  document.getElementById('resumen-periodo').hidden = false;
  document.getElementById('resumen-descripcion').textContent =
    `Del ${fechaCortaIso(rp.desde)} al ${fechaCortaIso(rp.hasta)}, vs. periodo anterior `
    + `(${fechaCortaIso(rp.desdePrevio)}–${fechaCortaIso(rp.hastaPrevio)})`;

  function pintar(idValor, idDelta, valor, previo, positivoEsBueno) {
    document.getElementById(idValor).textContent = valor;
    const { texto, clase } = textoDelta(valor, previo, positivoEsBueno);
    const el = document.getElementById(idDelta);
    el.textContent = texto;
    el.className = `resumen-cot-dia__delta ${clase}`;
  }

  pintar('resumen-creadas', 'resumen-creadas-delta', rp.creadas, rp.creadasPrevio, true);
  pintar('resumen-ganadas', 'resumen-ganadas-delta', rp.ganadas, rp.ganadasPrevio, true);
  pintar('resumen-perdidas', 'resumen-perdidas-delta', rp.perdidas, rp.perdidasPrevio, false);
  document.getElementById('resumen-ganadas-importe').textContent =
    textoImportePorMoneda(rp.ganadasImporteUsd, rp.ganadasImporteMxn);
}

const rangoBotones = document.getElementById('rango-botones');
const rangoFechasContenedor = document.getElementById('rango-fechas');
const resumenDesde = document.getElementById('resumen-desde');
const resumenHasta = document.getElementById('resumen-hasta');
const btnAplicarRango = document.getElementById('btn-aplicar-rango');

// La semana inicia en lunes. Si hoy es sabado/domingo la semana ya se completo (Lun-Vie);
// si no, se corta en hoy (no se muestran dias futuros de la semana en curso). El periodo
// anterior es exactamente 7 dias atras (mismos dias de la semana pasada), no los N dias de
// calendario justo antes de "desde": eso compararia, por ejemplo, Lun-Mie contra
// Vie-Dom de la semana pasada en vez de contra su propio Lun-Mie.
function rangoSemanaActual() {
  const hoy = hoyISO();
  const diaSemanaIso = (new Date(`${hoy}T00:00:00`).getDay() + 6) % 7; // 0 = lunes ... 6 = domingo
  const lunes = sumarDiasIso(hoy, -diaSemanaIso);
  const viernes = sumarDiasIso(lunes, 4);
  const hastaSemana = hoy < viernes ? hoy : viernes;
  return {
    desde: lunes, hasta: hastaSemana,
    desdePrevio: sumarDiasIso(lunes, -7), hastaPrevio: sumarDiasIso(hastaSemana, -7),
  };
}

let rangoPanel = rangoSemanaActual();

function marcarBotonActivo(rango) {
  rangoBotones.querySelectorAll('.rango-periodo__boton').forEach((b) => {
    b.classList.toggle('activo', b.dataset.rango === rango);
  });
  rangoFechasContenedor.hidden = rango !== 'personalizado';
}

rangoBotones.addEventListener('click', (e) => {
  const boton = e.target.closest('[data-rango]');
  if (!boton) return;
  const rango = boton.dataset.rango;
  marcarBotonActivo(rango);
  if (rango === 'personalizado') {
    resumenDesde.value = rangoPanel.desde;
    resumenHasta.value = rangoPanel.hasta;
    return;
  }
  const hoy = hoyISO();
  if (rango === 'hoy') {
    // Se compara contra el mismo dia-de-mes del mes anterior (no contra "ayer": un lunes
    // siempre compararia contra domingo, un dia sin actividad de negocio). Si ese dia cae en
    // fin de semana se recorre al dia habil mas cercano (sabado -> viernes, domingo -> lunes).
    let comparar = mesAnteriorMismoDia(hoy);
    const diaSemana = new Date(`${comparar}T00:00:00`).getDay(); // 0 = domingo ... 6 = sabado
    if (diaSemana === 0) comparar = sumarDiasIso(comparar, 1);
    else if (diaSemana === 6) comparar = sumarDiasIso(comparar, -1);
    rangoPanel = { desde: hoy, hasta: hoy, desdePrevio: comparar, hastaPrevio: comparar };
  } else if (rango === 'semana') {
    rangoPanel = rangoSemanaActual();
  } else {
    // "Mes": del dia 1 a hoy, comparado contra el mismo tramo de dias del mes anterior
    // (1 al 19 de julio si hoy es 19 de agosto), no contra los N dias justo antes del dia 1.
    const inicioMes = `${hoy.slice(0, 7)}-01`;
    rangoPanel = {
      desde: inicioMes, hasta: hoy,
      desdePrevio: mesAnteriorMismoDia(inicioMes), hastaPrevio: mesAnteriorMismoDia(hoy),
    };
  }
  cargarPanel();
});

btnAplicarRango.addEventListener('click', () => {
  if (!resumenDesde.value || !resumenHasta.value || resumenDesde.value > resumenHasta.value) return;
  rangoPanel = { desde: resumenDesde.value, hasta: resumenHasta.value };
  cargarPanel();
});

marcarBotonActivo('semana');

async function cargarPanel() {
  const query = new URLSearchParams({ desde: rangoPanel.desde, hasta: rangoPanel.hasta });
  if (rangoPanel.desdePrevio) query.set('desdePrevio', rangoPanel.desdePrevio);
  if (rangoPanel.hastaPrevio) query.set('hastaPrevio', rangoPanel.hastaPrevio);
  const res = await fetch(`/api/panel/resumen?${query}`);
  if (!res.ok) return;
  const d = await res.json();

  const kpis = [];
  if (d.negociosActivos !== undefined) {
    kpis.push(tarjetaKpi('Negocios activos', d.negociosActivos, d.negociosCerradosMes ? `${d.negociosCerradosMes} cerrado(s) este mes` : null, 'es-neutro'));
  }
  if (d.cotizacionesVigentes !== undefined) {
    const porVencerPronto = (d.cotizacionesPorVencer || []).filter((c) => diasHasta(c.fecha_vencimiento) <= 3).length;
    kpis.push(tarjetaKpi(
      'Cotizaciones vigentes', d.cotizacionesVigentes,
      porVencerPronto ? `${porVencerPronto} vencen pronto` : 'Ninguna vence pronto',
      porVencerPronto ? 'es-alerta' : 'es-bueno'
    ));
  }
  if (d.ordenesPendientes !== undefined) {
    kpis.push(tarjetaKpi('Órdenes pendientes', d.ordenesPendientes, null));
  }
  if (d.ventasMes !== undefined) {
    kpis.push(tarjetaKpi('Ventas del mes (MXN)', `$${formatoImporte(d.ventasMes)}`, null));
  }
  if (d.ventasOrdenesCargadasMes !== undefined) {
    kpis.push(tarjetaKpi('Órdenes cargadas en el mes (MXN)', `$${formatoImporte(d.ventasOrdenesCargadasMes)}`, null));
  }
  document.getElementById('panel-kpis').innerHTML = kpis.join('');

  if (d.pipeline) {
    document.getElementById('tarjeta-pipeline').hidden = false;
    document.getElementById('pipeline-subtitulo').textContent = `${d.negociosActivos} negocios activos`;
    renderizarPipeline(d.pipeline);
  }
  if (d.seguimientosAtrasados) {
    document.getElementById('tarjeta-que-hacer-hoy').hidden = false;
    renderizarQueHacerHoy(d.seguimientosAtrasados, d.tareasAtrasadas || []);
  }
  if (d.cotizacionesPorVencer) {
    document.getElementById('tarjeta-vencer').hidden = false;
    renderizarCotizacionesPorVencer(d.cotizacionesPorVencer);
  }
  if (d.cotizacionesVencidas) {
    document.getElementById('tarjeta-vencidas').hidden = false;
    renderizarCotizacionesVencidas(d.cotizacionesVencidas);
  }
  if (d.tareasHoy) {
    document.getElementById('tarjeta-tareas').hidden = false;
    renderizarTareasHoy(d.tareasHoy);
  }
  if (d.resumenPeriodo) {
    renderizarResumenPeriodo(d.resumenPeriodo);
  }
}

// Las tarjetas del panel son informativas pero tambien un acceso directo: un clic (o Enter/
// espacio con teclado) en una fila lleva a la pantalla real donde vive ese dato.
function activarNavegacionLista(contenedorId) {
  const contenedor = document.getElementById(contenedorId);
  contenedor.addEventListener('click', (e) => {
    const fila = e.target.closest('[data-href]');
    if (fila) window.location.href = fila.dataset.href;
  });
  contenedor.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const fila = e.target.closest('[data-href]');
    if (!fila) return;
    e.preventDefault();
    window.location.href = fila.dataset.href;
  });
}

['pipeline-lista', 'lista-vencer', 'lista-vencidas', 'lista-tareas', 'lista-que-hacer-hoy'].forEach(activarNavegacionLista);

promesaAuth.then((sesion) => {
  if (!sesion) return;
  cargarPanel();

  suscribirTiempoReal(['negocios', 'etapas_negocio'], cargarPanel);
  suscribirTiempoReal(['cotizaciones'], cargarPanel);
  suscribirTiempoReal(['ordenes', 'estatus_catalogo'], cargarPanel);
  suscribirTiempoReal(['pendientes'], cargarPanel);
});
