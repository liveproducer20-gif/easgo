-- Los registros anteriores no tienen hora de creación conocida: conservar NULL.
ALTER TABLE registros ADD COLUMN ubicacion TEXT NOT NULL DEFAULT '';
ALTER TABLE registros ADD COLUMN creado_en TEXT;
ALTER TABLE registros ADD COLUMN hora TEXT;
