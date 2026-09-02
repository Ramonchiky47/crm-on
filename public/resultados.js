function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function diasHasta(fechaIso) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const objetivo = new Date(`${fechaIso}T00:00:00`);
  return Math.round((objetivo - hoy) / 86400000);
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

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function nombreMes(mesNumero) {
  return MESES[Number(mesNumero) - 1] || mesNumero;
}

function formatoMillones(valor) {
  return `$${(valor / 1e6).toFixed(1)}M`;
}

// Tooltip flotante compartido (un solo div reusado, no uno por barra) para la grafica de venta
// vs presupuesto. position:fixed + clientX/clientY porque se posiciona respecto al cursor, no al
// flujo normal del documento.
let graficaTooltipEl = null;
function graficaMostrarTooltip(e) {
  const rect = e.target.closest('[data-tooltip-titulo]');
  if (!rect) return;
  if (!graficaTooltipEl) {
    graficaTooltipEl = document.createElement('div');
    graficaTooltipEl.className = 'grafica-tooltip';
    document.body.appendChild(graficaTooltipEl);
  }
  graficaTooltipEl.innerHTML = `<strong>${rect.dataset.tooltipTitulo}</strong><br>${rect.dataset.tooltipValor}`;
  graficaTooltipEl.hidden = false;
  graficaPosicionarTooltip(e);
}
function graficaPosicionarTooltip(e) {
  if (!graficaTooltipEl || graficaTooltipEl.hidden) return;
  graficaTooltipEl.style.left = `${e.clientX + 14}px`;
  graficaTooltipEl.style.top = `${e.clientY + 14}px`;
}
function graficaOcultarTooltip() {
  if (graficaTooltipEl) graficaTooltipEl.hidden = true;
}

// Grafica de barras agrupadas (venta vs presupuesto), un SVG dibujado a mano en vez de una
// libreria: paleta de 2 series validada contra daltonismo/contraste (ver skill de dataviz),
// marcas delgadas con esquinas redondeadas, grid recesivo y tooltip por barra al pasar el mouse.
function renderizarGraficaAnual(serie) {
  document.getElementById('grafica-anual-periodo').textContent = serie.anio;

  const ancho = 960;
  const alto = 320;
  const margenIzq = 62;
  const margenDer = 10;
  const margenSup = 16;
  const margenInf = 34;
  const anchoPlot = ancho - margenIzq - margenDer;
  const altoPlot = alto - margenSup - margenInf;

  const valores = serie.meses.flatMap((m) => [m.venta, m.presupuesto || 0]);
  const maxEscala = Math.max(1, ...valores) * 1.15;

  const yDe = (v) => margenSup + altoPlot - (v / maxEscala) * altoPlot;
  const alturaDe = (v) => (v / maxEscala) * altoPlot;

  const anchoGrupo = anchoPlot / 12;
  const paddingGrupo = anchoGrupo * 0.16;
  const gapBarras = 3;
  const anchoBarra = (anchoGrupo - paddingGrupo * 2 - gapBarras) / 2;

  let gridSvg = '';
  const numGridlines = 4;
  for (let i = 0; i <= numGridlines; i++) {
    const valor = (maxEscala / numGridlines) * i;
    const y = yDe(valor);
    gridSvg += `<line class="grafica-linea-grid" x1="${margenIzq}" y1="${y}" x2="${ancho - margenDer}" y2="${y}" />`;
    gridSvg += `<text class="grafica-texto-eje" x="${margenIzq - 8}" y="${y + 4}" text-anchor="end">${formatoMillones(valor)}</text>`;
  }

  let barrasSvg = '';
  let etiquetasMesSvg = '';
  serie.meses.forEach((m, indice) => {
    const xGrupo = margenIzq + indice * anchoGrupo + paddingGrupo;
    const tituloTooltip = escaparHtml(`${MESES[indice]} ${serie.anio}`);

    barrasSvg += `<rect class="grafica-barra-venta" x="${xGrupo}" y="${yDe(m.venta)}" width="${anchoBarra}" height="${Math.max(alturaDe(m.venta), 0)}" rx="3" ry="3"
      data-tooltip-titulo="${tituloTooltip}" data-tooltip-valor="Venta: $${escaparHtml(formatoImporte(m.venta))}" />`;

    if (m.presupuesto !== null) {
      const xPresupuesto = xGrupo + anchoBarra + gapBarras;
      barrasSvg += `<rect class="grafica-barra-presupuesto" x="${xPresupuesto}" y="${yDe(m.presupuesto)}" width="${anchoBarra}" height="${Math.max(alturaDe(m.presupuesto), 0)}" rx="3" ry="3"
        data-tooltip-titulo="${tituloTooltip}" data-tooltip-valor="Presupuesto: $${escaparHtml(formatoImporte(m.presupuesto))}" />`;
    }

    etiquetasMesSvg += `<text class="grafica-texto-eje" x="${xGrupo + (anchoGrupo - paddingGrupo * 2) / 2}" y="${alto - margenInf + 18}" text-anchor="middle">${MESES_CORTOS[indice]}</text>`;
  });

  const contenedor = document.getElementById('grafica-anual-contenedor');
  contenedor.innerHTML = `
    <svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Venta vs presupuesto por mes, ${escaparHtml(serie.anio)}">
      ${gridSvg}
      ${barrasSvg}
      ${etiquetasMesSvg}
    </svg>
  `;
  contenedor.onmouseover = graficaMostrarTooltip;
  contenedor.onmousemove = graficaPosicionarTooltip;
  contenedor.onmouseout = graficaOcultarTooltip;
}

const filtroAnio = document.getElementById('filtro-anio-resultados');
const filtroMes = document.getElementById('filtro-mes-resultados');

// Los dos filtros son independientes entre si y solo afectan la tarjeta "Mes seleccionado": si
// se dejan en blanco, el servidor usa el ultimo mes ya cerrado como default. "Acumulado del año"
// no se ve afectado por estos filtros, siempre es el año en curso.
function poblarFiltros() {
  const anioActual = new Date().getFullYear();
  for (let anio = anioActual; anio >= anioActual - 3; anio--) {
    const option = document.createElement('option');
    option.value = String(anio);
    option.textContent = String(anio);
    filtroAnio.appendChild(option);
  }
  MESES.forEach((nombre, indice) => {
    const option = document.createElement('option');
    option.value = String(indice + 1).padStart(2, '0');
    option.textContent = nombre;
    filtroMes.appendChild(option);
  });
}

// Colorea alcance (>=100% bien, si no critico) y diferencia (>=0 bien, si no critico); null (sin
// presupuesto capturado para ese periodo) se muestra como texto neutro en vez de $0.00 enganoso.
function pintarMetrica(idValor, valor, formateador, positivo) {
  const el = document.getElementById(idValor);
  if (valor === null || valor === undefined) {
    el.textContent = 'Sin presupuesto';
    el.className = 'resultado-metrica__valor pista';
    return;
  }
  el.textContent = formateador(valor);
  el.className = `resultado-metrica__valor ${positivo(valor) ? 'texto-bueno' : 'texto-critico'}`;
}

function pintarGrupo(prefijo, datos) {
  document.getElementById(`${prefijo}-venta`).textContent = `$${formatoImporte(datos.venta)}`;
  document.getElementById(`${prefijo}-presupuesto`).textContent = datos.presupuesto === null
    ? 'Sin capturar'
    : `$${formatoImporte(datos.presupuesto)}`;
  pintarMetrica(`${prefijo}-alcance`, datos.alcance, (v) => `${formatoImporte(v)}%`, (v) => v >= 100);
  pintarMetrica(`${prefijo}-diferencia`, datos.diferencia, (v) => `${v >= 0 ? '+' : ''}$${formatoImporte(v)}`, (v) => v >= 0);
}

async function cargarResultados() {
  const params = new URLSearchParams();
  if (filtroAnio.value) params.set('anio', filtroAnio.value);
  if (filtroMes.value) params.set('mes', filtroMes.value);

  const res = await fetch(`/api/resultados/resumen?${params}`);
  if (!res.ok) return;
  const d = await res.json();

  if (d.ytd) {
    document.getElementById('ytd-periodo').textContent = `Enero - ${nombreMes(d.ytd.hasta)} ${d.ytd.anio}`;
    pintarGrupo('ytd', d.ytd);
  }
  if (d.mesSeleccionado) {
    const [anio, mes] = d.mesSeleccionado.anioMes.split('-');
    document.getElementById('mes-periodo').textContent = `${nombreMes(mes)} ${anio}`;
    pintarGrupo('mes', d.mesSeleccionado);
  }
  if (d.serieAnual) {
    renderizarGraficaAnual(d.serieAnual);
  }
}

// Mismos indicadores generales que el Panel General (Inicio), menos "Ventas del mes" (ya cubierto
// arriba por Facturacion vs presupuesto, en mas detalle).
async function cargarIndicadoresGenerales() {
  const res = await fetch('/api/panel/resumen');
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
  if (d.ventasOrdenesCargadasMes !== undefined) {
    kpis.push(tarjetaKpi('Órdenes cargadas en el mes (MXN)', `$${formatoImporte(d.ventasOrdenesCargadasMes)}`, null));
  }
  document.getElementById('resultados-kpis').innerHTML = kpis.join('');
}

filtroAnio.addEventListener('change', cargarResultados);
filtroMes.addEventListener('change', cargarResultados);

poblarFiltros();

promesaAuth.then((sesion) => {
  if (!sesion) return;
  cargarResultados();
  cargarIndicadoresGenerales();
});
