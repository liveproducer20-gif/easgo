-- Preserve authorship of operational records, services and report notes.
ALTER TABLE usuarios ADD COLUMN eliminado_en TEXT;
