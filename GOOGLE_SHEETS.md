# Google Sheets · Configuración y validación de EAS-GO

La integración usa SQLite como fuente de verdad y Google Sheets como destino. No importa datos operativos desde la hoja ni sustituye los módulos existentes. El nombre actual del sistema es EAS-GO.

Estado de esta entrega: implementación local y pruebas con API simulada; lectura humana y exportación del documento oficial realizadas sin editarlo. La autorización real OAuth y las pruebas de escritura siguen pendientes de la configuración manual. Las escrituras están deshabilitadas por defecto. No considerar la integración puesta en producción hasta completar la prueba autorizada de lectura y escritura en una copia.

## 1. Autenticación actual: OAuth o ADC sin claves privadas

La política iam.disableServiceAccountKeyCreation se conserva. Seguir GOOGLE_OAUTH.md para configurar un cliente OAuth web, consentimiento, usuarios de prueba, PKCE, cifrado y URI de callback. No generar ni solicitar un JSON de cuenta de servicio. La cuenta de Google autorizada debe tener acceso a la hoja; Drive API permite comprobar canEdit antes de escribir.

## 2. Ejecutar con la nueva configuración

Completar las variables de .env.example siguiendo GOOGLE_OAUTH.md. Mantener GOOGLE_SHEETS_WRITES_ENABLED=false. En desarrollo abrir http://localhost:3000 y registrar http://localhost:3000/api/conexion/google/callback en el cliente web. Detener la instancia existente con Ctrl+C, compilar y volver a iniciar. OAuth no requiere GOOGLE_APPLICATION_CREDENTIALS.

## 3. Documento y comparación inicial

Documento oficial: https://docs.google.com/spreadsheets/d/1m3OPL0wTDH11yepS4m-SsEPOllk2OnNx5xEUVGZBL7M/edit

Pestaña: **EAS PRODUCTIVIDAD**. Encabezados inspeccionados en fila **3**, identidad en B–F, kilometrajes G–L y actividades M–Z. La copia de referencia y la exportación actual del documento tienen 12.871 filas físicas, las mismas cinco pestañas, las mismas combinaciones y 21.674 fórmulas en la pestaña principal. La comparación de valores y fórmulas detectó **I9047: vacía en la copia de referencia; `54.688` en la exportación en línea**. No se modificó esa celda. Estos resultados corresponden al momento de inspección; la API debe comprobar de nuevo el documento actual.

Los metadatos y hashes de la referencia están en `data/sheets-reference.json`; el informe inicial en `data/sheets-reference.json.comparison.json`. Ambos están fuera de Git. `lib/sheets-layout-candidate.json` conserva solo el diseño candidato y códigos institucionales, sin registros operativos.

Para regenerar la referencia desde otro Excel: ejecutar `scripts/inspect-sheets-reference.py ARCHIVO.xlsx data/sheets-reference.json` con Python y openpyxl instalados. Es de solo lectura; expande fórmulas compartidas y guarda hashes, no valores de registros. Un tercer argumento opcional permite comparar otra exportación XLSX y generar el informe. No comparar contra una copia distinta sin revisión del administrador.

La validación API compara encabezados exactos y filas hash contra la referencia. Cualquier diferencia se muestra en CONEXIÓN y exige revisión/aprobación. El cambio de mapeo invalida la aprobación previa. Las diferencias de representación de fórmulas entre XLSX y Google también pueden producir filas distintas: deben revisarse, no aprobarse por volumen automáticamente.

## 4. Pantalla CONEXIÓN

Exclusiva del administrador en el menú superior actual del sistema. Dashboard Operativo e Informes siguen al final; Registro Operativo sigue siendo la pantalla inicial. Usuarios EAS reciben 403 en las rutas de este módulo aunque manipulen parámetros.

A. Configuración: guardar ID, pestaña, fila de encabezado y mapeos. PROBAR CONEXIÓN hace una lectura API real; una URL configurada no significa conexión activa. Lectura y escritura tienen estados separados: la escritura no se declara disponible solo por poder leer.

B. VER MAPEO: corregir columna, encabezado esperado e ID de actividad. VALIDAR ESTRUCTURA vuelve a leer los encabezados y muestra errores y diferencias contra Excel. Revisar y justificar antes de Aprobar comparación y estructura.

C. Equivalencias: asignar manualmente cada estación al código exacto leído. Ejemplos de candidatos: URDESA → EAS01-URDESA; LOMAS DE URDESA → EAS02-LOMAS DE URDESA; CEIBOS → EAS12-CEIBOS. No se aplican automáticamente. Configurar también el número exacto de cada móvil en Sheets. El catálogo de estados conserva las variantes de texto configuradas sin convertirlas a cero; textos desconocidos bloquean la propuesta.

D. LOCALIZAR CELDAS: fecha operativa + ID de estación mapeada + ID de móvil mapeado. La fila se busca en cada consulta; nunca se conserva como ID permanente. Sin coincidencia o con varias coincidencias se bloquea, sin insertar filas.

E. SIMULAR TRANSFERENCIA: solo lectura de Google y auditoría local de preview. Muestra celdas exactas, valor anterior, contribución de la jornada y valor final de las tres jornadas. Previews personales válidas durante diez minutos; cambios de origen, configuración, encabezado, fila o valores obligan a volver a simular. Para un histórico numérico no conocido, Conciliar valor exige base histórica, justificación y confirmación de que la base excluye EAS-GO. La conciliación es local: no escribe en Sheets. Datos de procedencia desconocida deben permanecer bloqueados hasta una conciliación real.

F. HISTORIAL: usuario, estación, móvil, fecha operativa, jornada, registros procesados, celdas confirmadas, resultado, errores y plan completo. RECUPERAR solo lee Google; no reenvía escrituras a ciegas.

## 5. Mapeo candidato

| Columnas | Campo / regla |
|---|---|
| B, C, D, E, F | Fecha, mes, estación, móvil y turno: solo lectura |
| G / H | Matutina: KM entrada / salida |
| I / J | Vespertina: KM entrada / salida |
| K / L | Amanecida: KM entrada / salida |
| M | OPERATIVOS |
| N | RETIROS TEMPORALES (RT) |
| O | LEVANTAMIENTO DE INDIGENTES |
| P | RETENIDOS POR ROBO O AGRESIÓN |
| Q | RESCATE ANIMAL |
| R | ACM HERIDO |
| S | RETIRO DE COVACHA |
| T | RUIDOS MOLESTOSOS |
| U | MALA DISPOSICIÓN DE BASURA |
| V | ATENCIÓN PARAMÉDICA |
| W | DESALOJO DE LIBADORES/CONSUMIDORES |
| X | COLABORACIÓN CON OTRAS INSTITUCIONES |
| Y | MALA DISPOSICIÓN DE DESECHOS |
| Z | REQUERIMIENTOS |

El backend usa IDs internos de actividad tras aprobar el mapeo. Los nombres aproximados no son una regla de transferencia. Actividades con registros y sin columna vinculada bloquean la transferencia del grupo; no se envían a una columna genérica. No se crean nuevas columnas automáticamente.

## 6. Acumulación, históricos y kilometraje

Total = base histórica explícitamente conciliada + COUNT de registros vigentes de Matutina, Vespertina y Amanecida para fecha operativa/estación/móvil/actividad. Las tres contribuciones se recalculan en SQLite. Repetir una transferencia sin cambios no suma otra vez; ediciones y eliminaciones se reflejan al recalcular. La tabla de contribuciones es auditoría de lo confirmado, no una segunda fuente operativa.

Sin historial de sincronización, cualquier valor existente (incluso cero) exige conciliación; un vacío puede recibir el conteo desde base cero. Un valor que cambió externamente desde la última confirmación bloquea la actualización. Los registros históricos SIN JORNADA deben resolverse expresamente y no se clasifican usando el reloj actual. Amanecida utiliza la fecha operativa ya guardada.

Solo se proponen las dos lecturas del servicio de la jornada seleccionada. No se suman odómetros ni se rellenan faltantes con cero. Fórmulas, combinaciones, rangos protegidos y validaciones de destino bloquean la propuesta. Los textos de estado se conservan. La API envía únicamente valores RAW a las celdas necesarias; no cambia formatos, encabezados, reglas ni otras pestañas.

## 7. Activar una prueba real autorizada

1. Configurar en CONEXIÓN el ID de una **copia autorizada de prueba**, no el documento oficial. Dar permiso Editor sobre esa copia a la cuenta de Google que autoriza OAuth.
2. PROBAR CONEXIÓN, completar equivalencias, VALIDAR ESTRUCTURA, revisar diferencias y aprobar. Conciliar históricos si existen. Elegir un grupo que ya tenga una fila única compatible.
3. SIMULAR y revisar todas las celdas propuestas. Resolver bloqueos.
4. Solo después de la autorización del administrador, detener el servidor y establecer `$env:GOOGLE_SHEETS_WRITES_ENABLED = 'true'`; volver a ejecutar `npm start`.
5. Volver a simular; confirmar la vista previa y la coordinación de edición exclusiva; SINCRONIZAR. Verificar lectura posterior, historial y valores en la copia.
6. Repetir las pruebas de aceptación sobre la copia. Si todo está aprobado, evaluar por separado habilitar el documento oficial. Mantener el entorno en false hasta esa decisión; reiniciarlo tras cambiar variables.

No se realizó este paso en la entrega porque todavía faltan la autorización OAuth real y una copia de prueba autorizada. No se ejecutaron escrituras en el documento oficial.

## 8. Concurrencia y recuperación

Un bloqueo SQLite por documento/pestaña serializa transferencias y conciliaciones locales, también entre procesos. Un bloqueo de un proceso comprobado como finalizado puede recuperarse; un proceso vivo conserva el bloqueo. El historial se crea antes del envío y registra PENDIENTE si no se verifica el resultado. Una recuperación compara cada celda con el valor anterior y propuesto, confirma lo observado y permite volver a simular lo restante. Valores externos inesperados mantienen el bloqueo lógico del historial para conciliación manual. No hay reintentos automáticos de escritura después de un error de transporte.

Google Sheets no ofrece una comparación y escritura condicional por celda equivalente a una transacción SQLite. Las comprobaciones antes/después detectan conflictos, pero no eliminan la ventana entre lectura y escritura frente a editores externos. Por eso se requiere coordinar edición exclusiva durante la transferencia; no se afirma garantizar exclusión frente a humanos, Apps Script u otras integraciones.

Lecturas con timeout y reintentos acotados para 429/5xx. Hasta 50.000 filas y columnas B:Z por lectura, divididas en bloques de 2.000 filas; rangos mayores quedan bloqueados. No hay sincronización automática en segundo plano y los guardados operativos locales no dependen de Google.

Referencias de API: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get y https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate

## 9. Rutas, archivos y verificación

Rutas protegidas: GET /api/conexion/estado y /historial; PUT /configuracion; POST /probar, /validar, /aprobar-estructura, /localizar, /simular, /conciliar, /sincronizar, /recuperar. POST/PUT requieren CSRF y sesión de administrador.

Backend: lib/google-sheets-client.js, lib/sheets-sync.js, lib/sheets-layout-candidate.json, server.js y migrations/014_google_sheets.sql. Interfaz: src/connection.jsx, src/consolidados.jsx, public/consolidados.js (generado), public/app.js, public/style.css, public/index.html. Referencia: scripts/inspect-sheets-reference.py. Dependencia oficial google-auth-library, cargada solo al usar la API. Pruebas: test/sheets-sync.test.js.

Ejecutar npm test. Las pruebas automatizadas usan una API simulada y bases en memoria, sin escribir Google ni modificar datos reales. Cubren acumulación 5→9→9→11→14, eliminaciones, KM por jornada, fechas/estaciones separadas, idempotencia, filas duplicadas, columnas desplazadas, fórmulas, rangos protegidos, combinaciones, validaciones, históricos, valores externos, cambios de origen, recuperación, concurrencia y permisos. Las pruebas reales de API en una copia continúan pendientes hasta disponer de la configuración indicada.
