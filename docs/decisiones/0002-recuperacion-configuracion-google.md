# 0002 · Recuperación de contraseña, configuración del taller e ingreso con Google

- **Estado:** adoptada para TS-20. Revisable por el equipo en el PR.
- **Fecha:** 13 de noviembre de 2026.
- **Historias:** AUTH-05, AUTH-07/CFG, ingreso con Google y una corrección de TS-19. Amplía [0001 · Acceso](0001-acceso.md).

## 1. Límite de emails por destinatario (corrección de TS-19)

- El registro contaba las solicitudes recientes y después insertaba otra. Con 10 pedidos simultáneos se enviaban 4 emails en lugar de 3.
- **Decisión:** la verificación y la reserva se hacen en una transacción que toma un bloqueo de PostgreSQL por destinatario (`pg_advisory_xact_lock`). Los pedidos al mismo email se atienden de a uno y ven el contador real. El mismo mecanismo limita la recuperación de contraseña (`common/email-quota.ts`).

## 2. Recuperación de contraseña (AUTH-05)

- Enlace aleatorio de 32 bytes, guardado solo como hash SHA-256, de un solo uso y con **una hora** de vigencia, más corto que el registro porque da acceso a una cuenta existente.
- La solicitud responde igual para emails registrados y desconocidos, con un máximo de 3 emails por hora por destinatario y además el límite por IP.
- Al elegir la contraseña nueva, en una transacción:
  - se marca el enlace como usado de forma condicional;
  - se reemplaza el hash Argon2id y el email queda verificado;
  - se anulan los demás enlaces pendientes;
  - se **revocan todas las sesiones**.

  Después se libera el bloqueo por intentos fallidos de ese email.
- El enlace apunta a `/restablecer-contrasena#token=…`, la ruta del frontend de TS-21. El token va en el fragmento, como en el resto de los enlaces.

## 3. Configuración del taller (AUTH-07 / CFG)

- **Un solo módulo** (`modules/workshop-settings`) y una fila por taller en `configuracion_taller`. El nombre comercial es `taller.name`, para no duplicarlo.
- **Permisos:** consultar y editar exigen `settings.read` y `settings.manage`, hoy solo del Dueño/Administrador. El logo lo puede ver cualquier integrante activo del taller, porque se va a usar en documentos. El taller siempre sale de la sesión.
- **CUIT:** se guarda con 11 dígitos y se valida el dígito verificador (módulo 11).
- **Edición con `PUT`:** reemplazo completo, sin parches parciales, para que el frontend envíe el formulario entero y no queden combinaciones a medias.

## 4. Numeración por taller

- Tabla `numeracion_taller` con una fila por taller y tipo (`WORK_ORDER`, `ESTIMATE`): prefijo y próximo número. Los valores iniciales son `OT-` y `PRE-`, desde 1.
- **Asignación:** `NumberingService.allocate` hace `UPDATE … SET proximo = proximo + 1 RETURNING` dentro de la transacción del alta del documento. Es atómica: dos altas simultáneas nunca reciben el mismo número, y si la transacción se revierte el número no se consume.
- **Edición:** el dueño puede cambiar el prefijo y el próximo número, pero **no bajarlo** respecto del valor actual. La comprobación bloquea las filas de numeración (`FOR UPDATE`) para competir correctamente con las altas.
- **Formato visible:** prefijo y al menos 4 dígitos, por ejemplo `OT-0042`.

## 5. Logo privado

- **En disco**, en un volumen Docker propio (`workshop_files`, `FILES_DIR`), y no en la base de datos, por decisión del equipo. La base guarda solo la referencia y los metadatos.
- **Validación:** PNG, JPEG o WebP de hasta 2 MB, detectados por la firma del archivo y no por el nombre ni el tipo que declara el navegador. SVG queda excluido porque puede contener scripts.
- **Nombres de archivo:** los genera la API (`workshops/<taller>/logo-<uuid>.<ext>`) con una expresión estricta y comprobación de ruta, para que no se pueda salir de la carpeta.
- **Escritura y reemplazo:** la escritura es atómica (archivo temporal y `rename`). El archivo nuevo se guarda antes de actualizar la base, y el anterior se borra solo cuando la base confirmó.
- **Entrega:** solo por la API, con `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` y `Content-Security-Policy: default-src 'none'`.
- **Consecuencia:** el volumen debe incluirse en los backups (TEC-09) junto con PostgreSQL.

## 6. Ingreso con Google

- **Alcance decidido:** solo ingresar con cuentas existentes. No crea usuarios ni talleres, y no se usa para aceptar invitaciones. Si el email no tiene cuenta, el frontend ofrece registrar el taller.
- **Protocolo:** OpenID Connect con código de autorización, **PKCE S256**, `state` y `nonce`, y solo el alcance `openid email`.
  - **`state`:** se guarda como hash en `inicio_google`, de un solo uso y con 10 minutos de vigencia, y además se ata al navegador con la cookie httpOnly `taller_google_state`, limitada a `/api/auth/google`. Eso evita que un tercero inicie la sesión por otro.
  - **ID token:** se verifica con `google-auth-library` (firma, audiencia, emisor y vencimiento) y se compara el `nonce`.
- **Requisitos para entrar:** `email_verified = true` y una pertenencia activa.
- **Vinculación:** la primera vez, por email verificado, guardando el `sub` de Google en `identidad_google`. Después se reconoce por `sub` aunque cambie el email en Google. Otra cuenta de Google con el mismo email que un usuario ya vinculado se rechaza.
- **Errores:** se informan con una redirección a `/login?google=<motivo>`, sin detalles internos.
- **Configuración:** `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, juntos u omitidos. Sin ellos la función queda deshabilitada y `GET /api/auth/options` lo informa.
- **Pruebas:** usan un Google simulado que solo reemplaza el intercambio de red. Probar con Google real requiere crear el cliente OAuth (pendiente).

## 7. Datos del registro de TS-21

- El formulario de TS-21 envía teléfono, localidad y domicilio. Se aceptan como opcionales, se guardan en la solicitud pendiente y pasan a la configuración del taller al completar el registro.

## Pendiente

- Probar el ingreso con un cliente OAuth real de Google.
- Conectar el frontend de TS-21: recuperación, configuración, `/auth/options`, `/login?google=…` y subida del logo.
- Limpieza periódica de intentos de Google y enlaces vencidos (no afecta la seguridad: se rechazan por fecha).
- Backups del volumen de archivos (TEC-09).
