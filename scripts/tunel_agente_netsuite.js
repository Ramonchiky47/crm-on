#!/usr/bin/env node
/**
 * Publica el servicio local del agente NetSuite (127.0.0.1:4567, ver
 * scripts/servicio_agente_netsuite.js) a internet con un Cloudflare Quick Tunnel, y registra la
 * URL vigente en el CRM (tabla agente_netsuite_conexion, via POST /api/agente-netsuite/registrar)
 * para que el frontend pueda llamar al agente desde cualquier maquina/navegador, no solo desde
 * esta Mac.
 *
 * Un Quick Tunnel (`cloudflared tunnel --url ...`) no requiere dominio ni login en Cloudflare,
 * pero a cambio la URL (https://algo-al-azar.trycloudflare.com) cambia cada vez que el proceso
 * arranca. Por eso este script: (1) lanza cloudflared, (2) lee su salida para capturar la URL
 * asignada, (3) la registra en el CRM, y (4) si cloudflared se cae, lo vuelve a lanzar y repite.
 *
 * Tambien vigila su propia salud (ver vigilarSalud): varias veces (2026-11-25, 26 y 27) cloudflared
 * se quedo en un bucle de "context canceled"/"control stream encountered a failure" SIN que el
 * proceso llegara a salir (tras una caida de red por la Mac quedandose sin bateria y durmiendo) -
 * el tunel quedaba "conectado" pero sin servir trafico real, y como el proceso nunca salia, la
 * logica de "si cloudflared se cae, se relanza" nunca se disparaba sola; habia que notarlo y
 * reiniciar el servicio a mano. Ahora un chequeo periodico pega directo a la URL publica y, si
 * falla varias veces seguidas, mata el proceso para forzar el relanzamiento.
 *
 * Requiere AGENTE_NETSUITE_SECRET en .env (el mismo valor que en las variables de entorno de
 * Vercel) y el binario `cloudflared` instalado (`brew install cloudflared`).
 *
 * Pensado para correr bajo launchd (ver com.gonpal.netsuite-tunnel.plist) junto con
 * servicio_agente_netsuite.js, no como proceso de un solo uso.
 */

const { spawn } = require('child_process');
const https = require('https');
const { URL } = require('url');

const SECRETO = (process.env.AGENTE_NETSUITE_SECRET || '').trim();
if (!SECRETO) {
  console.error('Falta AGENTE_NETSUITE_SECRET en el entorno (.env). No se puede registrar la URL del tunel de forma segura.');
  process.exit(1);
}

const URL_LOCAL = 'http://127.0.0.1:4567';
const URL_REGISTRO = 'https://crm-on.vercel.app/api/agente-netsuite/registrar';
// launchd corre con un PATH minimo que no incluye ~/bin (donde "which cloudflared" lo encontro
// en esta Mac), asi que se usa la ruta absoluta salvo que se indique otra por entorno.
const CLOUDFLARED_BIN = process.env.CLOUDFLARED_BIN || '/Users/ramonvillanueva/bin/cloudflared';
const REINTENTO_MS = 10000;
const INTERVALO_SALUD_MS = 2 * 60 * 1000;
const TOPE_FALLOS_SALUD = 2;

function registrarUrl(url) {
  return new Promise((resolve, reject) => {
    const destino = new URL(URL_REGISTRO);
    const cuerpo = JSON.stringify({ url });
    const req = https.request(
      {
        hostname: destino.hostname,
        path: destino.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(cuerpo),
          Authorization: `Bearer ${SECRETO}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve();
          reject(new Error(`CRM respondio ${res.statusCode}: ${data}`));
        });
      },
    );
    req.on('error', reject);
    req.write(cuerpo);
    req.end();
  });
}

function marca() {
  return new Date().toISOString();
}

// Pega directo a la URL PUBLICA (no a 127.0.0.1): asi el chequeo es representativo de lo que
// realmente experimenta el frontend/CRM, no solo de si el agente local sigue vivo.
function comprobarSalud(urlBase) {
  return new Promise((resolve, reject) => {
    const destino = new URL(`${urlBase}/health`);
    const req = https.get(
      {
        hostname: destino.hostname,
        path: destino.pathname,
        headers: { Authorization: `Bearer ${SECRETO}` },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode === 200) return resolve();
          reject(new Error(`status ${res.statusCode}`));
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

// cloudflared imprime la URL asignada en stderr, en una linea como:
// "...  https://palabras-al-azar.trycloudflare.com  ..."
const PATRON_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

function lanzarTunel() {
  console.log(`[${marca()}] Iniciando Cloudflare Quick Tunnel hacia ${URL_LOCAL}...`);
  const proceso = spawn(CLOUDFLARED_BIN, ['tunnel', '--no-autoupdate', '--url', URL_LOCAL], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let urlRegistrada = null;
  const alDetectarLinea = (linea) => {
    if (urlRegistrada) return;
    const match = linea.match(PATRON_URL);
    if (!match) return;
    urlRegistrada = match[0];
    console.log(`[${marca()}] Tunel listo: ${urlRegistrada}`);
    registrarUrl(urlRegistrada)
      .then(() => console.log(`[${marca()}] URL registrada en el CRM.`))
      .catch((e) => console.error(`[${marca()}] No se pudo registrar la URL en el CRM:`, e.message));
  };

  let bufferSalida = '';
  const procesarChunk = (chunk) => {
    bufferSalida += chunk.toString();
    const lineas = bufferSalida.split('\n');
    bufferSalida = lineas.pop();
    lineas.forEach((l) => {
      process.stdout.write(`cloudflared: ${l}\n`);
      alDetectarLinea(l);
    });
  };
  proceso.stdout.on('data', procesarChunk);
  proceso.stderr.on('data', procesarChunk);

  // Cloudflare cierra la conexion del tunel cada tanto (mantenimiento, red, etc.); cuando
  // cloudflared muere, se relanza con una URL nueva y se vuelve a registrar.
  proceso.on('exit', (code) => {
    clearInterval(intervaloRegistro);
    clearInterval(intervaloSalud);
    console.error(`[${marca()}] cloudflared termino (codigo ${code}); reintentando en ${REINTENTO_MS / 1000}s...`);
    setTimeout(lanzarTunel, REINTENTO_MS);
  });

  // Re-registra la URL cada 5 minutos por si el CRM perdio el dato (reinicio, migracion, etc.)
  // aunque el tunel siga vivo.
  const intervaloRegistro = setInterval(() => {
    if (urlRegistrada) {
      registrarUrl(urlRegistrada).catch((e) => console.error(`[${marca()}] Reintento de registro fallo:`, e.message));
    }
  }, 5 * 60 * 1000);

  // Vigilante: cloudflared puede quedarse "vivo" pero atascado reintentando su conexion interna
  // sin servir trafico real (confirmado varias veces: logs llenos de "context canceled" sin que
  // el proceso llegara a salir solo). Si la URL publica deja de responder varias veces seguidas,
  // se mata el proceso a la fuerza para que el handler de 'exit' de arriba lo relance con una
  // URL/conexion nueva.
  let fallosSalud = 0;
  const intervaloSalud = setInterval(() => {
    if (!urlRegistrada) return;
    comprobarSalud(urlRegistrada)
      .then(() => { fallosSalud = 0; })
      .catch((e) => {
        fallosSalud += 1;
        console.error(`[${marca()}] Chequeo de salud del tunel falló (${fallosSalud}/${TOPE_FALLOS_SALUD}): ${e.message}`);
        if (fallosSalud >= TOPE_FALLOS_SALUD) {
          console.error(`[${marca()}] El tunel parece atascado (vivo pero sin responder); forzando reinicio...`);
          proceso.kill('SIGKILL');
        }
      });
  }, INTERVALO_SALUD_MS);
}

lanzarTunel();
