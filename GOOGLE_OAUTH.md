# OAuth de Google Sheets en EAS-GO

La política `iam.disableServiceAccountKeyCreation` permanece intacta. La opción predeterminada es OAuth 2.0 Authorization Code con PKCE mediante una cuenta de Google autorizada. No se solicitan ni generan claves privadas JSON de cuentas de servicio.

Estado de entrega: implementación y pruebas automatizadas con servicios simulados; la autorización real de Google y la prueba de escritura en una copia siguen pendientes de la configuración manual. Mantener GOOGLE_SHEETS_WRITES_ENABLED=false.

## 1. Configuración manual en Google Cloud Console

1. Abrir https://console.cloud.google.com/ y seleccionar el proyecto del cliente OAuth. Puede reutilizar el cliente web existente si está bajo su administración; usar un secreto nuevo si el anterior fue compartido en el chat. El secreto previo no se incorporó al proyecto.
2. En **APIs y servicios → Biblioteca**, habilitar **Google Sheets API** y **Google Drive API**. Drive solo se usa para consultar metadatos y `capabilities.canEdit` del documento seleccionado; no se descarga el contenido de otros archivos ni se enumeran sus documentos.
3. Abrir **Google Auth Platform** (o **APIs y servicios → Pantalla de consentimiento OAuth**, según la interfaz). Configurar **Branding / Información de la aplicación**: nombre EAS-GO, correo de soporte y contacto del desarrollador. Completar los datos que solicite Google para el proyecto.
4. En **Audience / Público**, elegir **Interno** únicamente si la organización de Google Workspace lo permite y las cuentas pertenecen a ella. En caso contrario usar **Externo** y dejar **Testing / Prueba** durante la validación.
5. Si es Externo/Testing, agregar en **Test users / Usuarios de prueba** el correo exacto del administrador que conectará EAS-GO. Ese usuario debe poder acceder al documento oficial y tener permiso de Editor sobre la copia autorizada para pruebas de escritura. La selección de usuario de prueba no concede acceso a la hoja por sí misma.
6. En **Data Access / Acceso a datos**, registrar solamente los scopes usados por la aplicación:
   - `openid` y `email`: verificar identidad y mostrar la cuenta conectada; no se solicita perfil completo.
   - `https://www.googleapis.com/auth/spreadsheets`: leer y actualizar los valores necesarios de Google Sheets.
   - `https://www.googleapis.com/auth/drive.metadata.readonly`: consultar el permiso de edición de la hoja exacta. Es solo metadatos y no permite modificar Drive. Google Sheets API no publica `canEdit`, por lo que esta comprobación requiere Drive API. No se solicita `drive`, `drive.readonly` ni permiso de escritura general de Drive.
7. En **Clients / Clientes → Crear cliente**, elegir **Aplicación web**. También se puede editar el cliente web existente. No elegir cuenta de servicio ni aplicación de escritorio.
8. Configurar estos valores para uso local, exactamente:

   Origen de JavaScript autorizado: `http://localhost:3000`

   URI de redirección autorizada: `http://localhost:3000/api/conexion/google/callback`

   Aunque el intercambio ocurre en backend y no utiliza el SDK de Google en el navegador, dejar el origen identificado como arriba facilita la configuración del cliente. La URI completa es obligatoria; el origen no la sustituye.
9. Guardar el **Client ID** y **Client secret** en variables del servidor o un gestor de secretos. No pegarlos en componentes React, código público, Git ni en el chat. No descargar una clave de cuenta de servicio para este flujo.
10. Para publicación externa, revisar las verificaciones de Google correspondientes a los scopes y políticas de la organización. Si Google bloquea la autorización por políticas, solicitar la aprobación del administrador de Workspace; no deshabilitar las políticas como alternativa.

Guía oficial: https://developers.google.com/identity/protocols/oauth2/web-server

## 2. Variables y ejecución local

Abrir EAS-GO en **http://localhost:3000**, no en 127.0.0.1 si la URI OAuth usa localhost. Son hosts diferentes para las cookies.

Detener primero la instancia existente con Ctrl+C. Configurar en la misma terminal de PowerShell:

```powershell
$env:GOOGLE_AUTH_MODE = 'oauth'
$env:GOOGLE_OAUTH_CLIENT_ID = 'SU_CLIENT_ID.apps.googleusercontent.com'
$env:GOOGLE_OAUTH_CLIENT_SECRET = 'SU_SECRETO_NUEVO'
$env:GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/conexion/google/callback'
$env:GOOGLE_SHEETS_WRITES_ENABLED = 'false'
$env:EAS_GO_SHEETS_REFERENCE_PATH = '.\data\sheets-reference.json'
```

Generar **una sola vez** una clave de cifrado, localmente:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Copiar ese resultado a la variable del servidor y guardarlo en un gestor de secretos o configuración local restringida:

```powershell
$env:GOOGLE_TOKEN_ENCRYPTION_KEY = 'PEGAR_AQUI_LA_CLAVE_BASE64_GENERADA'
npm install
npm run build
npm start
```

No regenerar la clave en cada inicio. Una clave distinta impide descifrar los tokens existentes. No compartirla ni guardarla junto con la base de datos en un repositorio.

Alternativa: completar un `.env` privado a partir de `.env.example` y ejecutar `node --env-file=.env server.js`. `npm start` utiliza las variables de su terminal; no carga `.env` automáticamente. `.env` y las carpetas de datos están excluidos de Git. Client ID no es un secreto; client secret y la clave de cifrado sí lo son.

El destino y la pestaña siguen guardados en SQLite y se modifican en CONEXIÓN. Una variable de Spreadsheet ID no sobrescribe el mapeo guardado. El documento oficial continúa siendo `1m3OPL0wTDH11yepS4m-SsEPOllk2OnNx5xEUVGZBL7M` y la pestaña `EAS PRODUCTIVIDAD` mientras el administrador no cambie esa configuración.

## 3. Restricción de acceso al almacenamiento

Los tokens se guardan mediante AES-256-GCM en `google_oauth_tokens`, dentro de la base SQLite privada del sistema. La clave se obtiene del entorno y no se guarda en SQLite. Ni los tokens ni la clave aparecen en respuestas HTTP, JavaScript público, URLs de retorno, historial de sincronización o mensajes de error.

La tabla no tiene una ruta de descarga y sus metadatos administrativos requieren sesión de administrador. Mantener la carpeta `data`, las copias de seguridad y el archivo `.env` accesibles solo por la cuenta que ejecuta EAS-GO y los administradores autorizados.

En Windows, revisar las ACL de esas rutas antes de desplegar. Si la aplicación se ejecuta con su usuario actual, estos comandos restringen las carpetas y el `.env` a ese usuario y SYSTEM; ejecutarlos desde la carpeta del proyecto, comprobar primero la cuenta correcta y adaptar el nombre si se usa otra identidad de servicio:

```powershell
whoami
icacls .\data
icacls .\data /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" "SYSTEM:(OI)(CI)F"
# Solo si existe .env:
icacls .\.env /inheritance:r /grant:r "$($env:USERNAME):F" "SYSTEM:F"
```

Aplicar una restricción equivalente a la carpeta de backups. No aplicar estas ACL a carpetas ajenas ni quitar acceso a la identidad que realmente ejecuta el servidor. En Linux, usar directorios privados y archivos de datos/secretos con permisos 600 para el usuario del servicio. En Google Cloud, usar Secret Manager para client secret y la clave de cifrado; restringir IAM al servicio que ejecuta EAS-GO. Respaldar base y clave por canales protegidos separados.

## 4. Flujo administrativo

1. Iniciar sesión como administrador y abrir **CONEXIÓN**. Registro Operativo sigue siendo la pantalla inicial; Dashboard e Informes siguen al final del menú.
2. Presionar **CONECTAR CON GOOGLE**. El servidor valida configuración, crea state, PKCE S256, nonce e información temporal ligada a esa sesión por diez minutos.
3. Seleccionar la cuenta autorizada en Google y revisar los permisos. La persona propietaria de la cuenta realiza el consentimiento.
4. Google vuelve al callback del backend. Se valida state, sesión activa y rol actual del administrador, código de un solo uso, PKCE, firma/audiencia/vigencia del ID token mediante la biblioteca oficial, nonce y correo verificado.
5. El servidor cifra tokens y vuelve a CONEXIÓN mediante una redirección limpia, sin tokens ni códigos en el URL de la pantalla de aplicación.
6. Presionar **PROBAR CONEXIÓN**. Se comprueba lectura real por Sheets API y permiso de edición por Drive API sobre el ID exacto. Tener una cuenta autorizada no equivale a poder leer la hoja; poder leerla tampoco equivale a poder editarla.
7. Volver a validar estructura y mapeos y revisar la comparación con Excel. Cambiar la autorización invalida previews y validaciones anteriores, sin borrar los mapeos ni históricos.
8. Para pruebas de escritura, configurar **una copia autorizada**, simular y revisar cada celda. Mantener el entorno false hasta completar las autorizaciones y controles de prueba existentes. El motor no permite escribir si `canEdit` no es verdadero y lo vuelve a comprobar antes del envío.
9. **DESCONECTAR** solicita revocación a Google y elimina la autorización cifrada local. Si falla la revocación remota, la interfaz lo indica y debe retirarse el acceso desde la cuenta de Google. No se borran registros, contribuciones ni historial operativo.

La cookie de sesión existente sigue siendo SameSite=Strict. Para el retorno desde Google se usa una cookie separada HttpOnly, SameSite=Lax, de diez minutos y limitada a la ruta del callback; en HTTPS es Secure. Esa cookie no contiene tokens de Google. El callback solo admite la sesión administrativa original todavía activa. Cerrar sesión o desactivar al usuario invalida la autorización pendiente. Reiniciar el servidor invalida los flujos pendientes, pero los tokens cifrados ya guardados pueden renovarse después de volver a iniciar sesión.

## 5. Renovación, revocación y errores

Los access tokens próximos a vencer se renuevan exclusivamente en backend y una renovación concurrente se comparte por generación de autorización. Refresh tokens nuevos se guardan cifrados; si Google no devuelve otro, se conserva el anterior. Una renovación que termina después de desconectar o reemplazar la cuenta no puede restaurar la autorización anterior.

Si Google devuelve `invalid_grant` o rechaza definitivamente un token, se borra la autorización utilizable, se invalidan las validaciones y se pide reconectar. Fallos de red temporales no se presentan como revocaciones. No hay reintentos automáticos de escrituras tras errores de autenticación/transporte; se conserva el proceso de recuperación y auditoría existente.

Errores comunes:

- **Configuración pendiente**: completar las variables del cliente web y la clave de cifrado.
- **redirect_uri_mismatch / invalid_client**: comprobar el cliente web, secreto vigente y URI exacta (host, protocolo, puerto y ruta). No pegar el secreto en el mensaje de error ni en el chat.
- **Abra EAS-GO desde localhost**: usar el mismo origen que la URI, sin alternar con 127.0.0.1.
- **Estado inválido o vencido**: volver a iniciar la conexión desde la sesión administrativa; no reutilizar el URL del callback.
- **Acceso bloqueado**: revisar audiencia, usuarios de prueba y aprobación de Workspace. No debilitar la política que prohíbe claves de servicio.
- **Lectura disponible, edición denegada/no comprobada**: revisar el permiso Editor sobre esa hoja, los scopes concedidos y que Drive API esté habilitada. No se envía una escritura para probar permisos sobre la hoja oficial.
- **No se pudo descifrar**: restaurar la clave de cifrado original. Si se perdió definitivamente, desconectar la autorización local y reconectar; no borrar la base operativa.

## 6. Despliegue posterior en Google Cloud sin claves descargadas

Configurar `GOOGLE_AUTH_MODE=adc`. Adjuntar al servicio de ejecución una identidad de servicio administrada con los permisos mínimos de la aplicación y acceso a la hoja. No establecer GOOGLE_APPLICATION_CREDENTIALS ni descargar una clave de cuenta de servicio; el proveedor ADC obtiene credenciales renovables de la identidad adjunta. Habilitar Sheets API y Drive API y compartir la hoja con esa identidad según su función.

La identidad no necesita roles de propietario del proyecto para acceder a una hoja compartida. El acceso al archivo se controla también desde Google Workspace. En este modo no se usa CONECTAR/DESCONECTAR OAuth: la identidad se administra en el despliegue y PROBAR CONEXIÓN comprueba el acceso real.

Para OAuth en un dominio publicado, usar HTTPS, cambiar el origen y callback en Google Cloud, y configurar:

```text
APP_PUBLIC_ORIGIN=https://su-dominio.example
GOOGLE_OAUTH_REDIRECT_URI=https://su-dominio.example/api/conexion/google/callback
```

El servidor solo confía en ese origen configurado; no deriva el origen público de cabeceras X-Forwarded-* arbitrarias. Mantener GOOGLE_SHEETS_WRITES_ENABLED=false hasta terminar las pruebas en la copia autorizada.

La modalidad antigua `GOOGLE_AUTH_MODE=service_account` se conserva únicamente por compatibilidad con instalaciones previas; no es requerida ni recomendada para resolver la política de esta organización. Las instrucciones actuales no solicitan una clave privada JSON.

ADC oficial: https://cloud.google.com/docs/authentication/application-default-credentials
Permiso canEdit: https://developers.google.com/workspace/drive/api/guides/file-metadata

## 7. Archivos, rutas y pruebas

Migración no destructiva `015_google_oauth.sql`: almacenamiento cifrado de la autorización. Se conservan mapeos B–Z, localización por fecha/estación/móvil, contribuciones por jornada, kilometrajes, simulaciones, conciliaciones e historial.

Nuevos archivos: lib/google-authorization.js, migrations/015_google_oauth.sql, test/google-oauth.test.js y esta guía. Adaptados: lib/google-sheets-client.js, lib/sheets-sync.js (estado/permiso de edición), server.js, src/connection.jsx, public/app.js, public/index.html, public/consolidados.js generado y .env.example.

Rutas administrativas:

- GET /api/conexion/google/estado: solo estado, correo y mensajes seguros; nunca tokens.
- POST /api/conexion/google/conectar: requiere sesión y CSRF; devuelve URL de consentimiento.
- GET /api/conexion/google/callback: valida flujo temporal y sesión administrativa original, aunque la cookie Strict no venga en el regreso desde Google.
- POST /api/conexion/google/desconectar: requiere sesión y CSRF; revoca y elimina autorización local.

Se mantienen las rutas de CONEXIÓN anteriores. npm test incluye pruebas OAuth simuladas de PKCE, state inválido/vencido/repetido, ausencia de cookie, sesión cerrada, nonce inválido, cifrado autenticado, renovación concurrente, revocación, desconexión, renovación posterior a desconexión, rol EAS denegado, CSRF, origen y permiso canEdit. Estas pruebas no constituyen una autorización real de Google ni una escritura real sobre una copia.
