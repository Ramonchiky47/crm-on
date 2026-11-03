---
name: carga_informacion
description: >-
  Habilidad para autenticar en el portal web de Oracle NetSuite (https://system.netsuite.com/pages/customerlogin.jsp),
  descargar automáticamente los 3 reportes de Excel ("Vista predeterminada Transacción", "Detalle de órdenes de venta por artículo"
  y "Detalle de ventas por artículo") y subirlos al CRM.
---

# Habilidad de Descarga y Carga de Reportes NetSuite (`carga_informacion`)

Esta habilidad automatiza con **Playwright** el inicio de sesión en el portal web de **Oracle NetSuite** (cuenta `8223897`), la descarga de los **3 reportes en Excel** hacia `/Users/ramonvillanueva/Downloads/descargas netsuite` y su carga al CRM mediante `scripts/subir_ordenes_netsuite.js`.

---

## 1. Los 3 Reportes Automatizados

1. **Paso 1 — Vista predeterminada Transacción (Órdenes de venta)**
   - **URL**: `https://8223897.app.netsuite.com/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=SalesOrd`
   - **Archivo generado**: `VistapredeterminadaTransacción*.xlsx`
   - **Endpoint CRM**: `/api/ordenes/importar-excel-netsuite`

2. **Paso 2 — Detalle de órdenes de venta por artículo (Detalle de compra, `cr=33`)**
   - **URL**: `https://8223897.app.netsuite.com/app/reporting/reportrunner.nl?cr=33&whence=`
   - **Rango de fechas**: `01/01/2026` al día actual (`#crit_1_from` y `#crit_1_to` + clic en `#refresh`)
   - **Archivo generado**: `Detalledeórdenesdeventaporartículo*.xlsx`
   - **Endpoint CRM**: `/api/detalle-compra/importar-excel-netsuite`

3. **Paso 3 — Detalle de ventas por artículo (Facturación, `cr=268`)**
   - **URL**: `https://8223897.app.netsuite.com/app/reporting/reportrunner.nl?cr=268&whence=`
   - **Rango de fechas**: `01/01/2026` al día actual (`#crit_1_from` y `#crit_1_to` + clic en `#refresh`)
   - **Archivo generado**: `Detalledeventasporartículo*.xlsx`
   - **Endpoint CRM**: `/api/facturacion/importar-excel-netsuite`

---

## 2. Credenciales y Cambio Periódico de Contraseña

Las credenciales se almacenan en `.env`:

```env
NETSUITE_EMAIL="rvillanueva@gonpal.com.mx"
NETSUITE_PASSWORD="Fernandito2026"
NETSUITE_SEC_INFANCIA="moncho"
```

- La sesión del navegador queda persistida en `.netsuite_session/`.
- **Importante**: Dado que la contraseña de NetSuite cambia cada cierto tiempo, si el script detecta el mensaje *"Ha introducido una dirección de correo electrónico o una contraseña no válida"* (o si el usuario desea confirmarla antes de correr), solicita la nueva contraseña al usuario y pásala con `--password "<nueva>"` (lo cual actualiza automáticamente `.env`).
- Si NetSuite muestra otra pregunta de seguridad distinta a *"¿Cuál era su alias en la infancia?"*, pregunta la respuesta al usuario y regístrala en `NETSUITE_SEC_EXTRA="palabra_clave:respuesta"` en `.env`.

---

## 3. Comandos de Ejecución

### Descargar los 3 reportes y subirlos al CRM en un solo paso:
```bash
python3 scripts/descargar_reportes_netsuite.py --todos --subir
```

### Descargar preguntando antes si cambió la contraseña (modo interactivo en terminal):
```bash
python3 scripts/descargar_reportes_netsuite.py --todos --subir --preguntar-password
```

### Actualizar contraseña y descargar:
```bash
python3 scripts/descargar_reportes_netsuite.py --todos --subir --password "NuevaPassword2026"
```

### Ejecutar reporte por reporte (de menor a mayor):
```bash
python3 scripts/descargar_reportes_netsuite.py --paso 1
python3 scripts/descargar_reportes_netsuite.py --paso 2
python3 scripts/descargar_reportes_netsuite.py --paso 3
```

### Solo subir al CRM los archivos más recientes ya descargados:
```bash
node --env-file=.env scripts/subir_ordenes_netsuite.js
```
