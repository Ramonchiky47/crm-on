// Busca en la carpeta de descargas los archivos .xlsx mas recientes que exporta NetSuite ("Vista
// predeterminada Transaccion" -> Ordenes, "Detalle de ordenes de venta por articulo" -> Detalle de
// compra, "Detalle de ventas por articulo" -> Facturacion), inicia sesion en la app con la cuenta
// de APP_USUARIO/APP_PASSWORD y los sube a sus endpoints (misma logica que subirlos a mano desde
// el boton "Actualizar" de Ordenes).
//
// Uso: node --env-file=.env scripts/subir_ordenes_netsuite.js
const fs = require('fs');
const path = require('path');

const CARPETA_DESCARGAS = '/Users/ramonvillanueva/Downloads/descargas netsuite';

// Mismo criterio que reporteNetsuitePorArchivo en public/app.js: NetSuite siempre nombra sus
// exportaciones empezando con el nombre del reporte + un ID numerico.
const REPORTES = [
  { patron: 'vistapredeterminadatransaccion', endpoint: '/api/ordenes/importar-excel-netsuite', nombre: 'Ordenes' },
  { patron: 'detalledeordenesdeventaporarticulo', endpoint: '/api/detalle-compra/importar-excel-netsuite', nombre: 'Detalle de compra' },
  { patron: 'detalledeventasporarticulo', endpoint: '/api/facturacion/importar-excel-netsuite', nombre: 'Facturación' },
];

function normalizar(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function archivoMasRecienteDe(patron) {
  const archivos = fs.readdirSync(CARPETA_DESCARGAS)
    .filter((nombre) => !nombre.startsWith('~$') && /\.xlsx$/i.test(nombre))
    .filter((nombre) => normalizar(nombre).includes(patron))
    .map((nombre) => {
      const ruta = path.join(CARPETA_DESCARGAS, nombre);
      return { ruta, mtime: fs.statSync(ruta).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  return archivos[0]?.ruta;
}

async function iniciarSesion(baseUrl, usuario, password) {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`No se pudo iniciar sesion: ${data.error || res.statusText}`);
  }
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0]);
  return cookies.join('; ');
}

async function subirArchivo(baseUrl, cookie, endpoint, rutaArchivo) {
  const buffer = fs.readFileSync(rutaArchivo);
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      Cookie: cookie,
    },
    body: buffer,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Error al subir el archivo: ${data.error || res.statusText}`);
  return data;
}

(async () => {
  const baseUrl = process.env.APP_BASE_URL;
  const usuario = process.env.APP_USUARIO;
  const password = process.env.APP_PASSWORD;
  if (!baseUrl || !usuario || !password) {
    console.error('Define APP_BASE_URL, APP_USUARIO y APP_PASSWORD (ver .env) antes de ejecutar este script.');
    process.exit(1);
  }

  const cookie = await iniciarSesion(baseUrl, usuario, password);

  for (const reporte of REPORTES) {
    const rutaArchivo = archivoMasRecienteDe(reporte.patron);
    if (!rutaArchivo) {
      console.log(`(sin archivo de "${reporte.nombre}" en ${CARPETA_DESCARGAS}, se omite)`);
      continue;
    }
    console.log(`\n${reporte.nombre} <- ${rutaArchivo}`);

    const resultado = await subirArchivo(baseUrl, cookie, reporte.endpoint, rutaArchivo);
    console.log(`Total procesadas: ${resultado.total}`);
    console.log(`Nuevas: ${resultado.insertadas}`);
    if ('actualizadas' in resultado) console.log(`Actualizadas: ${resultado.actualizadas}`);
    if ('omitidas' in resultado) console.log(`Ya existian: ${resultado.omitidas}`);
    console.log(`Errores: ${resultado.errores.length}`);
    if (resultado.errores.length) console.log(JSON.stringify(resultado.errores, null, 2));
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
