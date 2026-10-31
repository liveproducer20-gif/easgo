ALTER TABLE radiooperadores ADD COLUMN estado INTEGER NOT NULL DEFAULT 1 CHECK(estado IN(0,1));
CREATE TABLE radiooperador_estaciones(
 radiooperador_id INTEGER NOT NULL REFERENCES radiooperadores(id),
 estacion_id INTEGER NOT NULL REFERENCES estaciones(id),
 PRIMARY KEY(radiooperador_id,estacion_id)
);
INSERT INTO radiooperador_estaciones SELECT id,estacion_id FROM radiooperadores;
CREATE TABLE reporte_categorias(id INTEGER PRIMARY KEY,nombre TEXT NOT NULL UNIQUE,orden INTEGER NOT NULL UNIQUE);
INSERT INTO reporte_categorias(id,nombre,orden) VALUES
 (1,'OPERATIVOS',1),(2,'REQUERIMIENTOS',2),(3,'ACM HERIDOS',3),
 (4,'LEVANTAMIENTOS DE INDIGENTES',4),(5,'DESALOJO DE LIBADORES',5),
 (6,'RESCATE ANIMAL',6),(7,'COLABORACIÓN CON OTRA INSTITUCIÓNES',7),
 (8,'RETENIDOS',8),(9,'RETIROS TEMPORALES',9),(10,'ARMA BLANCA O FUEGO',10),
 (11,'COLABORACION CON ATM',11),(12,'ATENCIÓN PARAMÉDICA',12);
-- Cada actividad tiene como máximo una clasificación: no duplica conteos.
CREATE TABLE reporte_clasificacion(
 actividad_id INTEGER PRIMARY KEY REFERENCES actividades(id) ON DELETE CASCADE,
 categoria_id INTEGER NOT NULL REFERENCES reporte_categorias(id)
);
CREATE TABLE reporte_novedades(
 estacion_id INTEGER NOT NULL REFERENCES estaciones(id),
 tipo TEXT NOT NULL CHECK(tipo IN('diario','semanal')),
 inicio TEXT NOT NULL,
 fin TEXT NOT NULL,
 texto TEXT NOT NULL DEFAULT '',
 modificado_por INTEGER NOT NULL REFERENCES usuarios(id),
 modificado_en TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(estacion_id,tipo,inicio)
);
