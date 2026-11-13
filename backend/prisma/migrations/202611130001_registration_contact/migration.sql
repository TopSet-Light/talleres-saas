ALTER TABLE "registro_pendiente"
  ADD COLUMN "telefono_contacto" VARCHAR(40),
  ADD COLUMN "pais" VARCHAR(100),
  ADD COLUMN "localidad" VARCHAR(120);

ALTER TABLE "taller"
  ADD COLUMN "telefono_contacto" VARCHAR(40),
  ADD COLUMN "pais" VARCHAR(100),
  ADD COLUMN "localidad" VARCHAR(120);
