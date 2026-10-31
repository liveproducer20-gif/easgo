ALTER TABLE servicios_moviles ADD COLUMN combustible_entrante TEXT
 CHECK(combustible_entrante IS NULL OR combustible_entrante IN('Lleno','3/4','1/2','1/4','Reserva'));
