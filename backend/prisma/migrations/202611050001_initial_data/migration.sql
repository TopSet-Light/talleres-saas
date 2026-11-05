BEGIN;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'RECEPTION', 'MECHANIC');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateTable
CREATE TABLE "taller" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pertenencia" (
    "id" UUID NOT NULL,
    "taller_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pertenencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" UUID NOT NULL,
    "taller_id" UUID NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "name" VARCHAR(160),
    "phone" VARCHAR(40) NOT NULL,
    "dni_cuit" VARCHAR(20),
    "email" VARCHAR(254),
    "address" VARCHAR(300),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehiculo" (
    "id" UUID NOT NULL,
    "taller_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "patente" VARCHAR(20),
    "brand" VARCHAR(80),
    "model" VARCHAR(100),
    "year" INTEGER,
    "vin" VARCHAR(30),
    "mileage" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "titularidad_vehiculo" (
    "id" UUID NOT NULL,
    "taller_id" UUID NOT NULL,
    "vehiculo_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "desde" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasta" TIMESTAMPTZ(3),

    CONSTRAINT "titularidad_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "pertenencia_usuario_id_key" ON "pertenencia"("usuario_id");

-- CreateIndex
CREATE INDEX "pertenencia_taller_id_status_idx" ON "pertenencia"("taller_id", "status");

-- CreateIndex
CREATE INDEX "cliente_taller_id_phone_idx" ON "cliente"("taller_id", "phone");

-- CreateIndex
CREATE INDEX "cliente_taller_id_name_idx" ON "cliente"("taller_id", "name");

-- CreateIndex
CREATE INDEX "cliente_taller_id_dni_cuit_idx" ON "cliente"("taller_id", "dni_cuit");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_taller_id_id_key" ON "cliente"("taller_id", "id");

-- CreateIndex
CREATE INDEX "vehiculo_taller_id_cliente_id_idx" ON "vehiculo"("taller_id", "cliente_id");

-- CreateIndex
CREATE INDEX "vehiculo_taller_id_vin_idx" ON "vehiculo"("taller_id", "vin");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculo_taller_id_id_key" ON "vehiculo"("taller_id", "id");

-- CreateIndex
CREATE INDEX "titularidad_vehiculo_taller_id_vehiculo_id_desde_idx" ON "titularidad_vehiculo"("taller_id", "vehiculo_id", "desde");

-- CreateIndex
CREATE INDEX "titularidad_vehiculo_taller_id_cliente_id_idx" ON "titularidad_vehiculo"("taller_id", "cliente_id");

-- AddForeignKey
ALTER TABLE "pertenencia" ADD CONSTRAINT "pertenencia_taller_id_fkey" FOREIGN KEY ("taller_id") REFERENCES "taller"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pertenencia" ADD CONSTRAINT "pertenencia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_taller_id_fkey" FOREIGN KEY ("taller_id") REFERENCES "taller"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "vehiculo" ADD CONSTRAINT "vehiculo_taller_id_fkey" FOREIGN KEY ("taller_id") REFERENCES "taller"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "vehiculo" ADD CONSTRAINT "vehiculo_taller_id_cliente_id_fkey" FOREIGN KEY ("taller_id", "cliente_id") REFERENCES "cliente"("taller_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "titularidad_vehiculo" ADD CONSTRAINT "titularidad_vehiculo_taller_id_vehiculo_id_fkey" FOREIGN KEY ("taller_id", "vehiculo_id") REFERENCES "vehiculo"("taller_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "titularidad_vehiculo" ADD CONSTRAINT "titularidad_vehiculo_taller_id_cliente_id_fkey" FOREIGN KEY ("taller_id", "cliente_id") REFERENCES "cliente"("taller_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
