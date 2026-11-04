#!/usr/bin/env node
/**
 * Servicio local permanente (127.0.0.1:4567) que conecta el botón "Actualizar"
 * del CRM (https://crm-on-staging.vercel.app) con el agente local de Playwright
 * (scripts/descargar_reportes_netsuite.py) y la subida automática (scripts/subir_ordenes_netsuite.js).
 *
 * También expone GET /comprometido?orden=SO1234 para consultar "Comprometido" de UNA orden
 * puntual (no viene en ningún reporte masivo, solo en el registro individual de la orden), y
 * GET /pedido-factura?factura=INV1234 para consultar "Creado desde" (la Orden de venta que
 * originó esa factura) de UNA factura puntual, tampoco disponible en ningún reporte masivo.
 */

const http = require('http');
const path = require('path');
const { execFile } = require('child_process');

const PORT = 4567;
const BASE_DIR = path.resolve(__dirname, '..');
const PY_SCRIPT = path.join(BASE_DIR, 'scripts', 'descargar_reportes_netsuite.py');
const UPLOAD_SCRIPT = path.join(BASE_DIR, 'scripts', 'subir_ordenes_netsuite.js');

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function ejecutarComando(cmd, args, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
    };
    execFile(cmd, args, { cwd: BASE_DIR, env, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.combinado = `${stdout || ''}\n${stderr || ''}`;
        return reject(err);
      }
      resolve(stdout || '');
    });
  });
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, status: 'Agente NetSuite activo' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/sincronizar') {
    let bodyStr = '';
    for await (const chunk of req) {
      bodyStr += chunk;
    }
    let body = {};
    try {
      body = bodyStr ? JSON.parse(bodyStr) : {};
    } catch (_) {}

    const nuevoPassword = typeof body.password === 'string' ? body.password.trim() : '';
    const pyArgs = ['-u', PY_SCRIPT, '--todos', '--headless'];
    if (nuevoPassword) {
      pyArgs.push('--password', nuevoPassword);
    }

    console.log(`[${new Date().toISOString()}] Iniciando descarga de los 3 reportes de NetSuite...`);
    try {
      await ejecutarComando('python3', pyArgs, 240000);
    } catch (e) {
      const salida = e.combinado || e.message || '';
      console.error('Error en descarga NetSuite:', salida);
      if (salida.toLowerCase().includes('contraseña no válida') || salida.toLowerCase().includes('invalid login')) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          errorPassword: true,
          error: 'NetSuite rechazó la contraseña actual. Ingresa la nueva contraseña.',
        }));
        return;
      }
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        error: `Error al descargar de NetSuite: ${salida.trim().split('\n').slice(-4).join(' | ')}`,
      }));
      return;
    }

    console.log(`[${new Date().toISOString()}] Subiendo reportes al CRM...`);
    try {
      const stdoutUpload = await ejecutarComando(process.execPath, ['--env-file=.env', UPLOAD_SCRIPT], 120000);
      const lineas = stdoutUpload
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, resumen: lineas }));
    } catch (e) {
      const salida = e.combinado || e.message || '';
      console.error('Error al subir al CRM:', salida);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        error: `Los reportes se descargaron pero falló la subida al CRM: ${salida.trim()}`,
      }));
    }
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/comprometido')) {
    const orden = new URL(req.url, 'http://localhost').searchParams.get('orden');
    if (!orden) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Falta el parametro ?orden=SO1234' }));
      return;
    }

    console.log(`[${new Date().toISOString()}] Consultando Comprometido de ${orden}...`);
    let salida;
    try {
      salida = await ejecutarComando('python3', ['-u', PY_SCRIPT, '--comprometido', orden, '--headless'], 120000);
    } catch (e) {
      const combinado = e.combinado || e.message || '';
      console.error('Error al consultar Comprometido:', combinado);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `Error al consultar Comprometido: ${combinado.trim().split('\n').slice(-4).join(' | ')}` }));
      return;
    }

    const lineaResultado = salida.split('\n').find((l) => l.startsWith('RESULTADO_JSON:'));
    if (!lineaResultado) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'El agente no devolvió un resultado reconocible (ver log del servicio local).' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(lineaResultado.slice('RESULTADO_JSON:'.length));
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/pedido-factura')) {
    const factura = new URL(req.url, 'http://localhost').searchParams.get('factura');
    if (!factura) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Falta el parametro ?factura=INV1234' }));
      return;
    }

    console.log(`[${new Date().toISOString()}] Consultando "Creado desde" de ${factura}...`);
    let salida;
    try {
      salida = await ejecutarComando('python3', ['-u', PY_SCRIPT, '--pedido-factura', factura, '--headless'], 120000);
    } catch (e) {
      const combinado = e.combinado || e.message || '';
      console.error('Error al consultar pedido de factura:', combinado);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `Error al consultar la Orden de venta: ${combinado.trim().split('\n').slice(-4).join(' | ')}` }));
      return;
    }

    const lineaResultado = salida.split('\n').find((l) => l.startsWith('RESULTADO_JSON:'));
    if (!lineaResultado) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'El agente no devolvió un resultado reconocible (ver log del servicio local).' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(lineaResultado.slice('RESULTADO_JSON:'.length));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Servicio local del Agente NetSuite escuchando en http://127.0.0.1:${PORT}`);
});

