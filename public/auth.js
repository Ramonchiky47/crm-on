// Se incluye en todas las paginas protegidas. Verifica la sesion, agrega la
// barra de usuario (nombre + cerrar sesion) y oculta del menu lo que el
// usuario no puede ver. Expone `promesaAuth`, una promesa que resuelve con
// los datos de la sesion (o null si redirigio a login).

// Doble confirmacion para acciones destructivas o irreversibles (Borrar, Listo, etc.):
// primero la pregunta especifica de la accion, luego una confirmacion generica.
function confirmarDoble(mensaje) {
  if (!confirm(mensaje)) return false;
  return confirm('Esta acción no se puede deshacer. ¿Confirmas que deseas continuar?');
}

function insertarBarraUsuario(datos) {
  const barra = document.createElement('div');
  barra.className = 'barra-usuario';
  barra.innerHTML = `
    <form id="form-buscador-global" class="buscador-global" role="search">
      <input type="text" autocomplete="off" id="buscador-global-input" placeholder="Buscar contacto, hotel/local u orden..." />
    </form>
    <span>${datos.usuario}${datos.esAdmin ? ' (admin)' : ''}</span>
    <button type="button" id="btn-cerrar-sesion">Cerrar sesión</button>
  `;
  const contenedor = document.querySelector('.contenedor');
  contenedor.insertBefore(barra, contenedor.firstChild);

  document.getElementById('btn-cerrar-sesion').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });

  // Buscador global: siempre presente en la barra superior, en cualquier pantalla.
  const formBuscadorGlobal = document.getElementById('form-buscador-global');
  const inputBuscadorGlobal = document.getElementById('buscador-global-input');
  const qActual = new URLSearchParams(window.location.search).get('q');
  if (qActual && window.location.pathname.endsWith('buscar-global.html')) {
    inputBuscadorGlobal.value = qActual;
  }
  formBuscadorGlobal.addEventListener('submit', (e) => {
    e.preventDefault();
    const termino = inputBuscadorGlobal.value.trim();
    if (!termino) return;
    window.location.href = `buscar-global.html?q=${encodeURIComponent(termino)}`;
  });
}

function ajustarNavegacion(datos) {
  const puedeVerDatos = datos.permisos.ordenes.ver || datos.permisos.detalle_compra.ver || datos.permisos.catalogos.ver;
  const puedeVerInformacion = datos.permisos.ordenes.ver || datos.permisos.ordenes.editar || datos.permisos.detalle_compra.editar;

  const mapa = {
    'ordenes.html': datos.permisos.ordenes.ver,
    'buscar.html': datos.permisos.ordenes.ver,
    'detalle.html': datos.permisos.detalle_compra.ver,
    'catalogos.html': datos.permisos.catalogos.ver,
    'datos.html': puedeVerDatos,
    'carga.html': datos.permisos.ordenes.editar || datos.permisos.detalle_compra.editar,
    'reportes.html': datos.permisos.ordenes.ver,
    'informacion.html': puedeVerInformacion,
    'informacion-detalle.html': puedeVerDatos,
    'cotizaciones.html': datos.permisos.catalogos.ver,
    'seguimiento-ordenes.html': puedeVerInformacion || puedeVerDatos,
    'seguimiento-cotizaciones.html': datos.permisos.catalogos.ver,
  };

  document.querySelectorAll('.nav-principal a, .tarjeta-enlace[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (href in mapa) a.hidden = !mapa[href];
  });
}

async function iniciarAuth() {
  const res = await fetch('/api/me');
  if (!res.ok) {
    window.location.href = 'login.html';
    return null;
  }

  const datos = await res.json();
  insertarBarraUsuario(datos);
  ajustarNavegacion(datos);
  return datos;
}

const promesaAuth = iniciarAuth();
