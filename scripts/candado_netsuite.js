// Candado compartido ENTRE PROCESOS (no solo en memoria de un proceso) para que ningun par de
// operaciones que usan Playwright/NetSuite corran a la vez: todas comparten el mismo perfil de
// Chrome (.netsuite_session) y Chrome no permite dos procesos abriendolo simultaneamente (ver
// commit "Unifica la sincronizacion..." - ese fix cubria colisiones DENTRO del agente HTTP, pero
// no un script corrido directo por fuera de el, como un barrido manual del rezago historico).
//
// Implementado como un archivo (no solo una variable): asi lo respeta tanto
// servicio_agente_netsuite.js como cualquier script lanzado aparte (completar_direccion_envio_
// ordenes.js, completar_pedidos_desde_netsuite.js) sin importar en que proceso corra cada uno.
const fs = require('fs');
const path = require('path');

const ARCHIVO_CANDADO = path.join(__dirname, '.netsuite_ocupado.lock');

function intentarAdquirir(etiqueta) {
  try {
    fs.writeFileSync(ARCHIVO_CANDADO, JSON.stringify({ etiqueta, pid: process.pid, desde: new Date().toISOString() }), { flag: 'wx' });
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
}

function quienLoTiene() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_CANDADO, 'utf8'));
  } catch (_) {
    return null;
  }
}

function liberar() {
  try {
    fs.unlinkSync(ARCHIVO_CANDADO);
  } catch (_) {
    // ya no existia (p.ej. liberado dos veces) - no es un error real.
  }
}

module.exports = { intentarAdquirir, quienLoTiene, liberar };
