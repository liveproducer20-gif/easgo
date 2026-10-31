-- Preserve historical text; only new explicitly selected locations receive an ID.
ALTER TABLE registros ADD COLUMN ubicacion_id INTEGER REFERENCES ubicaciones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS dashboard_fecha_actividad ON registros(fecha,actividad_id,estacion_id);
CREATE INDEX IF NOT EXISTS dashboard_servicios_fecha ON servicios_moviles(fecha,estacion_id,jornada_id,movil_id);
