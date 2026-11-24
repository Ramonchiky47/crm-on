#!/usr/bin/env node
// Dispara la MISMA sincronización unificada que el botón "Actualizar" de Órdenes (descarga de
// NetSuite + subida al CRM + completar Hotel/Contacto/Entrega + completar pedidos de facturas),
// vía el servicio local del agente (servicio_agente_netsuite.js), que ya debe estar corriendo.
//
// Pensado para tareas programadas (ver com.gonpal.netsuite-sincronizar.plist): antes la tarea de
// las 9am llamaba a completar_pedidos_desde_netsuite.js DIRECTO, lo que poda chocar con el
// perfil de Chrome de NetSuite si una sincronización manual seguia corriendo al mismo tiempo. Al
// pasar por el agente (con su candado "ocupadoPor"), cualquier solape queda serializado en vez de
// tronar.
//
// Uso: node --env-file=.env scripts/disparar_sincronizacion.js
const SECRETO = (process.env.AGENTE_NETSUITE_SECRET || '').trim();
if (!SECRETO) {
  console.error('Falta AGENTE_NETSUITE_SECRET en el entorno (.env).');
  process.exit(1);
}

(async () => {
  console.log(`[${new Date().toISOString()}] Disparando sincronización (sin ?async, se espera a que termine)...`);
  const res = await fetch('http://127.0.0.1:4567/sincronizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRETO}` },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`[${new Date().toISOString()}] Terminó con status ${res.status}`);
  if (Array.isArray(data.resumen)) {
    console.log(data.resumen.join('\n'));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
  if (!res.ok) process.exit(1);
})().catch((e) => {
  console.error('Error al disparar la sincronización:', e.message);
  process.exit(1);
});
