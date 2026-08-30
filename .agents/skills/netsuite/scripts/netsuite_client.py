#!/usr/bin/env python3
"""
NetSuite API Client Helper (Token-Based Authentication - OAuth 1.0a HMAC-SHA256)

Uso:
  python3 netsuite_client.py suiteql "SELECT id, entityid, companyname, email FROM customer WHERE rownum <= 5"
  python3 netsuite_client.py get /services/rest/record/v1/customer/123
  python3 netsuite_client.py restlet https://123456.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=100&deploy=1 --data '{"param":"val"}'
"""

import os
import sys
import json
import time
import uuid
import hmac
import hashlib
import base64
import argparse
from urllib.parse import quote, urlparse, parse_qsl, urlencode
import urllib.request
import urllib.error


def load_dotenv():
    # Cargar .env si existe en la ruta actual o en la raíz del proyecto
    for path in ['.env', os.path.join(os.path.dirname(__file__), '../../../.env')]:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        k = k.strip()
                        v = v.strip().strip('\"\'')
                        if k not in os.environ:
                            os.environ[k] = v

load_dotenv()

def get_env_var(var_name, default=None):
    return os.environ.get(var_name, default)



def generate_oauth_header(
    http_method: str,
    url: str,
    account_id: str,
    consumer_key: str,
    consumer_secret: str,
    token_id: str,
    token_secret: str
) -> str:
    """
    Genera el encabezado 'Authorization: OAuth ...' para NetSuite TBA (HMAC-SHA256)
    """
    # Formatear el realm de NetSuite (Sandbox usa guión bajo en vez de guión, ej: 1234567_SB1)
    realm = account_id.replace('-', '_').upper()
    
    # Parámetros OAuth básicos
    nonce = uuid.uuid4().hex + uuid.uuid4().hex[:8]
    timestamp = str(int(time.time()))
    
    oauth_params = {
        'oauth_consumer_key': consumer_key,
        'oauth_token': token_id,
        'oauth_nonce': nonce,
        'oauth_timestamp': timestamp,
        'oauth_signature_method': 'HMAC-SHA256',
        'oauth_version': '1.0',
    }
    
    # Extraer la URL base (sin query string) y los query params de la URL dada
    parsed_url = urlparse(url)
    base_url = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
    
    # Combinar parámetros de la URL y parámetros OAuth para la firma Base String
    query_params = parse_qsl(parsed_url.query, keep_blank_values=True)
    all_params = sorted(query_params + list(oauth_params.items()))
    
    # Normalizar parámetros con percent-encoding (RFC 3986)
    def percent_encode(val):
        return quote(str(val), safe='~')
    
    param_string = "&".join(f"{percent_encode(k)}={percent_encode(v)}" for k, v in all_params)
    
    # Crear Signature Base String
    base_string = f"{http_method.upper()}&{percent_encode(base_url)}&{percent_encode(param_string)}"
    
    # Crear Key para HMAC-SHA256
    signing_key = f"{percent_encode(consumer_secret)}&{percent_encode(token_secret)}"
    
    # Calcular Firma HMAC-SHA256
    hashed = hmac.new(signing_key.encode('utf-8'), base_string.encode('utf-8'), hashlib.sha256)
    signature = base64.b64encode(hashed.digest()).decode('utf-8')
    
    oauth_params['oauth_signature'] = signature
    
    # Construir Header Authorization
    auth_header_parts = [f'realm="{percent_encode(realm)}"']
    for k, v in sorted(oauth_params.items()):
        auth_header_parts.append(f'{percent_encode(k)}="{percent_encode(v)}"')
        
    return "OAuth " + ", ".join(auth_header_parts)


class NetSuiteClient:
    def __init__(
        self,
        account_id: str = None,
        consumer_key: str = None,
        consumer_secret: str = None,
        token_id: str = None,
        token_secret: str = None
    ):
        self.account_id = account_id or get_env_var('NETSUITE_ACCOUNT_ID')
        self.consumer_key = consumer_key or get_env_var('NETSUITE_CONSUMER_KEY')
        self.consumer_secret = consumer_secret or get_env_var('NETSUITE_CONSUMER_SECRET')
        self.token_id = token_id or get_env_var('NETSUITE_TOKEN_ID')
        self.token_secret = token_secret or get_env_var('NETSUITE_TOKEN_SECRET')
        
        # Validar credenciales
        missing = []
        if not self.account_id: missing.append('NETSUITE_ACCOUNT_ID')
        if not self.consumer_key: missing.append('NETSUITE_CONSUMER_KEY')
        if not self.consumer_secret: missing.append('NETSUITE_CONSUMER_SECRET')
        if not self.token_id: missing.append('NETSUITE_TOKEN_ID')
        if not self.token_secret: missing.append('NETSUITE_TOKEN_SECRET')
        
        if missing:
            print(f"Error: Faltan las siguientes variables de entorno o parámetros: {', '.join(missing)}", file=sys.stderr)
            print("Por favor defínelas en tu entorno o en un archivo .env", file=sys.stderr)
            sys.exit(1)
            
        # Formatear el hostname base para NetSuite REST Web Services
        # Ej: 1234567 -> 1234567.suitetalk.api.netsuite.com
        # Ej: 1234567-sb1 -> 1234567-sb1.suitetalk.api.netsuite.com
        account_domain = self.account_id.lower().replace('_', '-')
        self.base_domain = f"{account_domain}.suitetalk.api.netsuite.com"

    def request(self, method: str, url_or_path: str, data=None, headers=None) -> dict:
        if url_or_path.startswith('http://') or url_or_path.startswith('https://'):
            full_url = url_or_path
        else:
            path = url_or_path if url_or_path.startswith('/') else '/' + url_or_path
            full_url = f"https://{self.base_domain}{path}"

        auth_header = generate_oauth_header(
            http_method=method,
            url=full_url,
            account_id=self.account_id,
            consumer_key=self.consumer_key,
            consumer_secret=self.consumer_secret,
            token_id=self.token_id,
            token_secret=self.token_secret
        )

        req_headers = {
            'Authorization': auth_header,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
        if headers:
            req_headers.update(headers)

        payload = None
        if data is not None:
            if isinstance(data, (dict, list)):
                payload = json.dumps(data).encode('utf-8')
            elif isinstance(data, str):
                payload = data.encode('utf-8')
            elif isinstance(data, bytes):
                payload = data

        req = urllib.request.Request(full_url, data=payload, headers=req_headers, method=method.upper())

        try:
            with urllib.request.urlopen(req) as resp:
                resp_data = resp.read().decode('utf-8')
                if not resp_data:
                    return {"status": resp.status, "message": "Success (empty response)"}
                try:
                    return json.loads(resp_data)
                except json.JSONDecodeError:
                    return {"status": resp.status, "raw_response": resp_data}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8')
            try:
                err_json = json.loads(err_body)
                print(f"HTTP Error {e.code}: {json.dumps(err_json, indent=2)}", file=sys.stderr)
            except Exception:
                print(f"HTTP Error {e.code}: {err_body}", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"Error de conexión: {str(e)}", file=sys.stderr)
            sys.exit(1)

    def suiteql(self, query: str, limit: int = 1000, offset: int = 0) -> dict:
        url = f"https://{self.base_domain}/services/rest/query/v1/suiteql?limit={limit}&offset={offset}"
        headers = {
            'Prefer': 'transient'
        }
        body = {
            'q': query
        }
        return self.request('POST', url, data=body, headers=headers)

    def restlet(self, script_id: str, deploy_id: str, method: str = 'GET', payload=None) -> dict:
        # Formato de URL de RESTlet
        restlet_host = self.base_domain.replace('suitetalk', 'restlets')
        url = f"https://{restlet_host}/app/site/hosting/restlet.nl?script={script_id}&deploy={deploy_id}"
        return self.request(method, url, data=payload)


def main():
    parser = argparse.ArgumentParser(description="Cliente NetSuite API con Token-Based Authentication (OAuth 1.0a)")
    subparsers = parser.add_subparsers(dest='command', help='Comando a ejecutar')

    # Subcomando SuiteQL
    sql_parser = subparsers.add_parser('suiteql', help='Ejecutar una consulta SuiteQL')
    sql_parser.add_argument('query', help='Sentencia SQL de SuiteQL (ej: "SELECT * FROM customer")')
    sql_parser.add_argument('--limit', type=int, default=1000, help='Límite de registros (default: 1000)')
    sql_parser.add_argument('--offset', type=int, default=0, help='Offset para paginación (default: 0)')

    # Subcomando REST GET
    get_parser = subparsers.add_parser('get', help='Realizar una petición GET a un endpoint de REST Web Services')
    get_parser.add_argument('path', help='Ruta o URL completa (ej: /services/rest/record/v1/customer/10)')

    # Subcomando REST POST
    post_parser = subparsers.add_parser('post', help='Realizar una petición POST a un endpoint REST')
    post_parser.add_argument('path', help='Ruta o URL completa')
    post_parser.add_argument('--data', required=True, help='Payload JSON string')

    # Subcomando RESTlet
    restlet_parser = subparsers.add_parser('restlet', help='Invocar un RESTlet')
    restlet_parser.add_argument('--script', required=True, help='ID numérico o script ID del RESTlet')
    restlet_parser.add_argument('--deploy', required=True, help='ID numérico o deployment ID del RESTlet')
    restlet_parser.add_argument('--method', default='GET', choices=['GET', 'POST', 'PUT', 'DELETE'], help='Método HTTP')
    restlet_parser.add_argument('--data', help='Payload JSON string para POST/PUT')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    client = NetSuiteClient()

    if args.command == 'suiteql':
        res = client.suiteql(args.query, limit=args.limit, offset=args.offset)
        print(json.dumps(res, indent=2, ensure_ascii=False))
    elif args.command == 'get':
        res = client.request('GET', args.path)
        print(json.dumps(res, indent=2, ensure_ascii=False))
    elif args.command == 'post':
        payload = json.loads(args.data)
        res = client.request('POST', args.path, data=payload)
        print(json.dumps(res, indent=2, ensure_ascii=False))
    elif args.command == 'restlet':
        payload = json.loads(args.data) if args.data else None
        res = client.restlet(script_id=args.script, deploy_id=args.deploy, method=args.method, payload=payload)
        print(json.dumps(res, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
