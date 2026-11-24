#!/usr/bin/env node
/**
 * Servicio local permanente (127.0.0.1:4567) que conecta el botón "Actualizar"
 * del CRM (https://crm-on-staging.vercel.app) con el agente local de Playwright
 * (scripts/descargar_reportes_netsuite.py) y la subida automática (scripts/subir_ordenes_netsuite.js).
 *
 * También expone GET /comprometido?orden=SO1234 para consultar "Comprometido" de UNA orden
 * puntual (no viene en ningún reporte masivo, solo en el registro individual de la orden),
 * GET /pedido-factura?factura=INV1234 para consultar "Creado desde" (la Orden de venta que
 * originó esa factura) de UNA factura puntual, tampoco disponible en ningún reporte masivo, y
 * POST /completar-pedidos para correr el proceso masivo (todas las facturas sin Pedido) - usado
 * tanto por el botón "Completar pedidos desde NetSuite" en Facturación como por la tarea
 * programada de lunes a viernes (ver com.gonpal.completar-pedidos.plist).
 */

const http = require('http');
const path = require('path');
const { execFile } = require('child_process');
const candado = require('./candado_netsuite');

const PORT = 4567;
const BASE_DIR = path.resolve(__dirname, '..');
// Mismo secreto que AGENTE_NETSUITE_SECRET en Vercel (ver scripts/tunel_agente_netsuite.js):
// una vez que el servicio se publica a internet por tunel, ya no basta con que solo escuche en
// 127.0.0.1 para protegerlo.
const SECRETO = (process.env.AGENTE_NETSUITE_SECRET || '').trim();
if (!SECRETO) {
  console.error('Falta AGENTE_NETSUITE_SECRET en el entorno (.env). El servicio no arrancara sin el.');
  process.exit(1);
}
const PY_SCRIPT = path.join(BASE_DIR, 'scripts', 'descargar_reportes_netsuite.py');
const UPLOAD_SCRIPT = path.join(BASE_DIR, 'scripts', 'subir_ordenes_netsuite.js');
const COMPLETAR_PEDIDOS_SCRIPT = path.join(BASE_DIR, 'scripts', 'completar_pedidos_desde_netsuite.js');
const COMPLETAR_DIRECCION_ENVIO_SCRIPT = path.join(BASE_DIR, 'scripts', 'completar_direccion_envio_ordenes.js');

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

// ---------------------------------------------------------------------------
// Trabajos largos en segundo plano.
// La descarga de NetSuite tarda ~3-4 min y "Completar pedidos" hasta 30 min.
// Safari corta un fetch que pasa de ~60 s, así que el navegador veía la
// conexión caída y mostraba "el servicio no está respondiendo" aunque el
// agente sí estaba trabajando. Con ?async=1 el POST responde al instante (202)
// y la página consulta GET /<trabajo>/estado cada pocos segundos.
// Sin ?async=1 se conserva el comportamiento anterior (espera y responde al
// final) para la tarea programada de lunes a viernes.
// ---------------------------------------------------------------------------
const trabajos = {
  sincronizar: { estado: 'inactivo' },
  'completar-pedidos': { estado: 'inactivo' },
};

// Todo lo que habla con NetSuite (sincronizar, completar-pedidos, /comprometido,
// /pedido-factura) usa el MISMO perfil persistente de Chrome (.netsuite_session) via Playwright.
// Chrome no permite dos procesos abriendo el mismo perfil a la vez (falla con "Failed to create a
// ProcessSingleton..."), asi que ademas de que cada trabajo evite duplicarse a si mismo (ver
// `trabajos` arriba), se necesita un candado GLOBAL para que un trabajo distinto no arranque
// mientras otro ya esta usando el navegador - antes de este candado, un clic en "Completar
// pedidos" mientras una sincronizacion seguia trabajando (el paso de "Direccion de envio" puede
// tardar ~15-20 min) tronaba con ese error de Chrome. Se implementa con un archivo (ver
// candado_netsuite.js), no solo una variable en memoria, para que tambien lo respete un script
// corrido aparte del agente (p.ej. un barrido manual del rezago historico).

async function leerCuerpo(req) {
  let bodyStr = '';
  for await (const chunk of req) {
    bodyStr += chunk;
  }
  try {
    return bodyStr ? JSON.parse(bodyStr) : {};
  } catch (_) {
    return {};
  }
}

async function correrSincronizacion(body) {
  const nuevoPassword = typeof body.password === 'string' ? body.password.trim() : '';
  const pyArgs = ['-u', PY_SCRIPT, '--todos', '--headless'];
  if (nuevoPassword) {
    pyArgs.push('--password', nuevoPassword);
  }

  console.log(`[${new Date().toISOString()}] Iniciando descarga de los reportes de NetSuite...`);
  try {
    await ejecutarComando('python3', pyArgs, 360000);
  } catch (e) {
    const salida = e.combinado || e.message || '';
    console.error('Error en descarga NetSuite:', salida);
    if (salida.toLowerCase().includes('contraseña no válida') || salida.toLowerCase().includes('invalid login')) {
      return { status: 401, body: { errorPassword: true, error: 'NetSuite rechazó la contraseña actual. Ingresa la nueva contraseña.' } };
    }
    if (e.killed) {
      return { status: 500, body: { error: 'La descarga de NetSuite tardó más de 6 minutos y se canceló. Intenta de nuevo.' } };
    }
    return { status: 500, body: { error: `Error al descargar de NetSuite: ${salida.trim().split('\n').slice(-4).join(' | ')}` } };
  }

  console.log(`[${new Date().toISOString()}] Subiendo reportes al CRM...`);
  let lineas;
  try {
    const stdoutUpload = await ejecutarComando(process.execPath, ['--env-file=.env', UPLOAD_SCRIPT], 180000);
    lineas = stdoutUpload.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (e) {
    const salida = e.combinado || e.message || '';
    console.error('Error al subir al CRM:', salida);
    return { status: 500, body: { error: `Los reportes se descargaron pero falló la subida al CRM: ${salida.trim()}` } };
  }

  // Completar Hotel/Local, Contacto y Entrega de las ordenes nuevas (ver
  // completar_direccion_envio_ordenes.js) es un paso adicional, no critico: si falla, la
  // sincronizacion igual se reporta como exitosa (los reportes ya se subieron), solo se agrega
  // un aviso al resumen para que se note en el boton "Actualizar".
  console.log(`[${new Date().toISOString()}] Completando Hotel/Contacto/Entrega desde "Dirección de envío"...`);
  try {
    const stdoutDireccion = await ejecutarComando(process.execPath, ['--env-file=.env', COMPLETAR_DIRECCION_ENVIO_SCRIPT], 1800000);
    lineas.push('', ...stdoutDireccion.split('\n').map((l) => l.trim()).filter(Boolean));
  } catch (e) {
    const salida = e.combinado || e.message || '';
    console.error('Error al completar Hotel/Contacto/Entrega:', salida);
    lineas.push('', `(Aviso: no se pudo completar Hotel/Contacto/Entrega: ${salida.trim().split('\n').slice(-2).join(' | ')})`);
  }

  // Completar "Creado desde"/Pedido de las facturas sin Pedido asociado (ver
  // completar_pedidos_desde_netsuite.js) - antes era un boton aparte en Facturación y una tarea
  // programada independiente; ahora es un paso mas de esta misma sincronización unificada, con
  // el mismo criterio de "no critico" que el paso anterior.
  console.log(`[${new Date().toISOString()}] Completando pedidos sin asociar desde NetSuite ("Creado desde")...`);
  try {
    const stdoutPedidos = await ejecutarComando(process.execPath, ['--env-file=.env', COMPLETAR_PEDIDOS_SCRIPT], 1800000);
    lineas.push('', ...stdoutPedidos.split('\n').map((l) => l.trim()).filter(Boolean));
  } catch (e) {
    const salida = e.combinado || e.message || '';
    console.error('Error al completar pedidos de facturas:', salida);
    lineas.push('', `(Aviso: no se pudo completar pedidos de facturas: ${salida.trim().split('\n').slice(-2).join(' | ')})`);
  }

  return { status: 200, body: { ok: true, resumen: lineas } };
}

async function correrCompletarPedidos() {
  console.log(`[${new Date().toISOString()}] Completando pedidos sin asociar desde NetSuite ("Creado desde")...`);
  let salida;
  try {
    salida = await ejecutarComando(process.execPath, ['--env-file=.env', COMPLETAR_PEDIDOS_SCRIPT], 1800000);
    console.log(salida);
  } catch (e) {
    const combinado = e.combinado || e.message || '';
    console.error('Error al completar pedidos desde NetSuite:', combinado);
    return { status: 500, body: { error: `Error al completar pedidos: ${combinado.trim().split('\n').slice(-4).join(' | ')}` } };
  }
  const lineas = salida.split('\n').map((l) => l.trim()).filter(Boolean);
  const resumen = lineas.find((l) => l.startsWith('Total consultadas:')) || null;
  const detalle = lineas.filter((l) => /^(✅|❌).*->/.test(l));
  return { status: 200, body: { ok: true, resumen, detalle } };
}

const EJECUTORES = {
  sincronizar: correrSincronizacion,
  'completar-pedidos': correrCompletarPedidos,
};

function responderJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function atenderTrabajo(nombre, req, res) {
  const asincrono = new URL(req.url, 'http://localhost').searchParams.get('async') === '1';
  const trabajo = trabajos[nombre];
  const body = await leerCuerpo(req);

  if (trabajo.estado === 'corriendo') {
    // Ya hay uno en curso (p.ej. doble clic u otra pestaña): no se lanza otro.
    if (asincrono) {
      return responderJson(res, 202, { enCurso: true, inicio: trabajo.inicio });
    }
    return responderJson(res, 409, { error: 'Ya hay una sincronización en curso; espera a que termine.' });
  }

  if (!candado.intentarAdquirir(nombre)) {
    const otro = candado.quienLoTiene();
    const msg = `Hay otra operación de NetSuite en curso (${otro ? otro.etiqueta : 'desconocida'}); espera a que termine e intenta de nuevo.`;
    return responderJson(res, 409, { error: msg });
  }

  trabajos[nombre] = { estado: 'corriendo', inicio: new Date().toISOString() };
  // Los scripts hijos (completar_direccion_envio_ordenes.js, completar_pedidos_desde_netsuite.js)
  // revisan esta variable para NO pedir el candado otra vez - ya lo tiene este mismo trabajo para
  // toda su duracion (ver ejecutarComando, que siempre hereda process.env a los hijos).
  process.env.NETSUITE_CANDADO_HEREDADO = '1';
  const promesa = EJECUTORES[nombre](body)
    .catch((e) => ({ status: 500, body: { error: `Error inesperado: ${e.message || e}` } }))
    .then((resultado) => {
      trabajos[nombre] = {
        estado: resultado.status === 200 ? 'ok' : 'error',
        inicio: trabajos[nombre].inicio,
        fin: new Date().toISOString(),
        resultado,
      };
      delete process.env.NETSUITE_CANDADO_HEREDADO;
      candado.liberar();
      return resultado;
    });

  if (asincrono) {
    return responderJson(res, 202, { iniciado: true, inicio: trabajos[nombre].inicio });
  }
  const resultado = await promesa;
  return responderJson(res, resultado.status, resultado.body);
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== SECRETO) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'No autorizado' }));
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, status: 'Agente NetSuite activo', asincrono: true }));
    return;
  }

  const rutaTrabajo = new URL(req.url, 'http://localhost').pathname.replace(/^\//, '');
  if (req.method === 'POST' && EJECUTORES[rutaTrabajo]) {
    await atenderTrabajo(rutaTrabajo, req, res);
    return;
  }
  const estadoMatch = rutaTrabajo.match(/^(sincronizar|completar-pedidos)\/estado$/);
  if (req.method === 'GET' && estadoMatch) {
    responderJson(res, 200, trabajos[estadoMatch[1]]);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/comprometido')) {
    const orden = new URL(req.url, 'http://localhost').searchParams.get('orden');
    if (!orden) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Falta el parametro ?orden=SO1234' }));
      return;
    }
    if (!candado.intentarAdquirir('comprometido')) {
      const otro = candado.quienLoTiene();
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `Hay otra operación de NetSuite en curso (${otro ? otro.etiqueta : 'desconocida'}); espera a que termine e intenta de nuevo.` }));
      return;
    }

    console.log(`[${new Date().toISOString()}] Consultando Comprometido de ${orden}...`);
    let salida;
    try {
      salida = await ejecutarComando('python3', ['-u', PY_SCRIPT, '--comprometido', orden, '--headless'], 120000);
      console.log(salida);
    } catch (e) {
      const combinado = e.combinado || e.message || '';
      console.error('Error al consultar Comprometido:', combinado);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `Error al consultar Comprometido: ${combinado.trim().split('\n').slice(-4).join(' | ')}` }));
      candado.liberar();
      return;
    }
    candado.liberar();

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
    if (!candado.intentarAdquirir('pedido-factura')) {
      const otro = candado.quienLoTiene();
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `Hay otra operación de NetSuite en curso (${otro ? otro.etiqueta : 'desconocida'}); espera a que termine e intenta de nuevo.` }));
      return;
    }

    console.log(`[${new Date().toISOString()}] Consultando "Creado desde" de ${factura}...`);
    let salida;
    try {
      salida = await ejecutarComando('python3', ['-u', PY_SCRIPT, '--pedido-factura', factura, '--headless'], 120000);
      console.log(salida);
    } catch (e) {
      const combinado = e.combinado || e.message || '';
      console.error('Error al consultar pedido de factura:', combinado);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `Error al consultar la Orden de venta: ${combinado.trim().split('\n').slice(-4).join(' | ')}` }));
      candado.liberar();
      return;
    }
    candado.liberar();

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

