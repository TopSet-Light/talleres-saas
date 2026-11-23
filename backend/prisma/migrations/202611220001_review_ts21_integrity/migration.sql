-- Revisión del PR #5 (TS-21). No modificar la migración del registro con Google,
-- que ya se aplicó en desarrollo: extenderla con restricciones y fecha de creación.
BEGIN;

ALTER TABLE registro_google ADD COLUMN created_at TIMESTAMPTZ(3);

-- Los registros anteriores siempre tenían una vigencia de 30 minutos. Reconstruir
-- su creación desde el vencimiento conserva también registros vencidos o usados.
UPDATE registro_google SET created_at = expira_at - INTERVAL '30 minutes';

ALTER TABLE registro_google
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT registro_google_token_hash_formato CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT registro_google_email_normalizado CHECK (email = lower(btrim(email)) AND email <> ''),
  ADD CONSTRAINT registro_google_sub_no_vacio CHECK (btrim(sub) <> ''),
  ADD CONSTRAINT registro_google_vencimiento_valido CHECK (expira_at > created_at);

ALTER TABLE inicio_google
  ADD CONSTRAINT inicio_google_registro_sin_vinculacion
    CHECK (NOT es_registro OR (usuario_id IS NULL AND sesion_id IS NULL));

COMMIT;
