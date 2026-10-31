CREATE TABLE jornadas(id INTEGER PRIMARY KEY,nombre TEXT NOT NULL UNIQUE,hora_inicio TEXT NOT NULL,hora_fin TEXT NOT NULL);
INSERT INTO jornadas VALUES(1,'Matutina','06:00','14:30'),(2,'Vespertina','14:00','22:30'),(3,'Amanecida','22:00','06:30');
-- Rebuild only to permit SIN MÓVIL; preserve every existing ID and historical field.
CREATE TABLE registros_jornadas(
 id INTEGER PRIMARY KEY,fecha TEXT NOT NULL,movil_id INTEGER REFERENCES moviles(id),
 actividad_id INTEGER NOT NULL REFERENCES actividades(id) ON DELETE RESTRICT,
 actividad_nombre TEXT NOT NULL,estacion_id INTEGER NOT NULL REFERENCES estaciones(id),
 detalle TEXT NOT NULL DEFAULT '',usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
 ubicacion TEXT NOT NULL DEFAULT '',creado_en TEXT,hora TEXT,
 jornada_id INTEGER REFERENCES jornadas(id)
);
INSERT INTO registros_jornadas(id,fecha,movil_id,actividad_id,actividad_nombre,estacion_id,detalle,usuario_id,ubicacion,creado_en,hora)
 SELECT id,fecha,movil_id,actividad_id,actividad_nombre,estacion_id,detalle,usuario_id,ubicacion,creado_en,hora FROM registros;
DROP TABLE registros;
ALTER TABLE registros_jornadas RENAME TO registros;
CREATE INDEX registros_estacion_fecha ON registros(estacion_id,fecha);
CREATE INDEX registros_fecha ON registros(fecha);
CREATE INDEX registros_jornada_fecha ON registros(estacion_id,fecha,jornada_id,movil_id);
CREATE TABLE servicios_moviles(
 id INTEGER PRIMARY KEY,estacion_id INTEGER NOT NULL REFERENCES estaciones(id),
 fecha TEXT NOT NULL,jornada_id INTEGER NOT NULL REFERENCES jornadas(id),
 movil_id INTEGER NOT NULL REFERENCES moviles(id),conductor TEXT NOT NULL DEFAULT '',
 jefe_patrulla TEXT NOT NULL DEFAULT '',kilometraje_entrante REAL CHECK(kilometraje_entrante>=0),
 kilometraje_saliente REAL CHECK(kilometraje_saliente>=0),observaciones TEXT NOT NULL DEFAULT '',
 modificado_por INTEGER NOT NULL REFERENCES usuarios(id),modificado_en TEXT NOT NULL,
 UNIQUE(estacion_id,fecha,jornada_id,movil_id),
 CHECK(kilometraje_saliente IS NULL OR (kilometraje_entrante IS NOT NULL AND kilometraje_saliente>=kilometraje_entrante))
);
-- 0 = todas las jornadas. Preserve existing period notes in that scope.
CREATE TABLE novedades_jornadas(
 estacion_id INTEGER NOT NULL REFERENCES estaciones(id),tipo TEXT NOT NULL CHECK(tipo IN('diario','semanal')),
 inicio TEXT NOT NULL,fin TEXT NOT NULL,texto TEXT NOT NULL DEFAULT '',
 modificado_por INTEGER NOT NULL REFERENCES usuarios(id),modificado_en TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,jornada_clave INTEGER NOT NULL DEFAULT 0 CHECK(jornada_clave>=-1),
 PRIMARY KEY(estacion_id,tipo,inicio,jornada_clave)
);
INSERT INTO novedades_jornadas(estacion_id,tipo,inicio,fin,texto,modificado_por,modificado_en,version)
 SELECT estacion_id,tipo,inicio,fin,texto,modificado_por,modificado_en,version FROM reporte_novedades;
DROP TABLE reporte_novedades;
ALTER TABLE novedades_jornadas RENAME TO reporte_novedades;
