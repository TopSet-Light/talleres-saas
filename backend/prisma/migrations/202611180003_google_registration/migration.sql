BEGIN;

ALTER TABLE "inicio_google" ADD COLUMN "es_registro" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "registro_google" (
  "id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "sub" VARCHAR(255) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "nombre_dueno" VARCHAR(160) NOT NULL,
  "expira_at" TIMESTAMPTZ(3) NOT NULL,
  "usada_at" TIMESTAMPTZ(3),
  CONSTRAINT "registro_google_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "registro_google_token_hash_key" ON "registro_google"("token_hash");

COMMIT;
