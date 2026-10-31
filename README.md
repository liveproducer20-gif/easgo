# EAS-GO · Fases 1 y 2

Aplicación con Node.js 24 y SQLite. Los informes PDF se generan localmente con PDFKit. Se creó desde cero porque la carpeta de trabajo no contenía una aplicación anterior.

## Ejecutar en Windows

1. Instalar Node.js 24 o superior.
2. Abrir PowerShell en esta carpeta.
3. Ejecutar `npm install` y después `npm start` (o `node server.js`).
4. Abrir http://localhost:3000.

En el primer inicio se imprimen contraseñas aleatorias para `admin` y `eas1`. Guardarlas: no vuelven a mostrarse. Opcionalmente definir `ADMIN_PASSWORD` y `EAS1_PASSWORD` como variables de entorno antes del primer inicio. Cambiarlas después no modifica las cuentas existentes. La base queda en `data/redeas.sqlite`; no publicarla ni agregarla al control de versiones. `DB_PATH` permite otra ubicación y `PORT` otro puerto.

El servidor escucha únicamente en la computadora local. Antes de exponerlo a Internet hacen falta HTTPS, gestión de contraseñas y recuperación de cuentas, y configuración de despliegue. Las sesiones duran ocho horas, residen en memoria y se cierran al reiniciar el servidor.

## Funcionalidad

- URDESA y usuario eas1 asignado; ningún móvil predeterminado.
- Administrador: estaciones, creación y asignación de usuarios EAS, catálogo global, móviles y registros de todas las estaciones.
- Usuario EAS: consulta, alta y modificación exclusivamente dentro de su estación. El backend valida tanto los identificadores enviados como la estación del registro existente.
- Móviles con placa, número, kilometraje no negativo, combustible y novedades.
- Las 14 actividades solicitadas se cargan una sola vez. Las desactivadas no admiten registros nuevos. Los registros guardan el nombre de la actividad al seleccionarla: renombrar o desactivar el catálogo conserva el historial. Actividades utilizadas no se eliminan físicamente.
- Registro Operativo con edición dentro de la tabla y selectores obtenidos de SQLite.
- Contraseñas con scrypt y sal aleatoria, cookies HttpOnly/SameSite, protección CSRF, consultas parametrizadas y límite de intentos de acceso.

## Decisiones iniciales pendientes de contrastar con el proyecto original

No se recibieron las columnas previamente aprobadas ni reglas de identificación anteriores. Se establecen inicialmente Fecha, EAS, # de Móvil, Actividad y Detalle, sin Incidente. Las placas son únicas globalmente, se normalizan a mayúsculas quitando espacios y guiones y admiten de 5 a 10 caracteres alfanuméricos. El número de móvil es único globalmente, admite de 1 a 20 caracteres alfanuméricos y conserva ceros iniciales. Confirmar estas reglas antes de importar datos reales.

No hay datos de CEIBOS en esta instalación nueva. No se incluye una eliminación automática de bases externas: antes de migrarlas debe determinarse qué información es operativa y qué información es de prueba.

La imagen aportada se usa como fondo del inicio de sesión. Incluye su propio formulario dibujado; el formulario real de la aplicación se superpone sobre el fondo.

## Migraciones y verificación

`migrations/001_initial.sql` define el esquema. `server.js` aplica el esquema y registra la inicialización en `migraciones` dentro de una transacción, sin volver a cargar actividades eliminadas o modificadas en inicios posteriores. Hacer copia de seguridad de SQLite con el servidor detenido antes de modificar el esquema.

Ejecutar `npm test` (o `node --test`). Las pruebas usan SQLite en memoria y HTTP real: permisos por estación y rol, duplicados, kilometraje, selección de móviles, actividades nuevas/inactivas/reactivadas, históricos, eliminación restringida y CSRF.

El Registro Operativo incluye Ubicación editable y Hora automática de creación (HH:mm:ss, zona America/Guayaquil). La hora la asigna el servidor al crear si se deja vacía y permite editarla (HH:mm o HH:mm:ss). El instante de creación UTC se conserva aunque se corrija la hora. Se conserva también el instante de creación en UTC. La migración `002_registro_ubicacion_hora.sql` se aplica automáticamente al reiniciar, sin borrar datos. Los registros anteriores muestran «No disponible» en Hora porque su hora original no se almacenó; Ubicación puede completarse al editarlos.

Estructura: `server.js` contiene el servidor y API; `public/` la interfaz; `migrations/` el esquema; `test/` la verificación automatizada.

La migración 003 agrega el catálogo de Ubicaciones por estación e importa ubicaciones existentes sin alterar los registros. El menú Ubicaciones permite crear y consultar; el selector del registro permite elegir o agregar una nueva. Los registros conservan el texto de la ubicación. El botón Eliminar solicita confirmación y elimina definitivamente el registro; el backend impide editar o eliminar registros de otra estación.

La migración 004 agrega Radiooperadores por estación, sin nombres predeterminados. Al iniciar una sesión se abre un popup para seleccionar al radiooperador entrante. Si no hay nombres en la estación seleccionada, muestra «AGREGAR NUEVO RADIOPERADOR» y el cuadro para escribir su nombre. También se puede agregar un nombre desde la lista del popup o desde el menú Radiooperadores. El nombre seleccionado aparece en la cabecera y se conserva al recargar durante la misma sesión; al cerrar sesión y volver a entrar se solicita nuevamente. El administrador puede elegir estación y el usuario EAS solo puede crear, consultar y seleccionar nombres de su propia estación. La selección identifica la sesión; no modifica ni atribuye retroactivamente los registros históricos.

## Fase 2 · Consolidados Operativos

Se mantiene SQLite por indicación del usuario. No se requiere instalar PostgreSQL ni Docker. Las dependencias JavaScript se instalan con npm install.

- **Consolidado Diario:** fecha actual de Ecuador por defecto, estación del usuario, total de registros, móviles distintos, las actividades del catálogo de Administración con ceros y total general.
- **Consolidado Semanal:** selector de semana ISO, período de lunes a domingo, actividades acumuladas, siete totales diarios, gráfico de barras y móviles distintos de toda la semana.
- El administrador consulta todas las estaciones o filtra por una estación. El usuario EAS consulta únicamente su estación; cambiar un filtro a otra estación devuelve 403.
- No hay entradas de cantidades: todos los conteos proceden de `registros` mediante `COUNT`, `COUNT(DISTINCT ...)` y `GROUP BY` en SQLite. Una sola sentencia SQL entrega una instantánea consistente de todos los indicadores. No existe una tabla de registros consolidados.
- Los consolidados y REPORTAR usan directamente `actividades`, con sus mismos nombres y orden por ID, incluyendo actividades desactivadas con cantidad cero. Las actividades nuevas aparecen automáticamente y las eliminadas sin registros dejan de mostrarse. El nombre histórico guardado en cada registro permanece intacto. La migración 007 elimina las tablas auxiliares anteriores de categorías, clasificación y catálogo inicial; no duplica ni elimina registros operativos.
- El período usa el campo operativo `fecha`, una fecha de calendario de America/Guayaquil. No usa la fecha UTC de creación ni depende de la zona horaria del navegador o del servidor. La fecha operativa y la jornada se asignan al crear desde la hora del servidor y se conservan al editar; consultar otro día no reasigna registros.
- Cada consulta obtiene los datos confirmados actuales y responde `Cache-Control: no-store`. Cambiar fecha, semana, estación o pulsar Actualizar vuelve a consultar. Las pestañas de EAS-GO notifican los cambios confirmados del Registro Operativo mediante BroadcastChannel; el consolidado vuelve a consultar de inmediato. También se actualiza al recuperar el foco y cada 15 segundos mientras está visible para recoger cambios de otros clientes. Se muestran estados de carga, período vacío y error con reintento.

### Endpoints protegidos

`GET /api/consolidados/diario?fecha=YYYY-MM-DD`

`GET /api/consolidados/semanal?fecha=YYYY-MM-DD`

Si se omite `fecha`, se usa el día actual de Ecuador. En el semanal, cualquier día de la semana resuelve su lunes y domingo. Las fechas inválidas o duplicadas devuelven 400. Para el administrador, `&estacion_id=ID` filtra por una estación existente; sin filtro consulta todas. Un usuario EAS no puede cambiar el ámbito de su sesión mediante parámetros. Las respuestas incluyen `estacion`, `zona_horaria`, `inicio`, `fin`, `total_registros`, `moviles_participantes`, `actividades` y `totales_diarios`.

### Actualizar y verificar

Detener el servidor con Ctrl+C y ejecutar `npm start`. Las migraciones se aplican automáticamente conservando los registros. Recargar el navegador con Ctrl+F5. Los nuevos accesos aparecen en el menú lateral. Ejecutar `npm test` para verificar Fase 1 y Fase 2: edición, eliminación, actividades desactivadas o adicionales, días vacíos, semanas entre años, límites de fechas, móviles distintos, sesión y filtros por estación. No se implementó integración con Google Sheets.

## Botón REPORTAR y cartilla de WhatsApp

REPORTAR usa exclusivamente el catálogo de **Administración → Actividades**. No existe un catálogo adicional de categorías ni un paso de clasificación. Los mismos IDs, nombres y orden se usan en Administración, los consolidados y la cartilla. Todas las actividades aparecen con su cantidad del período, también en cero. Se mantiene SQLite según la decisión previa del usuario.

1. En **Radiooperadores**, el administrador puede crear y editar nombres completos, desactivar/reactivar y asignar estaciones. Se conservan las altas locales de EAS existentes de Fase 1; los usuarios EAS no pueden administrar estado ni asignaciones.
2. Abrir Consolidado Diario o Semanal. El administrador debe elegir una estación concreta para habilitar **REPORTAR**; los usuarios EAS usan la estación de su sesión.
3. **REPORTAR** abre la vista previa con el radioperador habilitado, las **NOVEDADES** y la cartilla. Escribir una novedad por línea y pulsar **Guardar novedades y actualizar vista previa**. Las novedades se guardan por estación y período con su autor, fecha de modificación y versión para evitar sobrescrituras de otros usuarios.
4. La cartilla conserva el circuito, radioperador, fecha o rango lunes–domingo y asteriscos para WhatsApp. Sus actividades proceden directamente de Administración. Las cantidades tienen al menos dos dígitos (00, 01, 15, 120) y cada registro se cuenta una sola vez por su actividad. Las novedades llevan un guion por línea; si están vacías se muestra **- SIN NOVEDADES**.
5. **Copiar reporte** vuelve a consultar los datos y validar permisos antes de copiar literalmente el texto. Si el navegador niega el portapapeles, seleccionar la cartilla y usar Ctrl+C. La aplicación no envía mensajes a WhatsApp.

### Migración y API

La migración 006 conserva radioperadores y añade estado, estaciones y novedades. La migración **007_catalogo_unico.sql** retira las tablas auxiliares anteriores (reporte_clasificacion, reporte_categorias y catalogo_inicial). No altera actividades, registros, radioperadores ni novedades. Los archivos de migraciones anteriores conservan su historia; las tablas auxiliares ya no existen en la base actualizada.

- GET /api/radiooperadores; GET /api/radiooperadores?all=1 incluye desactivados solo para administrador.
- POST /api/radiooperadores; PUT /api/radiooperadores/:id para edición administrativa.
- GET/PUT /api/reportes/diario/novedades?fecha=YYYY-MM-DD&estacion_id=ID; equivalente semanal. PUT recibe {texto,version}.
- GET /api/reportes/diario/vista-previa?fecha=YYYY-MM-DD&estacion_id=ID&radiooperador_id=ID; equivalente semanal.
- POST /api/reportes/diario/generar?fecha=YYYY-MM-DD&estacion_id=ID&radiooperador_id=ID; equivalente semanal. No guarda ni duplica conteos.

La antigua página de clasificación y su endpoint se retiraron. Todos los endpoints actuales requieren sesión, y las escrituras, CSRF. Para aplicar: Ctrl+C, npm start y Ctrl+F5. Ejecutar npm test para verificar catálogo único, altas/cambios/bajas de actividades, conteos y ceros, períodos, novedades, migraciones y permisos.

## Operatividad diaria por jornada y móvil

La semana se consulta siempre de **lunes a domingo**. El selector semanal permite elegir una fecha de referencia; la ajusta al lunes correspondiente y muestra explícitamente lunes–domingo en el rango, la tabla y REPORTAR. Los botones Semana anterior/siguiente cambian siete días. Esto evita depender de la presentación domingo–sábado del calendario semanal del navegador.

El diario muestra **OPERATIVIDAD EAS [ESTACIÓN] [FECHA]**, con una fila por estación, fecha operativa, jornada y móvil. Incluye jornada, móvil, conductor, jefe de patrulla ACM, kilometraje entrante/saliente, una columna por actividad del catálogo único y observaciones. La tabla utiliza todo el ancho disponible, distribuye dinámicamente las columnas sin desplazamiento horizontal y TOTAL suma las actividades. En pantallas pequeñas cada fila se organiza en bloques con sus etiquetas completas. Las filas de servicios sin eventos se muestran con ceros. Los indicadores incluyen actividades, móviles operativos y distancia calculada solo cuando existen ambos kilometrajes.

### Jornadas explícitas

- Matutina: 06:00–14:30.
- Vespertina: 14:00–22:30.
- Amanecida: 22:00–06:30.

Cada registro nuevo recibe automáticamente su jornada y fecha operativa desde el backend, usando exclusivamente el reloj del servidor en America/Guayaquil. Las ventanas de clasificación no se superponen: **06:00–13:59 Matutina**, **14:00–21:59 Vespertina**, **22:00–05:59 Amanecida**. Los horarios oficiales anteriores permanecen intactos y se muestran como referencia.

Entre medianoche y las 05:59:59, la fecha operativa es el día anterior; a las 06:00:00 empieza Matutina con la fecha local actual. Se contemplan los cambios de mes, año y años bisiestos. No se confía en fecha, jornada, hora del navegador ni valores de fecha/jornada enviados en la solicitud de alta. La hora editable del evento se conserva como funcionalidad, pero no cambia su clasificación.

Al editar un registro se conservan su fecha operativa, jornada e instante UTC de creación. Los registros anteriores **SIN JORNADA** permanecen así; no se infieren ni se recalculan por cambios del turno actual. SIN MÓVIL sigue generando una fila independiente por jornada.

### Servicio vehicular

Usar **Registrar servicio de móvil** o **Completar/Editar servicio** en Observaciones. Guardar estación, fecha operativa, jornada, móvil, conductor, jefe, kilometrajes y observaciones. Solo puede existir un servicio por estación/fecha/jornada/móvil. El kilometraje saliente debe ser mayor o igual al entrante; si todavía no se conoce, puede dejarse vacío. Crear o editar un servicio no crea, mueve ni copia actividades. Los nombres y kilometrajes se guardan en servicios_moviles y las cantidades siempre se calculan desde registros.

REPORTAR utiliza la fecha y la jornada seleccionadas. Se conservan radioperador y novedades, ahora separadas por jornada y período. Todas las jornadas mantiene las novedades generales anteriores; SIN JORNADA tiene un ámbito propio. Para ver los tres turnos y los registros anteriores juntos, elegir Todas las jornadas.

La migración **008_jornadas_servicios.sql** conserva IDs, fecha, hora, instante UTC, ubicación y nombre histórico de todos los registros; permite móvil nulo, añade jornada explícita y migra las novedades anteriores al ámbito general. No crea servicios predeterminados. Reiniciar con npm start aplica la migración; luego Ctrl+F5.

### API adicional

- GET /api/jornadas: las tres jornadas configuradas.
- GET /api/servicios con filtros fecha, estacion_id y jornada_id; POST /api/servicios; PUT /api/servicios/:id.
- Los registros nuevos reciben fecha operativa y jornada_id calculadas por el backend; no necesitan enviarlas. movil_id puede ser null. Las fechas/jornadas enviadas no reemplazan la asignación del servidor.
- GET /api/consolidados/diario?fecha=YYYY-MM-DD admite jornada_id y devuelve filas agrupadas, cantidades por actividad y datos de servicio. Omitir jornada_id consulta todas; jornada_id=sin consulta registros históricos sin jornada.
- Los endpoints de REPORTAR y novedades admiten el mismo filtro jornada_id. Las novedades generales y por jornada conservan sus versiones y autor de modificación.

El backend deriva la estación EAS de la sesión para leer o modificar servicios y registros. eas1 solo puede operar URDESA. El administrador puede consultar todas las estaciones y filtrar por una. Las pruebas comprueban filas únicas, jornadas superpuestas/nocturnas, SIN MÓVIL, ceros, totales, edición de servicios sin duplicar actividades, kilometraje, notas por jornada, límites semanales, permisos y conservación de históricos al migrar.

## Jornada actual y consulta histórica

GET **/api/jornada-actual**, con sesión autenticada, devuelve la hora local del servidor, fecha local, fecha operativa, jornada activa y sus horarios oficiales. El Registro Operativo muestra fecha y jornada de solo lectura, obtiene ambos del servidor al abrir y actualiza la referencia mientras está visible. La asignación definitiva siempre se calcula de nuevo al guardar, para cubrir un cambio de turno entre abrir el formulario y crear el registro.

El Consolidado Diario abre siempre en **Jornada actual** y la fecha operativa devuelta por el backend. En ese modo, las actualizaciones y el retorno al foco consultan la jornada activa del servidor. Cambiar la fecha o el selector **Consulta histórica / jornada** fija la consulta histórica elegida; las actualizaciones ya no sustituyen esa selección. El botón **Jornada actual** vuelve al seguimiento automático. Estos controles solo consultan: no escriben ni reclasifican registros. REPORTAR y las novedades siguen el ámbito visible.

Sin parámetros, GET /api/consolidados/diario devuelve el día operativo y turno actuales del servidor. Con fecha y/o filtros explícitos permite consultas históricas. No se necesita una migración ni una reasignación masiva: se usan las columnas existentes. Reiniciar el servidor con npm start y recargar con Ctrl+F5. Las pruebas simulan el reloj solo por inyección interna al crear una aplicación de prueba; no existe un parámetro HTTP para cambiar la hora.

## Interfaz institucional

El menú de módulos autorizados está en la parte superior en todas las pantallas autenticadas. En móvil se abre desde el botón de menú. No se agregan enlaces a módulos inexistentes. El título de la tabla diaria muestra OPERATIVIDAD EAS y la estación; la fecha permanece en su filtro, no junto a ese título. Los indicadores y botones del diario usan la paleta institucional azul.

Registro Operativo incluye tarjetas de fecha, jornada y reloj del servidor; formulario en dos filas con Limpiar y Crear registro; y una tabla con las únicas columnas Fecha, Hora, Móvil, Actividad, Ubicación, Detalle y Acciones. La jornada y estación siguen asociadas internamente. El administrador elige su estación de trabajo desde la navegación, fuera del formulario; los usuarios EAS mantienen su estación de sesión.

La consulta permite búsqueda sin distinción de tildes, fecha, filtros de móvil/actividad, Actualizar, Hoy y paginación de diez filas. Editar y Eliminar son iconos accesibles con tooltip; la edición continúa dentro de la tabla y la eliminación requiere la confirmación existente. Se conserva la creación de ubicaciones desde el selector o el botón de ubicación. Detalle admite hasta los 2000 caracteres que acepta el backend. La hora mostrada se sincroniza con la respuesta del servidor y avanza con un contador monotónico, sin usar el reloj local para clasificar jornadas.

El proyecto conserva JavaScript nativo en sus módulos existentes. El nuevo resumen semanal utiliza React compilado en un archivo local. Los informes PDF del servidor requieren PDFKit, incluido en package.json. Los SVG Lucide utilizados están incorporados localmente en app.js con su licencia en public/LUCIDE-LICENSE.txt. La verificación de sintaxis se realiza con node --check public/app.js y node --check public/operatividad.js; npm test verifica la lógica existente. Este rediseño no cambia el servidor, endpoints, modelos, autenticación ni permisos. Para ver los cambios de interfaz basta Ctrl+F5.


## Resumen visual semanal

El Consolidado Semanal muestra un resumen institucional ilustrado antes del gráfico y conserva los indicadores y tablas existentes. Las actividades se distribuyen en dos bloques según el orden del catálogo, incluidas las cantidades cero. La estación, el período de lunes a domingo y los conteos proceden del endpoint existente. REPORTAR permanece al final. No se duplican datos ni se modifican permisos o endpoints.

Fuentes de la interfaz: `src/consolidados.jsx` y `src/weekly-summary.jsx`. Para recompilar después de editarlas: `npm install` y `npm run build`. El archivo generado `public/consolidados.js` se incluye listo para usar con `npm start`. `npm test` recompila y ejecuta las pruebas. Para actualizar el navegador: Ctrl+F5.
### Imagen del reporte semanal

Al abrir REPORTAR en Consolidado Semanal se captura automáticamente el resumen institucional completo (estación, fechas, actividades y cantidades). La ventana conserva el texto para WhatsApp y añade vista previa, **Copiar imagen** y **Descargar PNG**. La imagen refleja el resumen al abrir la ventana; para obtener otra captura, cerrarla, actualizar el consolidado y volver a REPORTAR. No se almacena ni duplica información en la base de datos. El reporte diario conserva su funcionamiento.

La captura usa html2canvas incorporado en el archivo compilado, sin servicios externos. El portapapeles requiere un navegador compatible y acceso permitido en localhost o HTTPS. Si se bloquea, se puede descargar el PNG. La política de imágenes permite los formatos locales `data:` y `blob:` para representar las ilustraciones y la vista previa; las políticas de scripts y autenticación se conservan. Reiniciar el servidor con `npm start` y recargar con Ctrl+F5 para aplicar esta actualización.
## Colores de actividades y estaciones EAS

El administrador puede definir el color de cada actividad desde **Actividades → Editar** y el de cada estación desde **Estaciones EAS → Editar**. Ambos formularios incluyen paleta de muestras, selector de color y código hexadecimal #RRGGBB con vista previa. También se puede elegir el color al crear una actividad o estación. Los usuarios EAS no pueden modificar esta configuración; el backend exige rol administrador y valida el color.

La migración **009_colores.sql**, aplicada al reiniciar el servidor, añade los colores sin crear actividades, estaciones ni registros adicionales. Las actividades existentes reciben colores iniciales distintos; URDESA y las demás estaciones conservan el azul institucional como valor inicial. Los colores quedan guardados en SQLite. La migración no sustituye los colores personalizados en reinicios posteriores.

El Registro Operativo usa el color de cada actividad en sus etiquetas y en el selector cuando hay una actividad seleccionada; los registros de actividades desactivadas conservan acceso al color del catálogo. El Consolidado Diario usa los colores en los encabezados de actividades. El resumen semanal usa el color de cada actividad en el fondo de sus ilustraciones y en sus separadores. Los colores EAS identifican la estación en la navegación, los acentos del Registro y los encabezados de los consolidados filtrados por estación. Los totales semanales mantienen azul para cero y rojo para cantidades positivas. El texto para WhatsApp permanece sin formatos de color, y la captura PNG incorpora los colores visibles del resumen.

Para actualizar: detener el servidor con Ctrl+C, ejecutar `npm start` y recargar con Ctrl+F5. Para modificar las fuentes React: ejecutar `npm run build`.


### Tema completo por EAS

El color seleccionado en Estaciones EAS se aplica a títulos de módulos y tablas, encabezados y totales de tablas, botones de acción, indicadores y gráficos. El administrador conserva el tema de su estación de trabajo al cambiar de módulo; los consolidados adoptan el de la estación filtrada. La paleta conserva las muestras originales y las actividades mantienen sus colores propios como etiquetas y acentos. Los colores claros usan texto oscuro; los títulos sobre fondo blanco usan una variante más oscura del color elegido para mantener legibilidad. Para actualizar esta interfaz basta recargar con Ctrl+F5; no requiere reiniciar el servidor ni migrar datos.
## Eliminar usuarios

Solo el administrador puede usar **Administración → Usuarios → Eliminar**. El sistema pide confirmación y retira el acceso del usuario, lo oculta del listado y revoca sus sesiones. La cuenta se conserva internamente como eliminada para mantener la autoría de registros, servicios y novedades; estos datos no se borran ni se reasignan. Los nombres de usuario eliminados no se reutilizan. No se permite eliminar la propia cuenta ni el último administrador. La migración **010_eliminar_usuarios.sql** se aplica al reiniciar el servidor y conserva todas las cuentas existentes.
## Crear nuevos administradores

En **Administración → Usuarios**, elegir **Rol → Administrador**, ingresar usuario y contraseña de al menos 12 caracteres y pulsar **Crear administrador**. Solo un administrador autenticado puede crear estas cuentas. No necesitan estación fija y tienen acceso a todas las estaciones y a la administración del sistema. Las cuentas EAS siguen requiriendo su estación. Esta opción crea una cuenta nueva; editar la estación de un usuario existente no cambia su rol.

## Directorio de radioperadores

La pantalla incluye un formulario de alta/edición y un directorio con búsqueda por nombre sin distinción de tildes, filtros de estación y estado para administradores, etiquetas de estaciones y disponibilidad visible. El administrador puede editar, activar o desactivar desde el directorio. Los usuarios EAS consultan los nombres habilitados de su estación y conservan el alta local. Los permisos, los reportes y la selección de radioperador al iniciar sesión se mantienen. El diseño se adapta a móvil y utiliza el color configurado para la EAS.


### Acceso directo del administrador

Las cuentas con rol administrador ingresan al sistema sin seleccionar ni crear un radioperador. El encabezado muestra Acceso administrador. La selección entrante continúa siendo obligatoria para usuarios EAS. REPORTAR mantiene su selector de radioperador para identificar al responsable de la cartilla. No se asigna un nombre ficticio ni se cambia la estación o el rol de la cuenta. Actualizar con Ctrl+F5; no requiere reiniciar el servidor.
## Alertas de cambio de aceite

En **Móviles**, el panel de mantenimiento y la columna **Cambio de aceite** calculan el próximo múltiplo de **5.000 km** a partir del kilometraje guardado. Se avisa cuando faltan **500 km o menos**. Ejemplo: 39.550 km muestra cambio a los 40.000 km y 450 km restantes. En el múltiplo exacto se indica que corresponde realizar el cambio; después de superarlo se calcula el siguiente múltiplo. A los 0 km, el primer cambio previsto es 5.000 km.

Los avisos se calculan en el backend al consultar los móviles y se recalculan al guardar el kilometraje. No crean registros operativos ni historial de mantenimientos. Los usuarios EAS solo ven los móviles y avisos de su estación; el administrador ve los de todas las estaciones. **Editar kilometraje** abre el móvil existente para actualizarlo. No se envían correos ni notificaciones externas.
## Ingreso de datos del móvil después del radioperador

Para usuarios EAS, **Siguiente** en la selección del radioperador abre un segundo popup: móvil, conductor, jefe de patrulla ACM, kilometraje entrante y combustible. **Guardar e ingresar** actualiza el kilometraje y combustible del móvil y registra su servicio en la fecha operativa y jornada calculadas por el servidor en America/Guayaquil. No se confía en fechas o jornadas enviadas por el navegador. Si ya existe ese servicio por estación/fecha/jornada/móvil, se actualiza sin duplicarlo, conservando kilometraje saliente y observaciones. El kilometraje saliente no puede quedar por debajo del entrante.

Móviles muestra conductor y jefe del servicio más reciente, obtenidos de servicios_moviles sin duplicar nombres en su tabla. El Consolidado Diario muestra los nombres y kilometraje entrante en la fila del móvil/jornada, incluso cuando todavía no existen actividades. El móvil elegido queda seleccionado inicialmente en los registros nuevos del Registro Operativo; los registros existentes no cambian. No se inventa kilometraje saliente ni se crean actividades.

La selección del ingreso se conserva durante la sesión, por lo que recargar no repite los popups. Una sesión nueva vuelve a solicitarla. Para ingresar otro móvil o corregir datos, usar **Móviles → Registrar datos de jornada**. Si no hay móviles, el segundo popup permite ir a registrar uno; al crearlo vuelve a solicitar el ingreso de jornada. No se crean móviles predeterminados. Los administradores conservan su acceso directo y la edición de servicios desde el consolidado.

Endpoints autenticados: GET /api/servicio-entrante entrega la jornada actual y los móviles autorizados; POST /api/servicio-entrante guarda móvil y servicio en una única transacción. El usuario EAS necesita haber seleccionado un radioperador habilitado de su estación. Los cambios se reflejan en los consolidados sin duplicar registros operativos. Esta actualización no requiere migración; reiniciar el servidor y recargar con Ctrl+F5.


### Omitir datos de móvil al reingresar

Para usuarios EAS, Siguiente abre directamente el segundo popup de datos del móvil. El botón Omitir permite continuar sin completar campos y sin crear o modificar móviles, servicios o registros. La omisión se conserva solo en esa sesión; al seleccionar nuevamente un radioperador o iniciar otra sesión se ofrece el paso otra vez. Los datos de jornada ya guardados permanecen intactos. También se puede usar Móviles → Registrar datos de jornada después de omitir. El endpoint POST /api/servicio-entrante/omitir exige sesión, CSRF y radioperador habilitado para usuarios EAS. Los administradores conservan su acceso directo. Para aplicar esta actualización al servidor iniciado en la terminal: Ctrl+C, npm start y Ctrl+F5 en el navegador. No ejecutar otra instancia en paralelo.


## Ingreso completo por cambio de jornada (flujo actual)

Este flujo sustituye el ingreso de un solo móvil y la omisión libre. Para usuarios EAS, el backend verifica todos los móviles de su estación en la fecha operativa y jornada actuales. Los cambios efectivos son a las 06:00, 14:00 y 22:00 de America/Guayaquil; antes de las 06:00 la Amanecida conserva la fecha operativa anterior. Los horarios oficiales de presentación permanecen iguales.

El popup muestra avance y únicamente los móviles pendientes. Guardar y siguiente registra conductor, jefe de patrulla, kilometraje entrante y combustible, y muestra el siguiente móvil faltante. Al completar el último abre el Registro Operativo. El progreso se deriva de los servicios guardados, no de una marca del navegador o de sesión. Reingresar retoma los pendientes y no duplica los completados. Omitir solo está habilitado y autorizado por el backend cuando todos ya están completos. Los administradores mantienen su acceso directo.

La página programa la comprobación del siguiente cambio con la hora informada por el servidor, comprueba además cada 15 segundos mientras está visible y al recuperar foco, y verifica el ingreso al cambiar de módulo. Si el navegador estuvo suspendido, solicita el ingreso pendiente al volver. Si cambia la jornada durante el formulario, el backend rechaza la clave anterior sin escribir en otra jornada y solicita recargar los móviles actuales. No se reclasifican ni se sobrescriben los servicios históricos.

La migración 011_combustible_servicio.sql añade combustible entrante al servicio, sin duplicar registros operativos. Los servicios anteriores se conservan; si al servicio de la jornada activa le faltan campos requeridos se solicita completarlos. Un móvil creado durante la jornada entra en la lista de pendientes. El anuncio de cambio de aceite aparece también debajo de la tabla del Registro Operativo, limitado a la estación de trabajo, con icono de precaución parpadeante y alternativa sin parpadeo para movimiento reducido. Se consulta el kilometraje guardado del móvil.

Aplicar en la terminal que ejecuta EAS-GO: Ctrl+C, npm start y Ctrl+F5 en el navegador. No abrir un segundo servidor sobre el puerto 3000.


## Menú Informes: PDF y CSV

El menú Informes ofrece seis descargas, con filtros Desde/Hasta y estación autorizada:

- Gestión operativa: movimientos de las tres jornadas, móvil, placa, hora, actividad histórica, ubicación, detalle/novedades y radioperador identificado; incluye resumen por jornada/móvil.
- Consolidado diario: responsables de cada móvil/jornada, kilometrajes entrante/saliente y recorrido conocido, cantidades y detalle por actividad, observaciones de servicios y novedades del consolidado. Incluye actividades con cero registros.
- Móviles: flota asignada y circulación respaldada por servicio o actividad en el período, kilometraje y combustible actuales, novedades, próximo cambio de aceite y kilómetros restantes. Incluye datos de combustible de cada servicio. No existen datos de litros o comprobantes de tanqueo, por lo que no se inventan.
- Ubicaciones y consignas: catálogo de todos los puntos y gráfico de los sectores con mayor actividad (hasta 15 en el gráfico, todos en la tabla). Ubicaciones permite elegir Tipo al crear y Clasificar un punto existente, conservando su nombre histórico y estación.
- Semanal: siempre lunes a domingo; detalle de cada actividad por EAS/día, totales diarios, diferencia y porcentaje respecto del mismo día de la semana anterior, kilometraje por móvil/día/jornada, recorrido conocido total por móvil y gráfico de barras comparativo. Se indica cuando faltan kilometrajes.
- Radioperadores: nombres asignados, fecha de creación en America/Guayaquil, estado, actividades por jornada y móvil, totales por radioperador y ranking de móviles. Los nombres de autoría se guardan desde esta actualización al crear registros; editar no cambia esa autoría. Los registros anteriores sin evidencia se muestran SIN RADIOPERADOR IDENTIFICADO. La asignación actual del catálogo y la autoría histórica se presentan por separado.

API: GET /api/informes?tipo=gestion|diario|moviles|ubicaciones|semanal|radioperadores&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&formato=json|pdf|csv. El administrador puede filtrar estacion_id; el usuario EAS solo accede a su propia estación y la modificación de parámetros no amplía su acceso. Todos los datos se leen en una instantánea de SQLite y las agregaciones se realizan en el backend. No se guarda una nueva tabla de informes. El período máximo es 366 días; semanal normaliza automáticamente el lunes y domingo de Desde.

Los CSV usan UTF-8 con BOM, comas y escapado de comillas/saltos de línea, protegen fórmulas y contienen una sola cabecera por archivo. Las columnas informe, seccion, periodo_inicio, periodo_fin, zona_horaria y generado_en permiten filtrar los conjuntos. Para visualizar, elegir la sección correspondiente; no sumar a la vez filas de detalle y resúmenes del mismo indicador. Los valores faltantes permanecen vacíos; los porcentajes con base cero no se inventan. Los PDF tienen encabezados repetidos, paginación, tablas continuadas y gráficos vectoriales.

La migración 012_informes.sql añade autoría del radioperador a registros nuevos y tipo a ubicaciones. Conserva registros, servicios y catálogos existentes sin atribuir autores retrospectivamente. Reiniciar la terminal del servidor con Ctrl+C y npm start, y recargar con Ctrl+F5. PDFKit ya está instalado en esta copia; en instalaciones nuevas ejecutar npm install primero.

### Captura del Consolidado Diario

REPORTAR muestra al inicio una imagen PNG de OPERATIVIDAD EAS con columnas, filas y totales; permite Copiar imagen y Descargar PNG. Se mantiene la cartilla para WhatsApp. Después de actualizar los archivos ejecutar npm run build y recargar con Ctrl+F5.

El contexto para continuar la integración con Google Sheets está en CONTINUAR_CON_GOOGLE_SHEETS.md.

## Fase 3 · Dashboard Operativo (EAS-GO)

Acceso desde el final del menú superior, junto a Informes. La pantalla inicial de una sesión es Registro Operativo. El ingreso EAS conserva la selección de radioperador y la captura obligatoria de todos los móviles al cambiar de jornada. Después de ese flujo, se conserva la apertura de Registro Operativo.

- KPI reales, filtros por rango, estaciones (selección múltiple del administrador), jornada almacenada, actividad, móvil y búsqueda. Hoy/Ayer usan la fecha operativa del servidor; Esta semana comprende lunes–domingo y Este mes todo el mes calendario.
- Resumen ilustrado reutilizado del Consolidado Semanal. Gráficos SVG accesibles de barras, evolución comparada y distribución; no se añadió una dependencia de gráficos ni datos de demostración a la base real.
- Actividades con cero registros e inactivas incluidas. Jornadas históricas SIN JORNADA permanecen diferenciadas. Detalle solo de consulta con 25 registros por página, búsqueda y orden validados en backend.
- Servicios vehiculares separados de los registros: sumar cada diferencia válida una sola vez. Las lecturas absolutas se muestran por servicio/jornada; falta de lecturas se presenta como Sin dato. Con filtros de actividad/búsqueda, se incluyen servicios que contienen al menos un registro coincidente, sin multiplicarlos por actividad.
- Comparación predeterminada con un período anterior de igual duración; opción mes anterior con ajuste de fin de mes. Una base cero devuelve variacion=null y la interfaz muestra Sin base comparable. Comparaciones descriptivas, sin clasificaciones de desempeño.
- Ubicaciones agrupadas por ID cuando existe; los registros anteriores conservan su texto exacto sin inferir equivalencias. Se muestran hasta 100 ubicaciones por actividad y sus tres actividades más frecuentes.
- Actualiza tras eventos de cambios confirmados en registros/servicios, al recuperar el foco o mediante Actualizar. No hay sondeo periódico adicional.

### Endpoint y filtros

`GET /api/dashboard/resumen` devuelve todas las secciones en una lectura transaccional coherente. Parámetros: desde, hasta (YYYY-MM-DD, máximo 366 días), estacion_id (repetible para comparar estaciones; solamente IDs autorizados), jornada_id (ID o sin), actividad_id, movil_id (ID o sin), agrupacion (dia/semana/mes), comparacion (anterior/mes), buscar, pagina, orden (fecha/hora/movil/actividad/ubicacion/detalle), direccion (asc/desc), formato (json/csv). Fechas operativas ya almacenadas, zona America/Guayaquil. Usuario EAS siempre limitado a su estación en el backend; intentos de ampliar su ámbito se rechazan con 403.

`GET /api/dashboard/resumen?...&formato=csv` descarga los resultados filtrados, incluyendo todos los registros coincidentes (no solo la página visible), servicios, indicadores y agregados. CSV UTF-8 con BOM, escape de comillas/saltos y protección de fórmulas. La columna seccion distingue los conjuntos: no sumar filas de secciones distintas como si fueran nuevos registros. Los kilómetros faltantes quedan vacíos. Se mantienen los informes PDF/CSV existentes. No se agregó XLSX porque el proyecto no dispone de soporte Excel instalado.

### Archivos y migración

Backend: lib/dashboard.js, server.js. Interfaz: src/dashboard.jsx, src/consolidados.jsx, src/weekly-summary.jsx, public/app.js, public/style.css y public/consolidados.js (generado). Verificación: test/dashboard.test.js.

Migración 013_dashboard.sql: agrega registros.ubicacion_id nullable e índices por fecha/actividad y servicios. No altera fechas, jornadas, conteos o textos históricos. Se ejecuta una sola vez al iniciar el servidor. Se guardó una copia de la base anterior en backups/redeas-antes-dashboard-*.sqlite.

Para aplicar: detener el servidor existente con Ctrl+C, ejecutar npm run build y npm start en su terminal y recargar con Ctrl+F5. No abrir una segunda instancia en el puerto 3000.

Pruebas: npm test (36 pruebas). Casos nuevos: aislamiento EAS, selección múltiple de administrador, parámetros manipulados, filtros, paginación, ceros, catálogo desactivado, coherencia con consolidados, cambios y eliminaciones, medianoche/Amanecida, servicios sin doble conteo, ubicaciones por ID y CSV. Verificación visual de escritorio y móvil en base en memoria; la base operativa real no recibió datos de prueba. Google Sheets sigue fuera de esta fase (Fase 4).

## Fase 4 · CONEXIÓN con Google Sheets

Módulo exclusivo del administrador, colocado antes de Dashboard Operativo e Informes al final del menú superior. La pantalla inicial sigue siendo Registro Operativo. Las seis secciones incluyen configuración real de API, mapeo por ID, equivalencias explícitas, localizador dinámico, simulación por fecha/estación/móvil/jornada e historial con recuperación.

Consultar GOOGLE_SHEETS.md para la guía completa de Google Cloud, comandos PowerShell, endpoints /api/conexion/*, mapeo B–Z, conciliación histórica, reglas de acumulación, límites técnicos y archivos creados/modificados. INFORME_COMPARACION_SHEETS.md documenta la diferencia I9047 entre Excel y una exportación actual de la hoja oficial.

Migración 014_google_sheets.sql no destructiva. Dependencia oficial google-auth-library solo en backend. Se guardó un respaldo en backups/redeas-antes-google-sheets-*.sqlite. Credenciales fuera del proyecto; escrituras deshabilitadas por defecto. No se realizaron escrituras en Google ni una prueba API autenticada: faltan la cuenta de servicio y una copia de prueba autorizada. No se considera finalizada la puesta en marcha hasta comprobar lectura y escritura real en dicha copia.

npm test: 42 pruebas aprobadas, incluidas pruebas de sincronización con API simulada y bases en memoria. Se conservan las verificaciones de las fases anteriores.


## Actualización de autenticación Google: OAuth con PKCE

La autenticación predeterminada ahora es OAuth de cliente web, sin generar claves privadas de cuentas de servicio y sin deshabilitar iam.disableServiceAccountKeyCreation. Ver GOOGLE_OAUTH.md y .env.example para pantalla de consentimiento, usuarios de prueba, callbacks, variables, cifrado AES-256-GCM, restricciones de acceso y ADC con identidad adjunta en Google Cloud. CONEXIÓN incorpora CONECTAR CON GOOGLE, cuenta/estado, PROBAR CONEXIÓN y DESCONECTAR. El backend verifica canEdit del documento mediante metadatos Drive antes de permitir escrituras. La migración 015_google_oauth solo agrega el almacén cifrado de autorización; no altera los datos operativos. GOOGLE_SHEETS_WRITES_ENABLED permanece false por defecto. No se realizó una autorización OAuth real ni una escritura de prueba; siguen pendientes de la configuración manual y copia autorizada.
#   e a s g o  
 