function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

function formatoImporte(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fechaLarga(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(d)} de ${meses[Number(m) - 1]} de ${y}`;
}

const token = new URLSearchParams(window.location.search).get('token');

const vistaCargando = document.getElementById('vista-cargando');
const vistaNoEncontrada = document.getElementById('vista-no-encontrada');
const vistaSolicitud = document.getElementById('vista-solicitud');
const solicitudTitulo = document.getElementById('solicitud-titulo');
const solicitudPillEstatus = document.getElementById('solicitud-pill-estatus');
const solicitudDestino = document.getElementById('solicitud-destino');
const solicitudContacto = document.getElementById('solicitud-contacto');
const solicitudLugarEntrega = document.getElementById('solicitud-lugar-entrega');
const solicitudFecha = document.getElementById('solicitud-fecha');
const tablaItemsSolicitud = document.getElementById('tabla-items-solicitud');
const formRespuestaProveedor = document.getElementById('form-respuesta-proveedor');
const solicitudYaRespondida = document.getElementById('solicitud-ya-respondida');
const solicitudComentarios = document.getElementById('solicitud-comentarios');
const tarjetaComentariosRespondida = document.getElementById('tarjeta-comentarios-respondida');
const solicitudComentariosRespondida = document.getElementById('solicitud-comentarios-respondida');

function renderizarItems(items, soloLectura) {
  tablaItemsSolicitud.innerHTML = items.map((it) => `
    <tr data-id="${it.id}">
      <td>${escaparHtml(it.codigo)}</td>
      <td>${escaparHtml(it.descripcion)}</td>
      <td>${escaparHtml(it.marca)}</td>
      <td class="num">${escaparHtml(it.cantidad)}</td>
      <td>
        ${soloLectura
          ? escaparHtml(formatoImporte(it.precio_venta) || 'Sin capturar')
          : `<input type="number" class="item-precio-venta" step="0.01" min="0" value="${it.precio_venta ?? ''}" required />`}
      </td>
      <td>
        ${soloLectura
          ? escaparHtml(it.tiempo_entrega || 'Sin capturar')
          : `<input type="text" class="item-tiempo-entrega" placeholder="Ej. 2 a 3 semanas" value="${escaparHtml(it.tiempo_entrega || '')}" required />`}
      </td>
      <td>
        ${soloLectura
          ? escaparHtml(it.comentarios || '')
          : `<input type="text" class="item-comentarios" placeholder="Opcional" value="${escaparHtml(it.comentarios || '')}" />`}
      </td>
    </tr>
  `).join('');
}

async function cargar() {
  if (!token) {
    vistaCargando.hidden = true;
    vistaNoEncontrada.hidden = false;
    return;
  }

  const res = await fetch(`/api/rfq/${encodeURIComponent(token)}`);
  if (!res.ok) {
    vistaCargando.hidden = true;
    vistaNoEncontrada.hidden = false;
    return;
  }
  const solicitud = await res.json();

  vistaCargando.hidden = true;
  vistaSolicitud.hidden = false;

  solicitudTitulo.textContent = `Hola${solicitud.proveedor_nombre ? ', ' + solicitud.proveedor_nombre : ''}`;
  solicitudPillEstatus.textContent = solicitud.estatus;
  solicitudPillEstatus.className = `pill-estatus ${solicitud.estatus === 'Respondida' ? 'estatus-vigente' : 'pill-neutro'}`;
  solicitudDestino.textContent = solicitud.destino_nombre || 'Sin especificar';
  solicitudContacto.textContent = solicitud.contacto_nombre || 'Sin especificar';
  solicitudLugarEntrega.textContent = solicitud.lugar_entrega || 'Sin especificar';
  solicitudFecha.textContent = fechaLarga(solicitud.fecha_creacion);

  const yaRespondida = solicitud.estatus === 'Respondida';
  renderizarItems(solicitud.items, yaRespondida);
  formRespuestaProveedor.hidden = yaRespondida;
  solicitudYaRespondida.hidden = !yaRespondida;
  tarjetaComentariosRespondida.hidden = !yaRespondida || !solicitud.comentarios;
  if (yaRespondida) {
    solicitudComentariosRespondida.textContent = solicitud.comentarios || '';
  }
}

formRespuestaProveedor.addEventListener('submit', async (e) => {
  e.preventDefault();

  const items = [...tablaItemsSolicitud.querySelectorAll('tr')].map((tr) => ({
    id: Number(tr.dataset.id),
    precio_venta: tr.querySelector('.item-precio-venta').value,
    tiempo_entrega: tr.querySelector('.item-tiempo-entrega').value,
    comentarios: tr.querySelector('.item-comentarios').value,
  }));

  const btn = document.getElementById('btn-enviar-respuesta');
  btn.disabled = true;
  const res = await fetch(`/api/rfq/${encodeURIComponent(token)}/responder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, comentarios: solicitudComentarios.value.trim() }),
  });
  btn.disabled = false;

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    alert('Error: ' + (error.errores ? error.errores.join(', ') : res.statusText));
    return;
  }

  await cargar();
});

cargar();
