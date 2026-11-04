#!/usr/bin/env python3
"""
Agente automatizado con Playwright para iniciar sesión en Oracle NetSuite (cuenta 8223897)
y descargar los reportes en Excel hacia '/Users/ramonvillanueva/Downloads/descargas netsuite':

  1. Vista predeterminada Transacción (Órdenes de venta)
     URL: https://8223897.app.netsuite.com/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=SalesOrd
  2. Detalle de órdenes de venta por artículo (Detalle de compra, cr=33)
     URL: https://8223897.app.netsuite.com/app/reporting/reportrunner.nl?cr=33&whence=
  3. Detalle de ventas por artículo (Facturación, cr=268)
     URL: https://8223897.app.netsuite.com/app/reporting/reportrunner.nl?cr=268&whence=
  4. Informe de órdenes de venta por artículo, PO y Cantidades (cr=327)
     URL: https://8223897.app.netsuite.com/app/reporting/reportrunner.nl?cr=327&reload=T
     Rango de fechas: 1 de enero del año en curso hasta hoy (a diferencia de los reportes 2 y 3,
     que usan un "desde" fijo).

Además, --comprometido consulta "Comprometido" (cantidad comprometida de inventario) de UNA
orden puntual: ese dato no viene en ningún reporte masivo, solo en el registro individual de la
orden (salesord.nl?id=<ID interno>). Usa un cache local (scripts/.netsuite_ids_orden.json,
poblado durante el paso 1) para traducir "SO1234" al ID interno que requiere esa URL.

Y --pedido-factura consulta "Creado desde" de UNA factura puntual (custinvc.nl?id=<ID interno>):
el vínculo exacto a la Orden de venta que la originó. Tampoco viene en ningún reporte masivo (el
reporte 3 y la lista de Facturas no traen esa columna). Usa un cache local
(scripts/.netsuite_ids_factura.json, poblado al consultar desde la lista de Facturas,
Transaction_TYPE=CustInvc) para traducir "INV1234" al ID interno.

Uso:
  python3 scripts/descargar_reportes_netsuite.py --paso 1
  python3 scripts/descargar_reportes_netsuite.py --paso 2
  python3 scripts/descargar_reportes_netsuite.py --paso 3
  python3 scripts/descargar_reportes_netsuite.py --paso 4
  python3 scripts/descargar_reportes_netsuite.py --todos --subir
  python3 scripts/descargar_reportes_netsuite.py --comprometido SO7808
  python3 scripts/descargar_reportes_netsuite.py --pedido-factura INV9604
"""

import argparse
import getpass
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_DIR = Path(__file__).resolve().parent.parent
SESSION_DIR = BASE_DIR / ".netsuite_session"
CARPETA_DESCARGAS = Path("/Users/ramonvillanueva/Downloads/descargas netsuite")
CACHE_IDS_ORDEN = BASE_DIR / "scripts" / ".netsuite_ids_orden.json"
CACHE_IDS_FACTURA = BASE_DIR / "scripts" / ".netsuite_ids_factura.json"

ACCOUNT_ID = "8223897"
LOGIN_URL = "https://system.netsuite.com/pages/customerlogin.jsp"
APP_HOST = f"{ACCOUNT_ID}.app.netsuite.com"

URL_REPORTE_1 = f"https://{APP_HOST}/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=SalesOrd"
URL_REPORTE_2 = f"https://{APP_HOST}/app/reporting/reportrunner.nl?cr=33&whence="
URL_REPORTE_3 = f"https://{APP_HOST}/app/reporting/reportrunner.nl?cr=268&whence="
URL_REPORTE_4 = f"https://{APP_HOST}/app/reporting/reportrunner.nl?cr=327&reload=T"
URL_LISTA_FACTURAS = f"https://{APP_HOST}/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=CustInvc"


def cargar_env():
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


def actualizar_password_env(nuevo_password: str):
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    lines = env_path.read_text(encoding="utf-8").splitlines()
    nuevas = []
    reemplazado = False
    for line in lines:
        if line.strip().startswith("NETSUITE_PASSWORD="):
            nuevas.append(f'NETSUITE_PASSWORD="{nuevo_password}"')
            reemplazado = True
        else:
            nuevas.append(line)
    if not reemplazado:
        nuevas.append(f'NETSUITE_PASSWORD="{nuevo_password}"')
    env_path.write_text("\n".join(nuevas) + "\n", encoding="utf-8")


def necesita_autenticacion(url: str) -> bool:
    u = url.lower()
    return (
        "customerlogin.jsp" in u
        or "login.nl" in u
        or "enterpriselogin.nl" in u
        or "loginrouter.nl" in u
        or "twofactor" in u
        or "securityquestions" in u
        or "additionalauthentication" in u
        or "secquestions" in u
        or APP_HOST not in u
    )


def asegurar_login(page, target_url: str):
    """
    Navega a target_url. Si NetSuite redirige al login, ingresa automáticamente
    NETSUITE_EMAIL y NETSUITE_PASSWORD y verifica si pide pregunta de seguridad o 2FA.
    """
    print(f"-> Abriendo: {target_url}")
    page.goto(target_url, wait_until="domcontentloaded")
    time.sleep(2)

    if not necesita_autenticacion(page.url):
        print(f"✅ Sesión ya activa en: {page.url}")
        return

    email = os.environ.get("NETSUITE_EMAIL", "").strip()
    password = os.environ.get("NETSUITE_PASSWORD", "").strip()

    print(f"-> Pantalla de autenticación detectada: {page.url}")

    if email and password:
        try:
            # Esperar campos de login (tanto customerlogin.jsp como enterpriselogin.nl)
            campo_email = page.locator("#email, input[name='email'], #userName").first
            campo_pass = page.locator("#password, input[name='password']").first
            if campo_email.count() > 0 and campo_email.is_visible():
                campo_email.fill(email)
                campo_pass.fill(password)
                print(f"-> Ingresando credenciales para {email}...")
                btn_login = page.locator(
                    "#submitButton, #login-submit, button[type='submit'], input[type='submit']"
                ).first
                if btn_login.count() > 0:
                    btn_login.click()
                else:
                    campo_pass.press("Enter")
                page.wait_for_load_state("domcontentloaded", timeout=30000)
                time.sleep(3)
        except Exception as e:
            print(f"   (Aviso en auto-login: {e})")

    # Revisar en qué pantalla quedó después de enviar usuario y contraseña
    if necesita_autenticacion(page.url):
        print(f"-> URL tras login inicial: {page.url}")
        # Ver si hay mensaje de error de contraseña o pregunta de seguridad
        body_text = ""
        try:
            body_text = page.locator("body").inner_text(timeout=3000)
        except Exception:
            pass
        for line in body_text.splitlines():
            s = line.strip()
            if s:
                print(f"   [Pantalla NetSuite]: {s[:120]}")

        if "contraseña no válida" in body_text.lower() or "invalid email" in body_text.lower() or "invalid login" in body_text.lower():
            raise RuntimeError("❌ NetSuite rechazó el correo o la contraseña ('contraseña no válida').")

        # Responder automáticamente la pregunta de seguridad si estamos en securityquestions.nl
        if "securityquestions.nl" in page.url.lower() or "pregunta:" in body_text.lower():
            respuestas_conocidas = {
                "alias en la infancia": os.environ.get("NETSUITE_SEC_INFANCIA", "moncho"),
            }
            # Permitir respuestas extra desde variable NETSUITE_SEC_EXTRA="palabra_clave:respuesta;otra:respuesta2"
            extra_env = os.environ.get("NETSUITE_SEC_EXTRA", "")
            for par in extra_env.split(";"):
                if ":" in par:
                    k_sec, v_sec = par.split(":", 1)
                    respuestas_conocidas[k_sec.strip().lower()] = v_sec.strip()

            body_lower = body_text.lower()
            respuesta_elegida = None
            for clave_preg, resp in respuestas_conocidas.items():
                if clave_preg in body_lower:
                    respuesta_elegida = resp
                    print(f"-> Pregunta de seguridad reconocida ('{clave_preg}'). Respondiendo automáticamente...")
                    break

            if respuesta_elegida:
                campo_resp = page.locator("input[name='answer'], input[type='password'], input[type='text']").first
                campo_resp.fill(respuesta_elegida)
                btn_submit = page.locator("input[type='submit'], button[type='submit'], #submitButton, input[name='submitter']").first
                if btn_submit.count() > 0:
                    btn_submit.click()
                else:
                    campo_resp.press("Enter")
                page.wait_for_load_state("domcontentloaded", timeout=30000)
                time.sleep(3)
            else:
                raise RuntimeError("❌ NetSuite mostró una pregunta de seguridad nueva que aún no tenemos registrada. Revisa la línea 'Pregunta:' arriba.")

    # Si después de responder la pregunta de seguridad sigue pidiendo algo más
    if necesita_autenticacion(page.url):
        print("\n======================================================================")
        print("🔐 Se requiere paso adicional en la ventana de Chrome (Pregunta de")
        print("   seguridad / 2FA / Selección de rol). Esperando a que se complete...")
        print("======================================================================\n")

        deadline = time.time() + 180
        while time.time() < deadline:
            curr = page.url
            if not necesita_autenticacion(curr):
                print(f"✅ Sesión autenticada en: {curr}")
                break
            time.sleep(1.5)
        else:
            raise RuntimeError(f"No se completó el inicio de sesión. URL actual: {page.url}")

    if target_url.split("?")[0] not in page.url:
        page.goto(target_url, wait_until="domcontentloaded")
        time.sleep(2)


def actualizar_cache_ids_orden(page):
    """
    "Comprometido" (y cualquier otro dato que solo viva en el registro individual de una orden,
    no en un reporte masivo) requiere abrir salesord.nl?id=<ID_INTERNO>&whence= - pero NetSuite
    identifica las ordenes por ese ID interno, no por el numero "SO1234" que usamos en el CRM.
    Esta funcion extrae ese mapeo (SO1234 -> ID interno) de los links de la lista de "Vista
    predeterminada Transaccion" (ya se visita en el paso 1) y lo guarda en CACHE_IDS_ORDEN para
    poder construir esa URL despues sin tener que buscar la orden a mano cada vez.
    """
    try:
        pares = page.evaluate("""() => {
            const resultado = [];
            const enlaces = Array.from(document.querySelectorAll("a[href*='salesord.nl']"));
            for (const a of enlaces) {
                const texto = (a.innerText || '').trim();
                const m = a.href.match(/[?&]id=(\\d+)/);
                if (texto && /^SO\\d+$/i.test(texto) && m) {
                    resultado.push([texto.toUpperCase(), m[1]]);
                }
            }
            return resultado;
        }""")
    except Exception as e:
        print(f"   (Aviso: no se pudo leer el mapeo de IDs de orden: {e})")
        return

    if not pares:
        print("   (Aviso: no se encontraron links de orden en esta lista para actualizar el cache de IDs)")
        return

    cache = {}
    if CACHE_IDS_ORDEN.exists():
        try:
            cache = json.loads(CACHE_IDS_ORDEN.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    for numero_so, id_interno in pares:
        cache[numero_so] = id_interno

    CACHE_IDS_ORDEN.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"-> Cache de IDs de orden actualizado: {len(pares)} orden(es) en esta página, {len(cache)} en total.")


def consultar_comprometido(page, numero_so: str) -> list:
    """
    Abre el registro individual de una orden (salesord.nl?id=...) y lee, de la pestaña
    "Artículos", la cantidad "Comprometido" por línea de artículo. A diferencia de los otros
    reportes (masivos, uno por todas las órdenes), esto es una consulta por-orden bajo demanda:
    "Comprometido" no viene en ningún reporte exportable, solo en el registro individual.
    """
    numero_so = numero_so.strip().upper()

    cache = {}
    if CACHE_IDS_ORDEN.exists():
        try:
            cache = json.loads(CACHE_IDS_ORDEN.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    id_interno = cache.get(numero_so)
    if not id_interno:
        print(f"-> {numero_so} no está en el cache de IDs; actualizando desde 'Vista predeterminada Transacción'...")
        asegurar_login(page, URL_REPORTE_1)
        try:
            page.wait_for_load_state("networkidle", timeout=30000)
        except Exception:
            pass
        time.sleep(2)
        actualizar_cache_ids_orden(page)
        cache = json.loads(CACHE_IDS_ORDEN.read_text(encoding="utf-8")) if CACHE_IDS_ORDEN.exists() else {}
        id_interno = cache.get(numero_so)

    if not id_interno:
        raise RuntimeError(
            f"No se encontró el ID interno de {numero_so} en la lista de Órdenes. "
            "Verifica que el número sea correcto y que la orden aparezca en 'Vista predeterminada Transacción'."
        )

    url_orden = f"https://{APP_HOST}/app/accounting/transactions/salesord.nl?id={id_interno}&whence="
    print(f"-> Abriendo {numero_so} (ID interno {id_interno}): {url_orden}")
    asegurar_login(page, url_orden)
    try:
        page.wait_for_load_state("networkidle", timeout=30000)
    except Exception:
        pass
    time.sleep(2)

    # La sub-pestaña "Artículos" suele estar activa por default al abrir la orden; su tabla trae
    # columnas Artículo/Comprometido/Empaquetando/Recolectado/Completado (confirmado por captura).
    # Usa tabla.rows/fila.cells (no querySelectorAll por separado) para que el indice de columna
    # de la fila de encabezado y el de las filas de datos queden alineados en la MISMA tabla.
    filas = page.evaluate("""() => {
        const tablas = Array.from(document.querySelectorAll('table'));
        for (const tabla of tablas) {
            const filasTabla = Array.from(tabla.rows);
            if (!filasTabla.length) continue;

            let idxEncabezado = -1;
            let encabezados = [];
            for (let i = 0; i < Math.min(filasTabla.length, 5); i++) {
                const celdas = Array.from(filasTabla[i].cells).map(c => (c.innerText || '').trim().toLowerCase());
                if (celdas.some(h => h.includes('comprometido'))) {
                    idxEncabezado = i;
                    encabezados = celdas;
                    break;
                }
            }
            if (idxEncabezado === -1) continue;

            const colComprometido = encabezados.findIndex(h => h.includes('comprometido'));
            const colArticulo = encabezados.findIndex(h => h.includes('art') && h.includes('culo'));

            const resultado = [];
            for (let i = idxEncabezado + 1; i < filasTabla.length; i++) {
                const celdas = Array.from(filasTabla[i].cells).map(c => (c.innerText || '').trim());
                if (colComprometido < 0 || colComprometido >= celdas.length) continue;
                const comprometido = celdas[colComprometido];
                if (comprometido === '' || isNaN(Number(comprometido))) continue;
                const articulo = (colArticulo >= 0 && colArticulo < celdas.length) ? celdas[colArticulo] : '';
                resultado.push({ articulo: articulo || '(sin identificar)', comprometido: Number(comprometido) });
            }
            if (resultado.length) return resultado;
        }
        return [];
    }""")

    if not filas:
        info = page.evaluate("""() => {
            return Array.from(document.querySelectorAll('th, td'))
                .map(el => (el.innerText || '').trim())
                .filter(Boolean)
                .slice(0, 40);
        }""")
        print("-> No se encontró una tabla con columna 'Comprometido'. Texto de celdas visibles (diagnóstico):")
        print("  ", info)
        raise RuntimeError(
            f"No se pudo leer 'Comprometido' de {numero_so}. Revisa que la pestaña 'Artículos' esté visible "
            "(ver diagnóstico arriba) — puede que haya que ajustar el selector."
        )

    print(f"✅ Comprometido de {numero_so}:")
    for f in filas:
        print(f"   {f['articulo']}: {f['comprometido']}")
    # Linea final de salida parseable: scripts/servicio_agente_netsuite.js la usa para reenviar
    # el resultado al CRM sin tener que re-parsear el log humano de arriba.
    print(f"RESULTADO_JSON:{json.dumps({'orden': numero_so, 'items': filas}, ensure_ascii=False)}")
    return filas


def actualizar_cache_ids_factura(page):
    """
    Mismo problema que con Ordenes (ver actualizar_cache_ids_orden): el registro individual de
    una factura vive en custinvc.nl?id=<ID_INTERNO>, no por su numero "INV1234"/"CM180". Extrae
    ese mapeo de los links de la lista de facturas (Transaction_TYPE=CustInvc) y lo guarda en
    CACHE_IDS_FACTURA.
    """
    try:
        pares = page.evaluate("""() => {
            const resultado = [];
            const enlaces = Array.from(document.querySelectorAll("a[href*='custinvc.nl']"));
            for (const a of enlaces) {
                const texto = (a.innerText || '').trim();
                const m = a.href.match(/[?&]id=(\\d+)/);
                if (texto && /^(INV|CM)\\d+$/i.test(texto) && m) {
                    resultado.push([texto.toUpperCase(), m[1]]);
                }
            }
            return resultado;
        }""")
    except Exception as e:
        print(f"   (Aviso: no se pudo leer el mapeo de IDs de factura: {e})")
        return

    if not pares:
        print("   (Aviso: no se encontraron links de factura en esta lista para actualizar el cache de IDs)")
        return

    cache = {}
    if CACHE_IDS_FACTURA.exists():
        try:
            cache = json.loads(CACHE_IDS_FACTURA.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    for numero_factura, id_interno in pares:
        cache[numero_factura] = id_interno

    CACHE_IDS_FACTURA.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"-> Cache de IDs de factura actualizado: {len(pares)} factura(s) en esta página, {len(cache)} en total.")


def consultar_pedido_de_factura(page, numero_factura: str):
    """
    Abre el registro individual de una factura (custinvc.nl?id=...) y lee el campo "Creado desde"
    (ej. "Orden de venta #SO6943"), que es el vinculo directo y exacto a la Orden de venta que la
    origino - mas confiable que cruzar por numero de serie (que solo cubre articulos serializados).
    """
    numero_factura = numero_factura.strip().upper()

    cache = {}
    if CACHE_IDS_FACTURA.exists():
        try:
            cache = json.loads(CACHE_IDS_FACTURA.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    id_interno = cache.get(numero_factura)
    if not id_interno:
        print(f"-> {numero_factura} no está en el cache de IDs; actualizando desde la lista de Facturas...")
        asegurar_login(page, URL_LISTA_FACTURAS)
        try:
            page.wait_for_load_state("networkidle", timeout=30000)
        except Exception:
            pass
        time.sleep(2)
        actualizar_cache_ids_factura(page)
        cache = json.loads(CACHE_IDS_FACTURA.read_text(encoding="utf-8")) if CACHE_IDS_FACTURA.exists() else {}
        id_interno = cache.get(numero_factura)

    if not id_interno:
        raise RuntimeError(
            f"No se encontró el ID interno de {numero_factura} en la lista de Facturas. "
            "Verifica que el número sea correcto y que la factura aparezca en esa lista."
        )

    url_factura = f"https://{APP_HOST}/app/accounting/transactions/custinvc.nl?id={id_interno}&whence="
    print(f"-> Abriendo {numero_factura} (ID interno {id_interno}): {url_factura}")
    asegurar_login(page, url_factura)
    try:
        page.wait_for_load_state("networkidle", timeout=30000)
    except Exception:
        pass
    time.sleep(2)

    # "Creado desde" es una etiqueta (texto gris) seguida de un link "Orden de venta #SO1234".
    pedido_so = page.evaluate("""() => {
        const etiquetas = Array.from(document.querySelectorAll('*'))
            .filter(el => el.children.length === 0 && (el.innerText || '').trim().toLowerCase() === 'creado desde');
        for (const etiqueta of etiquetas) {
            let contenedor = etiqueta.closest('div, td, tr') || etiqueta.parentElement;
            for (let i = 0; i < 4 && contenedor; i++, contenedor = contenedor.nextElementSibling || contenedor.parentElement) {
                const enlace = contenedor.querySelector ? contenedor.querySelector('a') : null;
                if (enlace && /orden de venta/i.test(enlace.innerText || '')) {
                    const m = (enlace.innerText || '').match(/SO\\d+/i);
                    if (m) return m[0].toUpperCase();
                }
            }
        }
        return null;
    }""")

    if not pedido_so:
        info = page.evaluate("""() => {
            return Array.from(document.querySelectorAll('div, td, span, a'))
                .map(el => (el.innerText || '').trim())
                .filter((t) => t && t.length < 60)
                .slice(0, 60);
        }""")
        print("-> No se encontró 'Creado desde' con una Orden de venta vinculada. Texto visible (diagnóstico):")
        print("  ", info)
        print(f"RESULTADO_JSON:{json.dumps({'factura': numero_factura, 'pedido_id': None}, ensure_ascii=False)}")
        return None

    print(f"✅ {numero_factura} fue creada desde: {pedido_so}")
    print(f"RESULTADO_JSON:{json.dumps({'factura': numero_factura, 'pedido_id': pedido_so}, ensure_ascii=False)}")
    return pedido_so


def descargar_reporte_1_ordenes(page) -> Path:
    """
    Paso 1: Vista predeterminada Transacción (Órdenes de venta)
    """
    print("\n=== PASO 1: Vista predeterminada Transacción (Órdenes) ===")
    asegurar_login(page, URL_REPORTE_1)
    try:
        page.wait_for_load_state("networkidle", timeout=30000)
    except Exception:
        pass
    time.sleep(2)

    print(f"-> Página cargada: {page.title()} ({page.url})")

    actualizar_cache_ids_orden(page)

    selectores_excel = [
        "[data-button-code='exportxls']",
        "div.uir-list-export-xls",
        "td.uir-list-export-xls",
        "div[title*='Excel' i]",
        "a[title*='Excel' i]",
        "button[title*='Excel' i]",
        "img[title*='Excel' i]",
        "[aria-label*='Excel' i]",
        "img[src*='xls' i]",
        "a[onclick*='xls' i]",
        "div[onclick*='xls' i]",
    ]

    boton_encontrado = None
    for sel in selectores_excel:
        loc = page.locator(sel).first
        if loc.count() > 0 and loc.is_visible():
            boton_encontrado = loc
            print(f"-> Botón Excel detectado con selector: {sel}")
            break

    if not boton_encontrado:
        # Inspeccionar elementos con xls/export en el DOM para diagnóstico
        info = page.evaluate("""() => {
            const els = Array.from(document.querySelectorAll('a, button, div, td, img, span'));
            return els.filter(el => {
                const html = (el.outerHTML || '').toLowerCase();
                return html.includes('xls') || html.includes('excel') || html.includes('export');
            }).slice(0, 15).map(el => ({
                tag: el.tagName,
                id: el.id,
                cls: el.className,
                title: el.getAttribute('title'),
                onclick: el.getAttribute('onclick')
            }));
        }""")
        print("-> Elementos de exportación encontrados en DOM:", info)

    print("-> Iniciando descarga de 'Vista predeterminada Transacción'...")
    with page.expect_download(timeout=120000) as download_info:
        if boton_encontrado:
            boton_encontrado.click()
        else:
            # Intentar invocar la función o clic por JS si existe
            clicked = page.evaluate("""() => {
                const el = document.querySelector("[onclick*='xls' i], [title*='Excel' i], .uir-list-export-xls");
                if (el) { el.click(); return true; }
                return false;
            }""")
            if not clicked:
                print("   (Esperando clic manual en el ícono de Excel en la ventana...)")

    download = download_info.value
    nombre_archivo = download.suggested_filename
    if not nombre_archivo.lower().endswith((".xlsx", ".xls")):
        nombre_archivo += ".xlsx"

    CARPETA_DESCARGAS.mkdir(parents=True, exist_ok=True)
    destino = CARPETA_DESCARGAS / nombre_archivo
    download.save_as(str(destino))
    print(f"✅ Reporte 1 guardado en: {destino} ({destino.stat().st_size:,} bytes)")
    return destino


def descargar_reporte_runner(page, num_paso: int, titulo: str, url: str, desde: str = "01/01/2026") -> Path:
    """
    Paso 2 y 3: Reportes en reportrunner.nl (cr=33 y cr=268)
    Configura el rango de fechas desde '01/01/2026' hasta el día actual y exporta a Excel.
    """
    print(f"\n=== PASO {num_paso}: {titulo} ===")
    asegurar_login(page, url)
    try:
        page.wait_for_load_state("networkidle", timeout=45000)
    except Exception:
        pass
    time.sleep(2)

    hoy_str = datetime.now().strftime("%d/%m/%Y")

    # Ajustar fechas en #crit_1_from y #crit_1_to y dar clic en #refresh
    try:
        campo_desde = page.locator("#crit_1_from, input[name='crit_1_from']").first
        campo_hasta = page.locator("#crit_1_to, input[name='crit_1_to']").first

        if campo_desde.count() > 0 and campo_desde.is_visible():
            val_desde = campo_desde.input_value().strip()
            val_hasta = campo_hasta.input_value().strip() if (campo_hasta.count() > 0 and campo_hasta.is_visible()) else ""
            print(f"-> Fechas actuales en el reporte: Desde='{val_desde}', Hasta='{val_hasta}'")
            if val_desde != desde or (val_hasta and val_hasta != hoy_str):
                print(f"-> Ajustando rango de fechas: Desde='{desde}' Hasta='{hoy_str}'")
                campo_desde.click()
                campo_desde.fill(desde)
                campo_desde.press("Tab")
                time.sleep(0.5)
                if campo_hasta.count() > 0 and campo_hasta.is_visible():
                    campo_hasta.click()
                    campo_hasta.fill(hoy_str)
                    campo_hasta.press("Tab")
                    time.sleep(0.5)

                btn_refresh = page.locator("#refresh, input[name='refresh']").first
                if btn_refresh.count() > 0 and btn_refresh.is_visible():
                    print("-> Clic en Actualizar (#refresh)...")
                    btn_refresh.click()
                    try:
                        page.wait_for_load_state("networkidle", timeout=60000)
                    except Exception:
                        pass
                    time.sleep(3)
                    print(f"-> Nuevas fechas confirmadas: Desde='{campo_desde.input_value().strip()}', Hasta='{campo_hasta.input_value().strip()}'")
    except Exception as e:
        print(f"   (Aviso al verificar fechas del reporte: {e})")

    selectores_excel = [
        "[data-button-code='exportxls']",
        "button[title*='Excel' i]",
        "a[title*='Excel' i]",
        "div[title*='Excel' i]",
        "img[title*='Excel' i]",
        "span[title*='Excel' i]",
        "[aria-label*='Excel' i]",
        "a[onclick*='exportToExcel' i]",
        "button[onclick*='exportToExcel' i]",
        "div[onclick*='exportToExcel' i]",
        "td[onclick*='exportToExcel' i]",
        "a[onclick*='xls' i]",
        "div[onclick*='xls' i]",
        "img[src*='excel' i]",
        "img[src*='xls' i]",
    ]

    boton_encontrado = None
    for sel in selectores_excel:
        loc = page.locator(sel).first
        if loc.count() > 0 and loc.is_visible():
            boton_encontrado = loc
            print(f"-> Botón Excel detectado con selector: {sel}")
            break

    if not boton_encontrado:
        export_els = page.evaluate("""() => {
            return Array.from(document.querySelectorAll('a, button, div, td, img, span, input')).filter(el => {
                const h = (el.outerHTML || '').toLowerCase();
                return (h.includes('xls') || h.includes('excel') || h.includes('export') || h.includes('refresh')) && el.offsetParent !== null;
            }).slice(0, 20).map(el => ({
                tag: el.tagName, id: el.id, cls: el.className, title: el.getAttribute('title'), onclick: el.getAttribute('onclick'), text: (el.innerText || '').slice(0, 40)
            }));
        }""")
        print("-> Elementos de acción en Report Runner:", export_els)

    print(f"-> Iniciando descarga de '{titulo}'...")
    with page.expect_download(timeout=120000) as download_info:
        if boton_encontrado:
            boton_encontrado.click()
        else:
            print("   (Esperando clic en el botón de Exportar a Excel en la ventana...)")

    download = download_info.value
    nombre_archivo = download.suggested_filename
    if not nombre_archivo.lower().endswith((".xlsx", ".xls")):
        nombre_archivo += ".xlsx"

    CARPETA_DESCARGAS.mkdir(parents=True, exist_ok=True)
    destino = CARPETA_DESCARGAS / nombre_archivo
    download.save_as(str(destino))
    print(f"✅ Reporte {num_paso} guardado en: {destino} ({destino.stat().st_size:,} bytes)")
    return destino


def main():
    parser = argparse.ArgumentParser(description="Agente de descarga de reportes NetSuite")
    parser.add_argument("--paso", type=int, choices=[1, 2, 3, 4], help="Ejecutar solo el paso 1, 2, 3 o 4")
    parser.add_argument("--todos", action="store_true", help="Descargar los 4 reportes en secuencia")
    parser.add_argument("--comprometido", type=str, metavar="SO1234", help="Consultar 'Comprometido' de una sola orden (no descarga reportes)")
    parser.add_argument("--pedido-factura", type=str, metavar="INV1234", help="Consultar la Orden de venta ('Creado desde') de una sola factura (no descarga reportes)")
    parser.add_argument("--subir", action="store_true", help="Subir al CRM al terminar usando subir_ordenes_netsuite.js")
    parser.add_argument("--password", type=str, help="Actualizar y usar nueva contraseña de NetSuite")
    parser.add_argument("--preguntar-password", action="store_true", help="Preguntar interactivamente si cambió la contraseña")
    parser.add_argument("--headless", action="store_true", help="Ejecutar sin ventana visible")
    args = parser.parse_args()

    if not args.paso and not args.todos and not args.comprometido and not args.pedido_factura:
        args.paso = 1

    cargar_env()

    if args.password:
        os.environ["NETSUITE_PASSWORD"] = args.password
        actualizar_password_env(args.password)
    elif args.preguntar_password and sys.stdin.isatty():
        actual = os.environ.get("NETSUITE_PASSWORD", "")
        prompt_msg = f"Contraseña de NetSuite [Enter para usar la guardada ({'*' * len(actual)})]: "
        nueva = getpass.getpass(prompt_msg).strip()
        if nueva:
            os.environ["NETSUITE_PASSWORD"] = nueva
            actualizar_password_env(nueva)
            print("-> Contraseña actualizada en .env")

    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    CARPETA_DESCARGAS.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(SESSION_DIR),
            channel="chrome",
            headless=args.headless,
            accept_downloads=True,
            viewport={"width": 1400, "height": 900},
        )
        page = context.pages[0] if context.pages else context.new_page()

        try:
            if args.comprometido:
                consultar_comprometido(page, args.comprometido)
                return

            if args.pedido_factura:
                consultar_pedido_de_factura(page, args.pedido_factura)
                return

            if args.paso == 1 or args.todos:
                descargar_reporte_1_ordenes(page)

            if args.paso == 2 or args.todos:
                descargar_reporte_runner(
                    page,
                    num_paso=2,
                    titulo="Detalle de órdenes de venta por artículo (cr=33)",
                    url=URL_REPORTE_2,
                )

            if args.paso == 3 or args.todos:
                descargar_reporte_runner(
                    page,
                    num_paso=3,
                    titulo="Detalle de ventas por artículo (cr=268)",
                    url=URL_REPORTE_3,
                )

            if args.paso == 4 or args.todos:
                # A diferencia de los reportes 2 y 3 (desde fijo "01/01/2026"), este va del 1 de
                # enero del año en curso a hoy: el PO/cantidades solo interesa del año actual.
                descargar_reporte_runner(
                    page,
                    num_paso=4,
                    titulo="Informe de órdenes de venta por artículo, PO y Cantidades (cr=327)",
                    url=URL_REPORTE_4,
                    desde=f"01/01/{datetime.now().year}",
                )
        finally:
            context.close()

    if args.subir:
        print("\n=== SUBIENDO REPORTES AL CRM (subir_ordenes_netsuite.js) ===")
        subprocess.run(
            ["node", "--env-file=.env", "scripts/subir_ordenes_netsuite.js"],
            cwd=str(BASE_DIR),
            check=True,
        )


if __name__ == "__main__":
    main()
