# Guía de Configuración de Acceso API en Oracle NetSuite (TBA / OAuth 1.0a)

Esta guía explica paso a paso cómo configurar Oracle NetSuite para permitir conexiones seguras desde scripts y herramientas externas usando **Token-Based Authentication (TBA)**.

---

## 1. Habilitar Características de Integración (Features)

1. En NetSuite, ve a **Setup > Company > Enable Features** (Configuración > Empresa > Habilitar características).
2. Ve a la pestaña **SuiteCloud**.
3. Asegúrate de que las siguientes opciones estén marcadas:
   - **REST Web Services** (Servicios web REST)
   - **Token-Based Authentication** (Autenticación basada en tokens)
   - **SuiteQL**
   - *(Opcional)* **Client SuiteScript** / **Server SuiteScript** (Si usas RESTlets)
4. Haz clic en **Save** (Guardar).

---

## 2. Crear o Configurar un Rol con Permisos API

Es recomendable usar un rol dedicado para integraciones:

1. Ve a **Setup > Users/Roles > Manage Roles > New**.
2. Asigna un nombre al rol (ej: `API Integration Role`).
3. En la sección **Permissions**:
   - **Setup**:
     - *User Access Tokens*: Full / Lleno
     - *REST Web Services*: Full / Lleno
     - *SuiteApp Marketplace*: View (si aplica)
   - **Lists / Transactions / Reports**: Asigna los permisos de lectura (`View`) o escritura (`Edit`/`Full`) necesarios según los registros que consultará la API (ej: *Customers*, *Sales Orders*, *Invoices*, *Items*).
4. En **Subsidiaries**, asigna acceso a las subsidiarias requeridas.
5. Guarda el rol.

---

## 3. Asignar el Rol al Usuario

1. Ve a **Setup > Users/Roles > Manage Users**.
2. Selecciona el usuario que se conectará vía API.
3. Edita el usuario, ve a la pestaña **Access** y agrega el rol creado (`API Integration Role`).
4. Guarda los cambios.

---

## 4. Crear un Registro de Integración (Integration Record)

1. Ve a **Setup > Integration > Manage Integrations > New**.
2. Configura los siguientes campos:
   - **Name**: `Antigravity NetSuite Integration`
   - **State**: `ENABLED`
   - **Token-based Authentication**: Check (marcado)
   - **TBA: Authorization Flow**: Uncheck (Desmarcado para usar Tokens manuales)
3. Haz clic en **Save**.
4. > ⚠️ **CRÍTICO**: Al guardar, NetSuite mostrará **Consumer Key** y **Consumer Secret** por **ÚNICA VEZ**. Cópialos y guárdalos inmediatamente.

---

## 5. Generar Access Token (Token ID y Token Secret)

1. En el buscador global de NetSuite, busca `page: tokens` o ve a **Setup > Users/Roles > Access Tokens > New**.
2. Configura:
   - **Application Name**: Selecciona el Registro de Integración creado (`Antigravity NetSuite Integration`).
   - **Role**: Selecciona el rol de integración (`API Integration Role`).
   - **User**: Selecciona el usuario correspondiente.
   - **Token Name**: `Antigravity Token`
3. Haz clic en **Save**.
4. > ⚠️ **CRÍTICO**: NetSuite mostrará **Token ID** y **Token Secret** por **ÚNICA VEZ**. Guardálos de forma segura.

---

## 6. Variables de Entorno para Antigravity

Define las credenciales en tu archivo `.env` o en tu entorno de terminal:

```bash
export NETSUITE_ACCOUNT_ID="1234567"          # O 1234567_SB1 para Sandbox
export NETSUITE_CONSUMER_KEY="tu_consumer_key"
export NETSUITE_CONSUMER_SECRET="tu_consumer_secret"
export NETSUITE_TOKEN_ID="tu_token_id"
export NETSUITE_TOKEN_SECRET="tu_token_secret"
```

*(Nota: Para encontrar tu `NETSUITE_ACCOUNT_ID`, consulta la URL de tu NetSuite, ej: `1234567.app.netsuite.com` -> El Account ID es `1234567`)*.
