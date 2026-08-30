# SuiteQL Cheatsheet & Consultas Comunes de NetSuite

**SuiteQL** es el lenguaje de consulta SQL de Oracle NetSuite para realizar búsquedas optimizadas en tablas de la base de datos mediante la REST API `/services/rest/query/v1/suiteql`.

---

## Consultas Básicas

### Consultar Clientes (Customer)
```sql
SELECT 
    id, 
    entityid AS codigo_cliente, 
    companyname AS nombre_empresa, 
    email, 
    phone, 
    datecreated 
FROM 
    customer 
WHERE 
    isinactive = 'F' 
ORDER BY 
    id DESC
```

### Consultar Proveedores (Vendor)
```sql
SELECT 
    id, 
    entityid AS codigo_proveedor, 
    companyname AS nombre_proveedor, 
    email 
FROM 
    vendor 
WHERE 
    isinactive = 'F'
```

### Consultar Transacciones / Facturas (Invoices & Sales Orders)
```sql
SELECT 
    t.id, 
    t.tranid AS numero_documento, 
    t.trandate AS fecha, 
    t.type AS tipo_transaccion, 
    c.companyname AS cliente, 
    t.foreignamountunpaid AS saldo_pendiente, 
    t.foreigntotal AS total 
FROM 
    transaction t 
JOIN 
    customer c ON c.id = t.entity 
WHERE 
    t.type IN ('CustInvc', 'SalesOrd') 
    AND t.trandate >= '2026-01-01'
```

### Consultar Artículos e Inventario (Item & Inventory)
```sql
SELECT 
    item.id, 
    item.itemid AS codigo_sku, 
    item.displayname AS descripcion, 
    item.itemtype AS tipo_item, 
    locationlocationbalance.quantityonhand AS existencia
FROM 
    item 
LEFT JOIN 
    locationlocationbalance ON locationlocationbalance.item = item.id 
WHERE 
    item.isinactive = 'F'
```

---

## Consejos de Paginación y Rendimiento en SuiteQL

1. **Límite de Resultados**: Usa `ROWNUM` o paginación por offset:
   ```sql
   SELECT id, entityid, companyname FROM customer WHERE ROWNUM <= 50
   ```
2. **Encabezado HTTP `Prefer: transient`**: Siempre incluye `'Prefer': 'transient'` en las peticiones HTTP POST a SuiteQL para habilitar la ejecución directa y rápida de consultas analíticas.
3. **Paginación REST**: Pasa `limit=1000` y `offset=0` en los parámetros de la URL del endpoint `/services/rest/query/v1/suiteql?limit=1000&offset=0`.
