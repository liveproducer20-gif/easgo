CREATE TABLE ubicaciones(
 id INTEGER PRIMARY KEY,
 nombre TEXT NOT NULL,
 clave TEXT NOT NULL,
 estacion_id INTEGER NOT NULL REFERENCES estaciones(id),
 creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(estacion_id,clave)
);
INSERT OR IGNORE INTO ubicaciones(nombre,clave,estacion_id)
 SELECT trim(ubicacion),upper(trim(ubicacion)),estacion_id FROM registros WHERE trim(ubicacion)<>'';
