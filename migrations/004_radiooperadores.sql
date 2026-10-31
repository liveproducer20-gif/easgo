CREATE TABLE radiooperadores(
 id INTEGER PRIMARY KEY,
 nombre TEXT NOT NULL,
 clave TEXT NOT NULL,
 estacion_id INTEGER NOT NULL REFERENCES estaciones(id),
 creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(estacion_id,clave)
);
