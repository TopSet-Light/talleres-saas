-- Revisión del PR #6 (TS-20), segunda ronda: la vinculación con Google queda atada a la sesión
-- exacta que la inició, no solo al usuario.
BEGIN;

-- AlterTable
ALTER TABLE "inicio_google" ADD COLUMN     "sesion_id" UUID;

-- AddForeignKey
ALTER TABLE "inicio_google" ADD CONSTRAINT "inicio_google_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Toda vinculación nueva registra su sesión. NOT VALID: no revisa ni modifica intentos ya
-- existentes (vencen a los 10 minutos y, sin sesión, la API los rechaza).
ALTER TABLE inicio_google ADD CONSTRAINT inicio_google_vinculacion_con_sesion
  CHECK (usuario_id IS NULL OR sesion_id IS NOT NULL) NOT VALID;

COMMIT;
