// Busca en el CRM todas las facturas sin Pedido (pedido_id) asociado, consulta a NetSuite el
// campo "Creado desde" de cada una (el vinculo exacto a la Orden de venta que la origino) via el
// agente local de Playwright, y guarda el resultado. Pensado para correr tanto a mano (boton
// "Completar pedidos desde NetSuite" en Facturacion, que llama a este mismo flujo via el
// servicio local) como programado (launchd, lunes a viernes 9am - ver
// com.gonpal.completar-pedidos.plist).
//
// Uso: node --env-file=.env scripts/completar_pedidos_desde_netsuite.js
const path = require('path');
const { execFile } = require('child_process');
const candado = require('./candado_netsuite');

const BASE_DIR = path.resolve(__dirname, '..');
const PY_SCRIPT = path.join(BASE_DIR, 'scripts', 'descargar_reportes_netsuite.py');

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

function ejecutarPython(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
    };
    execFile('python3', args, { cwd: BASE_DIR, env, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.combinado = `${stdout || ''}\n${stderr || ''}`;
        return reject(err);
      }
      resolve(stdout || '');
    });
  });
}

(async () => {
  const baseUrl = process.env.APP_BASE_URL;
  const usuario = process.env.APP_USUARIO;
  const password = process.env.APP_PASSWORD;
  if (!baseUrl || !usuario || !password) {
    console.error('Define APP_BASE_URL, APP_USUARIO y APP_PASSWORD (ver .env) antes de ejecutar este script.');
    process.exit(1);
  }

  // Si NETSUITE_CANDADO_HEREDADO esta presente, un proceso padre (correrSincronizacion en
  // servicio_agente_netsuite.js) ya adquirio el candado compartido para TODA la sincronizacion -
  // no hay que pedirlo de nuevo aqui. Si se corre este script suelto, si hay que pedirlo.
  const candadoPropio = !process.env.NETSUITE_CANDADO_HEREDADO;
  if (candadoPropio && !candado.intentarAdquirir('completar-pedidos (manual)')) {
    const otro = candado.quienLoTiene();
    console.error(`Hay otra operación de NetSuite en curso (${otro ? otro.etiqueta : 'desconocida'}); espera a que termine e intenta de nuevo.`);
    process.exit(1);
  }

  try {
    await correr(baseUrl, usuario, password);
  } finally {
    if (candadoPropio) candado.liberar();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

async function correr(baseUrl, usuario, password) {
  console.log(`[${new Date().toISOString()}] Iniciando sesión en ${baseUrl}...`);
  const cookie = await iniciarSesion(baseUrl, usuario, password);

  const facturas = await fetch(`${baseUrl}/api/facturacion`, { headers: { Cookie: cookie } }).then((r) => r.json());
  const sinPedido = [...new Set(facturas.filter((f) => !f.pedido_id).map((f) => f.id))];

  console.log(`Facturas sin Pedido: ${sinPedido.length}`);
  if (!sinPedido.length) {
    console.log('Nada que hacer.');
    return;
  }

  // ~45s por factura (la consulta real tarda hasta 20s de sondeo + navegacion) mas 2 min de
  // colchon para el login/arranque del navegador.
  const timeoutMs = sinPedido.length * 45000 + 120000;
  console.log(`-> Consultando "Creado desde" en NetSuite (tope de tiempo: ${Math.round(timeoutMs / 60000)} min)...`);

  let salida;
  try {
    salida = await ejecutarPython(['-u', PY_SCRIPT, '--pedidos-lote', sinPedido.join(','), '--headless'], timeoutMs);
  } catch (e) {
    // throw (no process.exit) para que el try/finally de arriba libere el candado antes de salir.
    throw new Error(`Error al consultar NetSuite: ${e.combinado || e.message}`);
  }
  console.log(salida);

  const resultados = salida
    .split('\n')
    .filter((l) => l.startsWith('RESULTADO_JSON:'))
    .map((l) => { try { return JSON.parse(l.slice('RESULTADO_JSON:'.length)); } catch { return null; } })
    .filter(Boolean);

  let completadas = 0;
  let sinResultado = 0;
  for (const r of resultados) {
    if (!r.pedido_id) { sinResultado++; continue; }
    try {
      const res = await fetch(`${baseUrl}/api/facturacion/${encodeURIComponent(r.factura)}/pedido`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ pedido_id: r.pedido_id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `status ${res.status}`);
      completadas++;
      console.log(`  ✅ ${r.factura} -> ${r.pedido_id}`);
    } catch (e) {
      console.log(`  ❌ ${r.factura} -> error al guardar: ${e.message}`);
    }
  }

  console.log(`\nTotal consultadas: ${resultados.length} | Completadas: ${completadas} | Sin "Creado desde": ${sinResultado}`);
}
