-- Solo metadatos del catálogo inicial e índices: no se copian registros.
CREATE TABLE IF NOT EXISTS catalogo_inicial(
 orden INTEGER PRIMARY KEY,
 nombre TEXT NOT NULL UNIQUE,
 actividad_id INTEGER UNIQUE REFERENCES actividades(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS registros_estacion_fecha ON registros(estacion_id,fecha);
CREATE INDEX IF NOT EXISTS registros_fecha ON registros(fecha);
