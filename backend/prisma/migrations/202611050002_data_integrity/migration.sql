BEGIN;

ALTER TABLE taller ADD CONSTRAINT taller_nombre_no_vacio CHECK (btrim(name) <> '');
ALTER TABLE usuario
  ADD CONSTRAINT usuario_nombre_no_vacio CHECK (btrim(name) <> ''),
  ADD CONSTRAINT usuario_email_normalizado CHECK (email = lower(btrim(email)) AND email <> '');
ALTER TABLE cliente
  ADD CONSTRAINT cliente_telefono_no_vacio CHECK (btrim(phone) <> ''),
  ADD CONSTRAINT cliente_nombre_no_vacio CHECK (name IS NULL OR btrim(name) <> '');
ALTER TABLE vehiculo
  ADD CONSTRAINT vehiculo_kilometraje_no_negativo CHECK (mileage IS NULL OR mileage >= 0),
  ADD CONSTRAINT vehiculo_anio_valido CHECK (year IS NULL OR year BETWEEN 1886 AND 9999);
ALTER TABLE titularidad_vehiculo
  ADD CONSTRAINT titularidad_periodo_valido CHECK (hasta IS NULL OR hasta >= desde);

-- La normalización y unicidad se aplican también a escrituras SQL directas.
CREATE FUNCTION normalizar_patente() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.patente := nullif(upper(regexp_replace(NEW.patente, '[[:space:]-]', '', 'g')), '');
  RETURN NEW;
END;
$$;
CREATE TRIGGER vehiculo_normalizar_patente
BEFORE INSERT OR UPDATE ON vehiculo FOR EACH ROW EXECUTE FUNCTION normalizar_patente();

UPDATE vehiculo SET patente = patente;
ALTER TABLE vehiculo ADD CONSTRAINT vehiculo_patente_formato
  CHECK (patente IS NULL OR patente ~ '^[A-Z0-9]+$');
CREATE UNIQUE INDEX vehiculo_patente_activa_por_taller
  ON vehiculo(taller_id, patente) WHERE active AND patente IS NOT NULL;

-- Una entidad no se transfiere entre talleres modificando su taller_id.
CREATE FUNCTION impedir_cambio_taller() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.taller_id IS DISTINCT FROM OLD.taller_id THEN
    RAISE EXCEPTION 'No se permite cambiar el taller de un registro' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cliente_taller_inmutable BEFORE UPDATE ON cliente
  FOR EACH ROW EXECUTE FUNCTION impedir_cambio_taller();
CREATE TRIGGER vehiculo_taller_inmutable BEFORE UPDATE ON vehiculo
  FOR EACH ROW EXECUTE FUNCTION impedir_cambio_taller();
CREATE TRIGGER pertenencia_taller_inmutable BEFORE UPDATE ON pertenencia
  FOR EACH ROW EXECUTE FUNCTION impedir_cambio_taller();

-- Actualizar la versión anterior conserva vehículos y crea su titularidad inicial.
INSERT INTO titularidad_vehiculo(id, taller_id, vehiculo_id, cliente_id, desde)
SELECT gen_random_uuid(), v.taller_id, v.id, v.cliente_id, v.created_at
FROM vehiculo v
WHERE NOT EXISTS (
  SELECT 1 FROM titularidad_vehiculo h WHERE h.taller_id = v.taller_id AND h.vehiculo_id = v.id
);
CREATE UNIQUE INDEX titularidad_actual_por_vehiculo
  ON titularidad_vehiculo(taller_id, vehiculo_id) WHERE hasta IS NULL;

-- El cambio de cliente y su historial forman una única operación de PostgreSQL.
CREATE FUNCTION registrar_titularidad() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fecha timestamptz(3);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cliente_id IS NOT DISTINCT FROM OLD.cliente_id THEN
      RETURN NEW;
    END IF;
    -- Prisma o una importación pueden aportar una fecha adelantada respecto del
    -- reloj de PostgreSQL. El cierre nunca retrocede respecto del período abierto.
    SELECT greatest(clock_timestamp(), desde) INTO fecha FROM titularidad_vehiculo
      WHERE taller_id = NEW.taller_id AND vehiculo_id = NEW.id AND hasta IS NULL;
    UPDATE titularidad_vehiculo SET hasta = fecha
      WHERE taller_id = NEW.taller_id AND vehiculo_id = NEW.id AND hasta IS NULL;
  ELSE
    fecha := NEW.created_at;
  END IF;
  INSERT INTO titularidad_vehiculo(id, taller_id, vehiculo_id, cliente_id, desde)
    VALUES (gen_random_uuid(), NEW.taller_id, NEW.id, NEW.cliente_id, fecha);
  RETURN NEW;
END;
$$;
CREATE TRIGGER vehiculo_registrar_titularidad
AFTER INSERT OR UPDATE OF cliente_id ON vehiculo
FOR EACH ROW EXECUTE FUNCTION registrar_titularidad();

-- Solo el trigger anterior escribe historial; no se reescribe ni elimina a mano.
CREATE FUNCTION proteger_titularidad() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'La titularidad se registra al crear o actualizar el vehículo' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER titularidad_solo_desde_vehiculo
BEFORE INSERT OR UPDATE OR DELETE ON titularidad_vehiculo
FOR EACH ROW EXECUTE FUNCTION proteger_titularidad();

COMMIT;
