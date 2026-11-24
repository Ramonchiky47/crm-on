// Busca en el CRM todas las ordenes a las que les falta Hotel/Local, Contacto o Entrega (estado),
// consulta a NetSuite la "Dirección de envío" de cada una (de ahí se deduce esos 3 campos, ya que
// el reporte masivo "Vista predeterminada Transacción" no los trae) via el agente local de
// Playwright, y guarda el resultado. Pensado para correr como parte de cada sincronización con
// NetSuite (ver correrSincronizacion en servicio_agente_netsuite.js), igual que
// completar_pedidos_desde_netsuite.js hace con "Creado desde" de las facturas.
//
// Uso: node --env-file=.env scripts/completar_direccion_envio_ordenes.js
const path = require('path');
const { execFile } = require('child_process');

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

  console.log(`[${new Date().toISOString()}] Iniciando sesión en ${baseUrl}...`);
  const cookie = await iniciarSesion(baseUrl, usuario, password);

  const sinDireccion = await fetch(`${baseUrl}/api/ordenes/sin-direccion-envio`, { headers: { Cookie: cookie } }).then((r) => r.json());

  console.log(`Órdenes sin Hotel/Contacto/Entrega: ${sinDireccion.length}`);
  if (!sinDireccion.length) {
    console.log('Nada que hacer.');
    return;
  }

  // ~45s por orden (misma estimacion que completar_pedidos_desde_netsuite.js) mas 2 min de
  // colchon para el login/arranque del navegador.
  const timeoutMs = sinDireccion.length * 45000 + 120000;
  console.log(`-> Consultando 'Dirección de envío' en NetSuite (tope de tiempo: ${Math.round(timeoutMs / 60000)} min)...`);

  let salida;
  try {
    salida = await ejecutarPython(['-u', PY_SCRIPT, '--direccion-envio-lote', sinDireccion.join(','), '--headless'], timeoutMs);
  } catch (e) {
    console.error('Error al consultar NetSuite:', e.combinado || e.message);
    process.exit(1);
  }
  console.log(salida);

  const resultados = salida
    .split('\n')
    .filter((l) => l.startsWith('RESULTADO_JSON:'))
    .map((l) => { try { return JSON.parse(l.slice('RESULTADO_JSON:'.length)); } catch { return null; } })
    .filter(Boolean);

  let completadas = 0;
  let sinDatos = 0;
  for (const r of resultados) {
    if (!r.contacto && !r.hotel && !r.estado) { sinDatos++; continue; }
    try {
      const res = await fetch(`${baseUrl}/api/ordenes/${encodeURIComponent(r.orden)}/completar-direccion-envio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ contacto: r.contacto, hotel: r.hotel, estado: r.estado }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `status ${res.status}`);
      completadas++;
      console.log(`  ✅ ${r.orden} -> hotel=${r.hotel || '(vacio)'} contacto=${r.contacto || '(vacio)'} estado=${r.estado || '(vacio)'}`);
    } catch (e) {
      console.log(`  ❌ ${r.orden} -> error al guardar: ${e.message}`);
    }
  }

  console.log(`\nTotal consultadas: ${resultados.length} | Completadas: ${completadas} | Sin "Dirección de envío": ${sinDatos}`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
