// Busca el archivo .xlsx mas reciente de "Vista predeterminada Transaccion" (exportacion de
// NetSuite) en la carpeta de descargas, inicia sesion en la app con la cuenta de APP_USUARIO/
// APP_PASSWORD y lo sube a /api/ordenes/importar-excel-netsuite (misma logica que subirlo a mano
// desde Carga inicial -> Ordenes).
//
// Uso: node --env-file=.env scripts/subir_ordenes_netsuite.js
const fs = require('fs');
const path = require('path');

const CARPETA_DESCARGAS = '/Users/ramonvillanueva/Downloads/descargas netsuite';

function normalizar(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function archivoMasReciente() {
  const archivos = fs.readdirSync(CARPETA_DESCARGAS)
    .filter((nombre) => !nombre.startsWith('~$') && /\.xlsx$/i.test(nombre))
    .filter((nombre) => normalizar(nombre).includes('vistapredeterminadatransaccion'))
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

async function subirArchivo(baseUrl, cookie, rutaArchivo) {
  const buffer = fs.readFileSync(rutaArchivo);
  const res = await fetch(`${baseUrl}/api/ordenes/importar-excel-netsuite`, {
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

  const rutaArchivo = archivoMasReciente();
  if (!rutaArchivo) {
    console.error(`No se encontro ningun archivo "Vista predeterminada Transaccion" (.xlsx) en ${CARPETA_DESCARGAS}`);
    process.exit(1);
  }
  console.log(`Archivo encontrado: ${rutaArchivo}`);

  const cookie = await iniciarSesion(baseUrl, usuario, password);
  const resultado = await subirArchivo(baseUrl, cookie, rutaArchivo);

  console.log(`Total procesadas: ${resultado.total}`);
  console.log(`Nuevas: ${resultado.insertadas}`);
  console.log(`Actualizadas: ${resultado.actualizadas}`);
  console.log(`Errores: ${resultado.errores.length}`);
  if (resultado.errores.length) console.log(JSON.stringify(resultado.errores, null, 2));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
