# Prompt de traspaso — EAS-GO (antes REDEAS)

Copia desde aquí para continuar con otra IA. No incluye contraseñas ni claves.

---

Actúa como desarrollador del proyecto existente EAS-GO, anteriormente llamado REDEAS. Continúa el proyecto sin reconstruirlo, duplicar información ni borrar datos. Tu siguiente objetivo es diseñar e implementar, con autorización del propietario, su conexión con Google Sheets. Antes de cambiar código, inspecciona README.md, las migraciones, los tests y los archivos reales: este documento describe el estado al 31/10/2026 y puede quedar desactualizado.

## Entorno y ejecución

- Proyecto Windows: `C:\Users\ASUS\Desktop\SEGURA EP\PROYECTOS\EASGO`.
- Node.js 24.15.0, ESM, servidor HTTP nativo en `server.js`, SQLite mediante `node:sqlite`.
- Se mantiene SQLite por decisión explícita del propietario. No migrar a PostgreSQL ni agregar Docker.
- Instalar con `npm install`; arrancar con `npm start` o `node server.js`; dirección `http://localhost:3000`.
- Si aparece EADDRINUSE, comprobar el proceso del puerto. Detener con Ctrl+C en la terminal que ya lo ejecuta antes de iniciar otro. No dejar servidores de producción en segundo plano: esto ya causó conflictos al propietario.
- SQLite por defecto: `data/redeas.sqlite`. Conservar esta ruta aunque el nombre visible cambie a EAS-GO: cambiarla podría abrir una base vacía. Existen respaldos en `backups/`; crear un respaldo consistente antes de migrar. DB_PATH y PORT permiten configuración.
- Sesión en memoria, cookie HttpOnly/SameSite, CSRF para escrituras. Reiniciar el servidor cierra sesiones. No exponerlo públicamente sin preparar el despliegue.
- No imprimir secretos, hashes de contraseñas, cookies ni tokens. No alterar cuentas o claves existentes.

## Arquitectura

- `public/app.js`: frontend principal JavaScript nativo, login, navegación superior común, CRUD, roles, temas, radioperadores, alertas, popups e Informes.
- `public/style.css`: estilos compartidos y responsive; colores por EAS.
- `src/consolidados.jsx`: montaje de diario/semanal, filtros y actualizaciones.
- `src/weekly-summary.jsx`: resumen semanal React aislado, ilustraciones SVG propias y catálogo real.
- `src/weekly-capture.js`: captura a PNG con html2canvas; los SVG se rasterizan primero para no perder iconos en la exportación. También se usa para la tabla diaria tras esta actualización.
- `scripts/build-ui.mjs` genera `public/consolidados.js`. Editar fuentes de src y ejecutar `npm run build`; no editar solo el bundle.
- `public/operatividad.js`: tabla diaria horizontal y edición de servicios de móviles.
- `public/reportar.js`: cartilla WhatsApp, novedades, radioperador del reporte, captura/copiar/descargar PNG.
- `lib/consolidados.js`, `lib/operatividad.js`, `lib/jornada-actual.js`, `lib/servicio-entrante.js`, `lib/mantenimiento.js`, `lib/reportes.js`, `lib/colores.js`, `lib/usuarios.js`.
- `lib/informes.js`: seis informes, filtros, agregaciones y CSV. `lib/informe-pdf.js`: PDFKit cargado bajo demanda, tablas paginadas y gráficos.
- `migrations/001_initial.sql` hasta `012_informes.sql`, aplicadas al iniciar. Consultar su contenido exacto.
- `test/`: pruebas reales de permisos, históricos, CRUD, jornadas, ingreso de flota, informes y exportaciones. Antes del cambio de marca/captura diaria había 33 pruebas aprobadas. Consultar el resultado más reciente de `npm test`.
- `npm test` recompila y ejecuta Node test runner con concurrencia 2 para limitar consumo de memoria.

## Reglas funcionales que deben conservarse

1. Administradores: todas las estaciones, crear usuarios EAS y administradores, asignar estaciones, actividades, colores y radioperadores. Entran directamente sin popups de radioperador/móviles.
2. Usuarios EAS: ámbito derivado de la sesión, nunca confiar en estacion_id libre. eas1 pertenece a URDESA. Hay más estaciones/usuarios en la base real: no eliminarlos ni restablecer semillas.
3. No hay móviles predeterminados. Placa y número únicos globalmente. Móviles: placa, número, kilometraje, combustible y novedades. Combustible: Lleno, 3/4, 1/2, 1/4, Reserva.
4. Actividades: catálogo único administrable, activo/inactivo. Originalmente 14 opciones exactas; el administrador puede ampliarlo. No crear otro catálogo ni arrays fijos para contar. No borrar actividades con registros. Conservar nombres históricos de registros.
5. Registro Operativo: fecha, hora editable, móvil, actividad, ubicación, detalle y acciones editar/eliminar; Incidente permanece eliminado. Jornada/fecha operativa se asignan en backend y se conservan al editar.
6. Jornada según reloj del servidor America/Guayaquil: Matutina 06:00–13:59, Vespertina 14:00–21:59, Amanecida 22:00–05:59. Antes de las 06:00, fecha operativa del día anterior. Horarios oficiales de presentación: 06:00–14:30, 14:00–22:30, 22:00–06:30. No reclasificar históricos cuando cambia la jornada.
7. Login EAS: seleccionar/crear radioperador; Siguiente abre ingreso de TODOS los móviles de la estación. Cada móvil requiere conductor, jefe de patrulla, kilometraje entrante y combustible. Guardar y siguiente continúa pendientes; al terminar todos abre Registro Operativo.
8. El progreso se calcula desde servicios_moviles para estación/fecha/jornada, no desde una bandera de sesión. Al cambiar jornada se solicita nuevamente la flota completa. Hay comprobación programada con hora del servidor, consulta cada 15 segundos y al recuperar foco. Un formulario de jornada anterior se rechaza sin escribir datos en la nueva.
9. Omitir solo se permite cuando TODOS los móviles de esa jornada están completos, útil al reingresar. Mantener esa comprobación backend. Un móvil nuevo se incorpora a los pendientes. Si no hay móviles, permitir registrarlos sin inventarlos.
10. Guardar ingreso actualiza móvil y servicio en una transacción; no duplica servicio por estación/fecha/jornada/móvil, no inventa kilometraje saliente y conserva observaciones/salida existentes.
11. Diario: tabla por jornada/móvil; conductor, jefe, KM entrada/salida, actividades dinámicas y observaciones, totales y SIN MÓVIL. El título OPERATIVIDAD EAS [estación] no lleva fecha al lado. Conservar filtros históricos.
12. Semanal: lunes a domingo. Resumen institucional ilustrado antes de gráficos, actividades en dos bloques, nombres/orden del catálogo, conteos reales, ceros incluidos; positivo rojo y cero azul. Conservar tablas, gráficos, indicadores y REPORTAR.
13. REPORTAR: cartilla WhatsApp con asteriscos, mínimo dos dígitos y catálogo único, selección de radioperador, novedades por estación/período/jornada con autor y control de versión. Copiar texto; captura PNG para copiar al portapapeles o descargar. No generar cantidades manuales.
14. Colores: cada actividad y EAS tiene color #RRGGBB administrable con paleta y contraste. Títulos, tablas, botones y gráficos adoptan tema EAS; preservar colores propios de actividades.
15. Alertas aceite: faltando <=500 km para el siguiente múltiplo de 5000, según kilometraje guardado; en múltiplo exacto corresponde cambio. Se muestran en Móviles y debajo de la tabla operativa con icono de precaución parpadeante, respetando movimiento reducido. No hay historial real de cambios de aceite realizados.
16. Eliminar usuarios retira acceso, oculta cuenta y revoca sesiones; conserva autoría e históricos. No eliminar propia cuenta ni último administrador. No reutilizar nombres eliminados.
17. Radioperadores: catálogo de nombre completo/estado/estaciones múltiples, directorio responsive, búsqueda sin tildes, filtros, edición/activar/desactivar para admin; EAS solo su estación y alta local.
18. Ubicaciones: nombre/estación y tipo ubicacion o consigna. Clasificar preserva nombre y estación históricos.

## Informes existentes

Menú Informes con seis opciones, todas PDF y CSV, filtros desde/hasta/estación y máximo 366 días:
- Gestión de tres jornadas: todos los movimientos, móvil, hora, actividad, ubicación y novedades.
- Diario: responsables, kilometrajes y cantidades por móvil/jornada, detalle de actividades y novedades.
- Móviles: flota/circulación, combustible, novedades, próximo mantenimiento. Tanqueo significa nivel registrado; no existen litros ni comprobantes.
- Ubicaciones/consignas: catálogo y sectores con más actividades, gráfico.
- Semanal: EAS/actividad/día, totales, KM por móvil y comparación con el mismo día de la semana anterior; gráfico de barras.
- Radioperadores: asignación/creación, actividades por jornada/móvil y ranking.

API GET /api/informes?tipo=gestion|diario|moviles|ubicaciones|semanal|radioperadores&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&formato=json|pdf|csv.
CSV UTF-8 BOM, comas, comillas escapadas, protección de fórmulas, columnas de metadatos y sección. Filtrar por sección antes de sumar: detalle/resúmenes son distintas vistas, no eventos adicionales.
La identificación del radioperador se guarda al crear un registro nuevo en radiooperador_id y radiooperador_nombre; editar conserva esa autoría. Históricos anteriores quedan sin identificar: NO atribuirlos por deducción. Los KM ausentes quedan vacíos, no se estiman.

## Siguiente objetivo: Google Sheets

La integración con Google Sheets todavía NO está implementada. No hay credenciales configuradas para ella. No asumir que el CSV equivale a sincronización.

Primero inspecciona el proyecto y confirma con el propietario:
- Documento de Google Sheets de destino y hojas esperadas.
- Método de autorización que el propietario puede proporcionar y dónde ejecutar el servidor.
- Dirección y alcance de la sincronización. Recomendación a validar: SQLite como fuente de verdad y Sheets como espejo para visualización. No implementar importación bidireccional ni reemplazar SQLite sin autorización expresa.
- Datos autorizados, periodicidad y comportamiento al editar/eliminar registros.

Después implementa la conexión usando documentación oficial actual de Google. Configura secretos exclusivamente en backend mediante variables de entorno/almacenamiento seguro fuera del control de versiones. Nunca incluir claves/tokens en frontend, CSV, capturas o este prompt. Pide al usuario introducir sus secretos por un mecanismo seguro, sin imprimirlos.

Usa IDs estables para reconciliar filas (tabla + ID + estación, y claves operativas en agregados). La sincronización debe ser idempotente: repetirla no duplica filas. Reflejar altas, ediciones y eliminaciones; conservar autoría, fechas operativas y roles. No crear registros operativos ni cambiar servicios para sincronizar. Si hace falta una cola de cambios, diseñarla como infraestructura de sincronización, no como un segundo catálogo o una segunda base de registros.

Respetar el ámbito EAS en el backend y en cualquier hoja/vista compartida: un usuario EAS no debe obtener datos de otras estaciones manipulando parámetros ni compartiendo una hoja global. Solo el administrador configura la integración global. Mostrar conexión/última sincronización/errores y permitir reintento. Gestionar desconexiones y límites de Google sin bloquear el guardado local; prevenir ejecuciones concurrentes duplicadas.

Prueba con adaptadores simulados antes de Google real: idempotencia, altas/ediciones/eliminaciones, permisos, reconexión, reintentos y cambios de jornada/nocturnos. Ejecuta npm test y verifica que no se pierdan ni dupliquen datos. No subir la base real o datos personales a servicios externos sin autorización explícita del propietario.

Entrega cambios concretos y documenta configuración y comandos. Conserva la UI, el nombre EAS-GO, la arquitectura y todas las funciones existentes.

## Actualización de esta entrega

Se completó el cambio de marca visible de REDEAS a EAS-GO y la captura PNG de la tabla del Consolidado Diario. La imagen aparece al inicio de REPORTAR, permite copiar al portapapeles y descargar PNG. Se recompiló public/consolidados.js; npm test: 33 pruebas aprobadas. Verificado en navegador con base de prueba en memoria: imagen visible y portapapeles con image/png. La captura muestra todas las columnas y totales, sin botones de edición. Archivos principales: src/weekly-capture.js, src/consolidados.jsx y public/reportar.js. No renombrar automáticamente data/redeas.sqlite, canales internos o claves de datos por el cambio de marca.

## Fase 3 posterior a este resumen

Ya está implementado Dashboard Operativo: lib/dashboard.js (SQL agregado, alcance EAS, snapshot transaccional), src/dashboard.jsx (React, KPI/filtros/gráficos SVG/tablas), y GET /api/dashboard/resumen con filtros y formato=json|csv. Reutiliza WeeklyOperationsSummary con encabezado opcional resumen_nombre. La migración 013_dashboard agrega registros.ubicacion_id nullable e índices, sin inferir ubicaciones históricas. Registro Operativo guarda ese ID cuando el usuario elige ubicación del catálogo. CSV exporta todo el detalle filtrado y agregados diferenciados por seccion. Ver README sección Fase 3 y test/dashboard.test.js. Hay 36 pruebas aprobadas. Se conserva SQLite como fuente de verdad y Google Sheets corresponde a Fase 4; no se ha configurado ninguna conexión ni credencial Google. El backup anterior es backups/redeas-antes-dashboard-*.sqlite. Reiniciar la instancia existente con Ctrl+C, npm run build, npm start y Ctrl+F5 para aplicar la migración; no iniciar otro servidor en el mismo puerto.

## Estado posterior: Fase 4 implementada localmente, activación pendiente

Leer GOOGLE_SHEETS.md e INFORME_COMPARACION_SHEETS.md antes de continuar. El usuario solicitó integrar la hoja existente (Spreadsheet ID 1m3OPL0wTDH11yepS4m-SsEPOllk2OnNx5xEUVGZBL7M, pestaña EAS PRODUCTIVIDAD) mediante cuenta de servicio. Ya existen lib/google-sheets-client.js, lib/sheets-sync.js, lib/sheets-layout-candidate.json, src/connection.jsx, migración 014_google_sheets.sql y rutas /api/conexion/*. Se agregó google-auth-library oficial en backend. Hay configuración, validación, comparación con referencia Excel, mapeos, simulación, conciliación, sincronización confirmada/auditada y recuperación. Google Sheets sigue sin ser una segunda fuente operativa: SQLite conserva la verdad.

La copia Excel se encontró en Descargas; se abrió la hoja oficial sin editarla y se descargó una exportación de lectura. Coinciden pestañas, encabezados, combinaciones y 21.674 fórmulas de B–Z. Hay una diferencia: I9047 estaba vacía en Excel y muestra 54.688 en la exportación actual. No interpretar automáticamente ese texto. scripts/inspect-sheets-reference.py expande fórmulas compartidas y crea data/sheets-reference.json (hashes por fila, no registros). El administrador debe revisar las diferencias y validar por API antes de autorizar escrituras.

El usuario respondió que necesita instrucciones para crear la cuenta de servicio; se entregan en GOOGLE_SHEETS.md. Todavía NO hay archivo JSON configurado en GOOGLE_APPLICATION_CREDENTIALS ni enlace de copia autorizada para pruebas. GOOGLE_SHEETS_WRITES_ENABLED debe seguir false hasta que complete esos pasos y revise una vista previa concreta. Nunca escribir en el documento oficial durante pruebas. No declarar conexión real funcionando ni Fase 4 puesta en producción sin prueba autenticada de lectura/escritura en una copia autorizada. Se ejecutaron 42 pruebas automatizadas con una API simulada y bases en memoria, sin datos de prueba en la base real. Hay respaldo previo en backups/redeas-antes-google-sheets-*.sqlite.

Limitación: Sheets no ofrece compare-and-set por celda. El módulo verifica valores antes y después y exige coordinación de edición exclusiva; no afirmar exclusión garantizada frente a editores humanos o integraciones externas. Los bloqueos SQLite cubren procesos del servidor. Los históricos desconocidos, fórmulas, protecciones, combinaciones y validaciones bloquean la propuesta; no se insertan filas ni se cambia ninguna otra pestaña. Registro Operativo sigue siendo la pantalla inicial y Dashboard Operativo/Informes siguen al final del menú.
