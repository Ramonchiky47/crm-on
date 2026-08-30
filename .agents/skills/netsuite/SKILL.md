---
name: netsuite
description: >-
  Habilidad para autenticarse, consultar y operar en Oracle NetSuite mediante REST Web Services,
  SuiteQL y RESTlets usando Token-Based Authentication (TBA / OAuth 1.0a HMAC-SHA256).
---

# Habilidad de Integración con Oracle NetSuite (`netsuite`)

Esta habilidad proporciona las instrucciones, herramientas y utilidades necesarias para interactuar de forma segura con la API de **Oracle NetSuite**. Permite ejecutar **consultas SQL (SuiteQL)**, invocar **RESTlets** y manipular **registros REST** (clientes, facturas, artículos, transacciones, etc.).

---

## Requisitos de Variables de Entorno

Para autenticarse en NetSuite con **Token-Based Authentication (TBA)**, se requieren las siguientes variables de entorno:

```bash
NETSUITE_ACCOUNT_ID="1234567"          # O 1234567_SB1 para entornos Sandbox
NETSUITE_CONSUMER_KEY="<tu_consumer_key>"
NETSUITE_CONSUMER_SECRET="<tu_consumer_secret>"
NETSUITE_TOKEN_ID="<tu_token_id>"
NETSUITE_TOKEN_SECRET="<tu_token_secret>"
```

*(Si no has configurado tus credenciales en NetSuite, consulta la guía de configuración en [setup_guide.md](./references/setup_guide.md)).*

---

## Flujo de Trabajo y Comandos

El script principal de interacción se encuentra en [scripts/netsuite_client.py](./scripts/netsuite_client.py).

### 1. Ejecutar Consultas SuiteQL

Para consultar la base de datos de NetSuite mediante SQL:

```bash
python3 .agents/skills/netsuite/scripts/netsuite_client.py suiteql "SELECT id, entityid, companyname, email FROM customer WHERE rownum <= 10"
```

### 2. Consultar Registros por REST Web Services (GET / POST / PATCH)

Para obtener un registro específico (ejemplo: un cliente o transacción por su ID):

```bash
python3 .agents/skills/netsuite/scripts/netsuite_client.py get /services/rest/record/v1/customer/123
```

Para crear o actualizar un registro:

```bash
python3 .agents/skills/netsuite/scripts/netsuite_client.py post /services/rest/record/v1/customer --data '{"companyName": "Empresa Ejemplo SA de CV", "subsidiary": "1"}'
```

### 3. Invocar RESTlets Personalizados

Para llamar a un RESTlet desplegado en NetSuite:

```bash
python3 .agents/skills/netsuite/scripts/netsuite_client.py restlet --script 100 --deploy 1 --method GET
```

---

## Referencias Útiles

- **Guía de Configuración e Integración NetSuite**: [references/setup_guide.md](./references/setup_guide.md)
- **Consultas y Cheatsheet SuiteQL**: [references/suiteql_cheatsheet.md](./references/suiteql_cheatsheet.md)
