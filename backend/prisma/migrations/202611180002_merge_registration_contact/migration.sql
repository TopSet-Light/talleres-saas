-- Compatibilidad entre los datos de registro de TS-21 y la configuración de TS-20.
UPDATE "registro_pendiente"
SET "telefono" = COALESCE("telefono", "telefono_contacto"),
    "domicilio" = COALESCE("domicilio", "direccion");

UPDATE "configuracion_taller" AS c
SET "telefono" = COALESCE(c."telefono", t."telefono_contacto"),
    "localidad" = COALESCE(c."localidad", t."localidad"),
    "domicilio" = COALESCE(c."domicilio", t."direccion")
FROM "taller" AS t
WHERE c."taller_id" = t."id";
