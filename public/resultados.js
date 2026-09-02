function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatoEntero(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { maximumFractionDigits: 0 });
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

// Año y Mes son independientes en la URL, pero ambas tarjetas ("Acumulado" y "Mes seleccionado")
// comparten el mismo anio/mes resuelto por el servidor: si se dejan en blanco, usa el anio en
// curso y su ultimo mes ya cerrado. "Acumulado" es enero hasta ese mes (inclusive) del mismo anio.
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

// "vs. Presupuesto": en vez de mostrar Alcance como "114%" (que hay que restarle 100 de cabeza),
// se muestra ya como +/-14% sobre la meta, con flecha y color, igual lenguaje visual que la
// comparativa anual de al lado. La nota debajo trae el presupuesto y la diferencia en pesos.
function pintarComparativaPresupuesto(prefijo, datos) {
  const elValor = document.getElementById(`${prefijo}-alcance`);
  const elNota = document.getElementById(`${prefijo}-presupuesto-nota`);
  if (datos.presupuesto === null) {
    elValor.textContent = 'Sin presupuesto';
    elValor.className = 'hero-comparativa__valor pista';
    elNota.textContent = '';
    return;
  }
  const puntos = datos.alcance - 100;
  const positivo = puntos >= 0;
  elValor.textContent = `${positivo ? '▲' : '▼'} ${formatoImporte(Math.abs(puntos))}%`;
  elValor.className = `hero-comparativa__valor ${positivo ? 'texto-bueno' : 'texto-critico'}`;
  elNota.textContent = `$${formatoImporte(datos.presupuesto)} presupuestado · ${datos.diferencia >= 0 ? '+' : ''}$${formatoImporte(datos.diferencia)}`;
}

// "vs. año anterior": crecimiento/caida interanual (2026 vs 2025, tomando 2026 como medicion),
// mismo lenguaje visual (flecha + color) que la comparativa de presupuesto.
function pintarComparativaAnual(prefijo, datos, anioAnterior) {
  const elValor = document.getElementById(`${prefijo}-yoy`);
  const elNota = document.getElementById(`${prefijo}-yoy-nota`);
  document.getElementById(`${prefijo}-yoy-etiqueta`).textContent = `vs. ${anioAnterior}`;
  if (datos.cambioAnual === null) {
    elValor.textContent = `Sin venta en ${anioAnterior}`;
    elValor.className = 'hero-comparativa__valor pista';
    elNota.textContent = '';
    return;
  }
  const positivo = datos.cambioAnual >= 0;
  elValor.textContent = `${positivo ? '▲' : '▼'} ${formatoImporte(Math.abs(datos.cambioAnual))}%`;
  elValor.className = `hero-comparativa__valor ${positivo ? 'texto-bueno' : 'texto-critico'}`;
  elNota.textContent = `$${formatoImporte(datos.ventaAnioAnterior)} en ${anioAnterior}`;
}

function pintarGrupo(prefijo, datos, anioAnterior) {
  document.getElementById(`${prefijo}-venta`).textContent = `$${formatoImporte(datos.venta)}`;
  pintarComparativaPresupuesto(prefijo, datos);
  pintarComparativaAnual(prefijo, datos, anioAnterior);
}

// Reutilizada para las 4 listas (hoteles/productos x acumulado/mes): "nombre" ya viene resuelto
// (nombre de hotel, o codigo de producto) para no bifurcar la logica de pintado. "cantidad" es
// opcional (solo aplica a productos). "sinAsociar" (solo hoteles): el bloque de facturas sin
// pedido asociado va siempre al final, sin numero de ranking (no compite por un lugar, es lo que
// falta por clasificar).
function renderizarListaVenta(idContenedor, filas) {
  const contenedor = document.getElementById(idContenedor);
  let numeroRanking = 0;
  contenedor.innerHTML = filas.length
    ? filas.map((f) => {
        const etiqueta = f.sinAsociar ? f.nombre : `#${++numeroRanking} ${f.nombre}`;
        return `
        <div class="fila-lista">
          <div class="fila-lista__texto">
            <div class="fila-lista__principal${f.sinAsociar ? ' fila-lista__principal--pendiente' : ''}">${etiqueta}</div>
            ${f.cantidad !== undefined ? `<div class="fila-lista__secundario">Cantidad: ${formatoEntero(f.cantidad)} unidades</div>` : ''}
          </div>
          <div class="fila-lista__valor${f.sinAsociar ? ' pista' : ''}">$${formatoImporte(f.venta)}</div>
        </div>
      `;
      }).join('')
    : '<p class="tarjeta-vacio">Sin ventas en este periodo.</p>';
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
    pintarGrupo('ytd', d.ytd, Number(d.ytd.anio) - 1);
  }
  if (d.mesSeleccionado) {
    const [anio, mes] = d.mesSeleccionado.anioMes.split('-');
    const etiquetaMes = `${nombreMes(mes)} ${anio}`;
    document.getElementById('mes-periodo').textContent = etiquetaMes;
    pintarGrupo('mes', d.mesSeleccionado, Number(anio) - 1);
    document.getElementById('hoteles-mes-periodo').textContent = etiquetaMes;
    document.getElementById('productos-mes-periodo').textContent = etiquetaMes;
    cargarCotizacionesDelMes(d.mesSeleccionado.anioMes);
  }
  if (d.ytd) {
    const etiquetaYtd = `Enero - ${nombreMes(d.ytd.hasta)} ${d.ytd.anio}`;
    document.getElementById('hoteles-ytd-periodo').textContent = etiquetaYtd;
    document.getElementById('productos-ytd-periodo').textContent = etiquetaYtd;
  }
  if (d.serieAnual) {
    renderizarGraficaAnual(d.serieAnual);
  }
  if (d.topHotelesYtd) renderizarListaVenta('lista-hoteles-ytd', d.topHotelesYtd.map((f) => ({ nombre: escaparHtml(f.nombre), venta: f.venta, sinAsociar: f.sinAsociar })));
  if (d.topHotelesMes) renderizarListaVenta('lista-hoteles-mes', d.topHotelesMes.map((f) => ({ nombre: escaparHtml(f.nombre), venta: f.venta, sinAsociar: f.sinAsociar })));
  if (d.topProductosYtd) {
    renderizarListaVenta('lista-productos-ytd', d.topProductosYtd.map((f) => ({ nombre: escaparHtml(f.codigo), cantidad: f.cantidad, venta: f.venta })));
  }
  if (d.topProductosMes) {
    renderizarListaVenta('lista-productos-mes', d.topProductosMes.map((f) => ({ nombre: escaparHtml(f.codigo), cantidad: f.cantidad, venta: f.venta })));
  }
}

// Reusa /api/panel/resumen (mismo calculo de creadas/ganadas/perdidas + delta vs periodo
// anterior que el Panel General), pasando como rango el mes calendario completo del anio/mes
// resuelto en Resultados, en vez del selector Hoy/Semana/Mes/Personalizado que aqui no existe.
async function cargarCotizacionesDelMes(anioMes) {
  const [anio, mes] = anioMes.split('-');
  const desde = `${anioMes}-01`;
  const ultimoDia = new Date(Number(anio), Number(mes), 0).getDate();
  const hasta = `${anioMes}-${String(ultimoDia).padStart(2, '0')}`;

  const res = await fetch(`/api/panel/resumen?desde=${desde}&hasta=${hasta}`);
  if (!res.ok) return;
  const d = await res.json();
  if (!d.resumenPeriodo) return;
  const rp = d.resumenPeriodo;

  document.getElementById('cotizaciones-mes-periodo').textContent = `${nombreMes(mes)} ${anio}`;

  function pintar(idValor, idDelta, valor, previo, positivoEsBueno) {
    document.getElementById(idValor).textContent = valor;
    const el = document.getElementById(idDelta);
    if (!previo) {
      el.textContent = valor ? `${previo} el mes anterior` : 'Sin cambio vs. mes anterior';
      el.className = 'resumen-cot-dia__delta';
      return;
    }
    const cambio = valor - previo;
    if (cambio === 0) {
      el.textContent = `${previo} el mes anterior`;
      el.className = 'resumen-cot-dia__delta';
      return;
    }
    const pct = Math.round((cambio / previo) * 100);
    const flecha = cambio > 0 ? '↑' : '↓';
    el.textContent = `${flecha} ${Math.abs(pct)}% · ${previo} el mes anterior`;
    el.className = `resumen-cot-dia__delta ${(cambio > 0) === positivoEsBueno ? 'es-bueno' : 'es-alerta'}`;
  }

  pintar('resultados-creadas', 'resultados-creadas-delta', rp.creadas, rp.creadasPrevio, true);
  pintar('resultados-ganadas', 'resultados-ganadas-delta', rp.ganadas, rp.ganadasPrevio, true);
  pintar('resultados-perdidas', 'resultados-perdidas-delta', rp.perdidas, rp.perdidasPrevio, false);
  const importes = [];
  if (rp.ganadasImporteUsd) importes.push(`USD ${formatoImporte(rp.ganadasImporteUsd)}`);
  if (rp.ganadasImporteMxn) importes.push(`MXN ${formatoImporte(rp.ganadasImporteMxn)}`);
  document.getElementById('resultados-ganadas-importe').textContent = importes.join(' · ');
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
