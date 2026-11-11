-- Revisión de TS-19: el registro no crea usuario ni contraseña hasta que se prueba el
-- control del buzón. Reemplaza la verificación posterior de 202611090001_access, que
-- permitía a un tercero fijar la contraseña de un email ajeno. verificacion_email solo
-- existió en la rama TS-19, sin integrar ni desplegar, así que se elimina.
BEGIN;

-- DropForeignKey
ALTER TABLE "verificacion_email" DROP CONSTRAINT "verificacion_email_usuario_id_fkey";

-- DropTable
DROP TABLE "verificacion_email";

-- CreateTable
CREATE TABLE "registro_pendiente" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "nombre_taller" VARCHAR(160) NOT NULL,
    "nombre_dueno" VARCHAR(160) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_at" TIMESTAMPTZ(3) NOT NULL,
    "usada_at" TIMESTAMPTZ(3),

    CONSTRAINT "registro_pendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registro_pendiente_token_hash_key" ON "registro_pendiente"("token_hash");

-- CreateIndex
CREATE INDEX "registro_pendiente_email_created_at_idx" ON "registro_pendiente"("email", "created_at");


ALTER TABLE registro_pendiente
  ADD CONSTRAINT registro_token_hash_formato CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT registro_email_normalizado CHECK (email = lower(btrim(email)) AND email <> ''),
  ADD CONSTRAINT registro_nombres_no_vacios CHECK (btrim(nombre_taller) <> '' AND btrim(nombre_dueno) <> ''),
  ADD CONSTRAINT registro_vencimiento_valido CHECK (expira_at > created_at);

COMMIT;
