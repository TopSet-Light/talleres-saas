-- TS-20: recuperación de contraseña (AUTH-05), configuración comercial y numeración por
-- taller (AUTH-07/CFG), ingreso con Google y datos opcionales del registro (TS-21).
-- Solo agrega tablas y columnas opcionales; los talleres existentes reciben su configuración
-- y su numeración inicial sin modificar sus datos.
BEGIN;

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('WORK_ORDER', 'ESTIMATE');

-- AlterTable
ALTER TABLE "registro_pendiente" ADD COLUMN     "domicilio" VARCHAR(300),
ADD COLUMN     "localidad" VARCHAR(120),
ADD COLUMN     "telefono" VARCHAR(40);

-- CreateTable
CREATE TABLE "recuperacion_contrasena" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_at" TIMESTAMPTZ(3) NOT NULL,
    "usada_at" TIMESTAMPTZ(3),

    CONSTRAINT "recuperacion_contrasena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidad_google" (
    "usuario_id" UUID NOT NULL,
    "sub" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identidad_google_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "inicio_google" (
    "id" UUID NOT NULL,
    "state_hash" CHAR(64) NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "code_verifier" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_at" TIMESTAMPTZ(3) NOT NULL,
    "usada_at" TIMESTAMPTZ(3),

    CONSTRAINT "inicio_google_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_taller" (
    "taller_id" UUID NOT NULL,
    "cuit" VARCHAR(11),
    "domicilio" VARCHAR(300),
    "localidad" VARCHAR(120),
    "telefono" VARCHAR(40),
    "email_contacto" VARCHAR(254),
    "pie_documentos" VARCHAR(1000),
    "vigencia_presupuesto_dias" INTEGER NOT NULL DEFAULT 15,
    "condiciones_predeterminadas" VARCHAR(2000),
    "logo_archivo" VARCHAR(200),
    "logo_tipo" VARCHAR(20),
    "logo_bytes" INTEGER,
    "logo_actualizado_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracion_taller_pkey" PRIMARY KEY ("taller_id")
);

-- CreateTable
CREATE TABLE "numeracion_taller" (
    "taller_id" UUID NOT NULL,
    "tipo" "DocumentKind" NOT NULL,
    "prefijo" VARCHAR(10) NOT NULL,
    "proximo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "numeracion_taller_pkey" PRIMARY KEY ("taller_id","tipo")
);

-- CreateIndex
CREATE UNIQUE INDEX "recuperacion_contrasena_token_hash_key" ON "recuperacion_contrasena"("token_hash");

-- CreateIndex
CREATE INDEX "recuperacion_contrasena_usuario_id_created_at_idx" ON "recuperacion_contrasena"("usuario_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "identidad_google_sub_key" ON "identidad_google"("sub");

-- CreateIndex
CREATE UNIQUE INDEX "inicio_google_state_hash_key" ON "inicio_google"("state_hash");

-- AddForeignKey
ALTER TABLE "recuperacion_contrasena" ADD CONSTRAINT "recuperacion_contrasena_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identidad_google" ADD CONSTRAINT "identidad_google_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "configuracion_taller" ADD CONSTRAINT "configuracion_taller_taller_id_fkey" FOREIGN KEY ("taller_id") REFERENCES "taller"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "numeracion_taller" ADD CONSTRAINT "numeracion_taller_taller_id_fkey" FOREIGN KEY ("taller_id") REFERENCES "taller"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Tokens y verificadores con formato fijo; nunca un token en claro.
ALTER TABLE recuperacion_contrasena
  ADD CONSTRAINT recuperacion_token_hash_formato CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT recuperacion_vencimiento_valido CHECK (expira_at > created_at);
ALTER TABLE inicio_google
  ADD CONSTRAINT inicio_google_state_formato CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT inicio_google_vencimiento_valido CHECK (expira_at > created_at);
ALTER TABLE identidad_google
  ADD CONSTRAINT identidad_google_sub_no_vacio CHECK (btrim(sub) <> '');

-- Datos comerciales. El dígito verificador del CUIT se valida en la API.
ALTER TABLE configuracion_taller
  ADD CONSTRAINT configuracion_cuit_formato CHECK (cuit IS NULL OR cuit ~ '^[0-9]{11}$'),
  ADD CONSTRAINT configuracion_vigencia_valida CHECK (vigencia_presupuesto_dias BETWEEN 1 AND 365),
  ADD CONSTRAINT configuracion_email_normalizado CHECK (email_contacto IS NULL OR (email_contacto = lower(btrim(email_contacto)) AND email_contacto <> '')),
  ADD CONSTRAINT configuracion_logo_completo CHECK (
    (logo_archivo IS NULL AND logo_tipo IS NULL AND logo_bytes IS NULL AND logo_actualizado_at IS NULL) OR
    (logo_archivo IS NOT NULL AND logo_tipo IN ('image/png', 'image/jpeg', 'image/webp')
      AND logo_bytes BETWEEN 1 AND 2097152 AND logo_actualizado_at IS NOT NULL));

-- Correlativos: prefijo corto en mayúsculas y número positivo.
ALTER TABLE numeracion_taller
  ADD CONSTRAINT numeracion_prefijo_formato CHECK (prefijo ~ '^[A-Z0-9-]{0,10}$'),
  ADD CONSTRAINT numeracion_proximo_positivo CHECK (proximo >= 1);

ALTER TABLE registro_pendiente
  ADD CONSTRAINT registro_datos_opcionales_no_vacios CHECK (
    (telefono IS NULL OR btrim(telefono) <> '') AND (localidad IS NULL OR btrim(localidad) <> '')
    AND (domicilio IS NULL OR btrim(domicilio) <> ''));

-- Talleres existentes: configuración y numeración iniciales.
INSERT INTO configuracion_taller (taller_id) SELECT id FROM taller ON CONFLICT DO NOTHING;
INSERT INTO numeracion_taller (taller_id, tipo, prefijo, proximo)
  SELECT id, 'WORK_ORDER', 'OT-', 1 FROM taller ON CONFLICT DO NOTHING;
INSERT INTO numeracion_taller (taller_id, tipo, prefijo, proximo)
  SELECT id, 'ESTIMATE', 'PRE-', 1 FROM taller ON CONFLICT DO NOTHING;

COMMIT;
