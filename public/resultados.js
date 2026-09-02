function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tarjetaKpi(etiqueta, valor) {
  return `
    <article class="kpi">
      <div class="kpi__etiqueta">${escaparHtml(etiqueta)}</div>
      <div class="kpi__valor">${valor}</div>
    </article>
  `;
}

const filtroAnio = document.getElementById('filtro-anio-resultados');
const filtroMes = document.getElementById('filtro-mes-resultados');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Los dos filtros son independientes entre si (ver comentario en /api/resultados/resumen): se
// puede dejar cualquiera de los dos en "Todos" sin afectar al otro.
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

async function cargarResultados() {
  const params = new URLSearchParams();
  if (filtroAnio.value) params.set('anio', filtroAnio.value);
  if (filtroMes.value) params.set('mes', filtroMes.value);

  const res = await fetch(`/api/resultados/resumen?${params}`);
  if (!res.ok) return;
  const d = await res.json();

  const kpis = [];
  if (d.ventasFacturacion !== undefined) {
    kpis.push(tarjetaKpi('Ventas (Facturación) MXN', `$${formatoImporte(d.ventasFacturacion)}`));
  }
  if (d.ventasOrdenesCargadas !== undefined) {
    kpis.push(tarjetaKpi('Órdenes cargadas MXN', `$${formatoImporte(d.ventasOrdenesCargadas)}`));
  }
  document.getElementById('resultados-kpis').innerHTML = kpis.join('');
}

filtroAnio.addEventListener('change', cargarResultados);
filtroMes.addEventListener('change', cargarResultados);

poblarFiltros();

promesaAuth.then((sesion) => {
  if (!sesion) return;
  cargarResultados();
});
