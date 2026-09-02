function formatoImporte(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function nombreMes(mesNumero) {
  return MESES[Number(mesNumero) - 1] || mesNumero;
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
}

filtroAnio.addEventListener('change', cargarResultados);
filtroMes.addEventListener('change', cargarResultados);

poblarFiltros();

promesaAuth.then((sesion) => {
  if (!sesion) return;
  cargarResultados();
});
