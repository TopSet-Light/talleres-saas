-- Punto 08 · Acceso: credenciales, sesiones, verificación de email e invitaciones.
BEGIN;

-- CreateTable
CREATE TABLE "credencial" (
    "usuario_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verificado_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credencial_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_uso_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_inactividad_at" TIMESTAMPTZ(3) NOT NULL,
    "expira_at" TIMESTAMPTZ(3) NOT NULL,
    "revocada_at" TIMESTAMPTZ(3),

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verificacion_email" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_at" TIMESTAMPTZ(3) NOT NULL,
    "usada_at" TIMESTAMPTZ(3),

    CONSTRAINT "verificacion_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitacion" (
    "id" UUID NOT NULL,
    "taller_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "Role" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "invitado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_at" TIMESTAMPTZ(3) NOT NULL,
    "usada_at" TIMESTAMPTZ(3),
    "revocada_at" TIMESTAMPTZ(3),
    "aceptada_por_id" UUID,

    CONSTRAINT "invitacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sesion_token_hash_key" ON "sesion"("token_hash");

-- CreateIndex
CREATE INDEX "sesion_usuario_id_idx" ON "sesion"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "verificacion_email_token_hash_key" ON "verificacion_email"("token_hash");

-- CreateIndex
CREATE INDEX "verificacion_email_usuario_id_idx" ON "verificacion_email"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitacion_token_hash_key" ON "invitacion"("token_hash");

-- CreateIndex
CREATE INDEX "invitacion_taller_id_email_idx" ON "invitacion"("taller_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "pertenencia_taller_id_usuario_id_key" ON "pertenencia"("taller_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "credencial" ADD CONSTRAINT "credencial_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "verificacion_email" ADD CONSTRAINT "verificacion_email_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invitacion" ADD CONSTRAINT "invitacion_taller_id_fkey" FOREIGN KEY ("taller_id") REFERENCES "taller"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invitacion" ADD CONSTRAINT "invitacion_taller_id_invitado_por_id_fkey" FOREIGN KEY ("taller_id", "invitado_por_id") REFERENCES "pertenencia"("taller_id", "usuario_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invitacion" ADD CONSTRAINT "invitacion_aceptada_por_id_fkey" FOREIGN KEY ("aceptada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Los tokens y hashes tienen formato fijo; nunca se guarda un token en claro.
ALTER TABLE credencial
  ADD CONSTRAINT credencial_hash_argon2id CHECK (password_hash LIKE '$argon2id$%');
ALTER TABLE sesion
  ADD CONSTRAINT sesion_token_hash_formato CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT sesion_vencimientos_validos CHECK (expira_at > created_at AND expira_inactividad_at <= expira_at);
ALTER TABLE verificacion_email
  ADD CONSTRAINT verificacion_token_hash_formato CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT verificacion_vencimiento_valido CHECK (expira_at > created_at);
ALTER TABLE invitacion
  ADD CONSTRAINT invitacion_token_hash_formato CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT invitacion_email_normalizado CHECK (email = lower(btrim(email)) AND email <> ''),
  ADD CONSTRAINT invitacion_vencimiento_valido CHECK (expira_at > created_at),
  ADD CONSTRAINT invitacion_uso_o_revocacion CHECK (usada_at IS NULL OR revocada_at IS NULL),
  ADD CONSTRAINT invitacion_uso_con_usuario CHECK ((usada_at IS NULL) = (aceptada_por_id IS NULL));

-- Una sola invitación pendiente por email en cada taller; las anteriores se revocan al reinvitar.
CREATE UNIQUE INDEX invitacion_pendiente_por_email
  ON invitacion(taller_id, email) WHERE usada_at IS NULL AND revocada_at IS NULL;

-- Una invitación no se transfiere a otro taller.
CREATE TRIGGER invitacion_taller_inmutable BEFORE UPDATE ON invitacion
  FOR EACH ROW EXECUTE FUNCTION impedir_cambio_taller();

COMMIT;
