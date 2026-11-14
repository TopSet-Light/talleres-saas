-- Revisión del PR #6 (TS-20).
-- 1. Google solo se vincula desde una sesión iniciada con contraseña: el intento guarda el usuario.
-- 2. El prefijo de numeración no admite dígitos, para que «prefijo + número» sea inequívoco
--    (con dígitos, OT-1 + 0001 y OT- + 10001 producían el mismo OT-10001). Si algún taller ya
--    tiene un prefijo con dígitos, la migración falla sin modificarlo.
BEGIN;

-- AlterTable
ALTER TABLE "inicio_google" ADD COLUMN     "usuario_id" UUID;

-- AddForeignKey
ALTER TABLE "inicio_google" ADD CONSTRAINT "inicio_google_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE numeracion_taller DROP CONSTRAINT numeracion_prefijo_formato;
ALTER TABLE numeracion_taller ADD CONSTRAINT numeracion_prefijo_formato CHECK (prefijo ~ '^[A-Z-]{0,10}$');

COMMIT;
