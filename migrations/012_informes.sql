ALTER TABLE registros ADD COLUMN radiooperador_id INTEGER REFERENCES radiooperadores(id);
ALTER TABLE registros ADD COLUMN radiooperador_nombre TEXT;
ALTER TABLE ubicaciones ADD COLUMN tipo TEXT NOT NULL DEFAULT 'ubicacion' CHECK(tipo IN('ubicacion','consigna'));
CREATE INDEX registros_radio_fecha ON registros(estacion_id,radiooperador_id,fecha,jornada_id,movil_id);
