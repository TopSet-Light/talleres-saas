# 0001 · Acceso, sesiones, invitaciones y permisos

- **Estado:** adoptada para TS-19 (punto 08 · EP-01). Revisable por el equipo en el PR.
- **Fecha:** 9 de noviembre de 2026.
- **Historias:** AUTH-01, AUTH-02, AUTH-03, AUTH-04 y AUTH-06. Fuera de alcance: AUTH-05 (recuperación de contraseña), AUTH-07/CFG (datos comerciales), múltiples sucursales y usuarios en varios talleres.

## Contexto

El punto 07 dejó `taller`, `usuario` (email único y normalizado) y `pertenencia` (rol `OWNER`, `RECEPTION` o `MECHANIC` y estado `ACTIVE` o `INACTIVE`), con una sola pertenencia por usuario aunque esté inactiva. No hay credenciales, sesiones ni autorización HTTP. La tarjeta TS-19 pide cerrar cinco decisiones antes de implementar; este documento las registra.

## Principios

- El taller y el rol se resuelven **siempre** desde la sesión. Un `taller_id`, `usuario_id` o rol enviado por el navegador nunca autoriza nada.
- La API valida cada permiso; ocultar botones en el frontend es solo comodidad.
- Las respuestas no revelan contraseñas, tokens, hashes, trazas internas ni si un email pertenece a otro taller.

## 1. Matriz de permisos

| Permiso | Dueño/Administrador | Recepción | Mecánico |
| --- | :---: | :---: | :---: |
| Ver empleados del taller | ✅ | ❌ | ❌ |
| Invitar empleados y revocar invitaciones | ✅ | ❌ | ❌ |
| Cambiar roles | ✅ | ❌ | ❌ |
| Desactivar y reactivar accesos | ✅ | ❌ | ❌ |
| Clientes, vehículos y apertura de OT | ✅ | ✅ | Solo lectura |
| Diagnóstico y consumo de repuestos | ✅ | ✅ | ✅ |
| Precios, presupuestos, liquidaciones y cobros | ✅ | ✅ | ❌ |

- TS-19 implementa las filas de gestión de empleados. Las demás quedan definidas para que cada módulo futuro las aplique con el mismo mecanismo.
- Que Recepción registre cobros es una propuesta a confirmar con el taller piloto; el PDF solo fija que diagnosticar no habilita precios ni cobros.
- Los permisos se definen en código como una lista explícita por rol, no como roles editables por el usuario.
- Un taller puede tener varios dueños. Nadie puede desactivarse ni quitarse el rol de dueño a sí mismo, y no se puede dejar un taller sin dueños activos.

## 2. Contraseñas

- Hash **Argon2id** con los parámetros mínimos recomendados por OWASP: 19 MiB de memoria, 2 iteraciones y paralelismo 1.
- Longitud de 12 a 128 caracteres, sin reglas de composición obligatorias. Se rechazan contraseñas iguales al email.
- El hash se guarda en una tabla de credenciales separada de `usuario` y nunca sale de la API.

## 3. Sesiones

- Al iniciar sesión se genera un token aleatorio de 32 bytes. El navegador lo recibe en una cookie `httpOnly`, `SameSite=Lax`, `Path=/api` y `Secure` fuera de desarrollo. En la base se guarda solo su hash SHA-256.
- **Vencimiento:** 12 horas sin actividad y 7 días como máximo absoluto. La actividad renueva la expiración por inactividad, sin superar el máximo.
- **Cierre de sesión:** revoca la sesión usada y borra la cookie. Una sesión revocada o vencida no se reactiva.
- **Cada petición autenticada** comprueba que la sesión siga vigente y que la pertenencia esté `ACTIVE`. Así, una baja corta el acceso en la siguiente operación aunque la sesión siga abierta. Desactivar una pertenencia también revoca sus sesiones abiertas.
- **Protección CSRF:** `SameSite=Lax`, operaciones de cambio solo por `POST`, `PATCH` o `DELETE` con cuerpo JSON, y rechazo de peticiones de cambio cuyo `Origin` no coincida con la URL pública de la aplicación.
- Se prefieren sesiones guardadas en la base sobre JWT porque permiten revocar al instante, como exige AUTH-06.

## 4. Límite de intentos

- Registro, inicio de sesión, aceptación de invitación y verificación de email tienen límite por IP: 10 peticiones por minuto.
- El inicio de sesión además limita 5 intentos fallidos por email en 15 minutos.
- El MVP corre en una sola instancia, así que los contadores viven en memoria y se reinician con la API. Si se escala a varias instancias, habrá que moverlos a un almacenamiento compartido.

## 5. Registro (AUTH-01) y verificación de email

- **Datos obligatorios:** nombre del taller, nombre del dueño, email y contraseña.
- Taller, usuario, credencial y pertenencia de dueño se crean en **una sola transacción**: ante cualquier falla no quedan registros parciales.
- **El email se verifica** antes de permitir el primer inicio de sesión. Se envía un enlace con token de un solo uso, guardado como hash, que vence a las 24 horas. Se puede pedir un nuevo enlace.
- La respuesta del registro es la misma si el email ya existía, para no confirmar qué emails están registrados. En ese caso no se crea nada.
- El inicio de sesión responde «Email o contraseña incorrectos» sin distinguir la causa. Solo después de validar la contraseña puede indicar que falta verificar el email.

## 6. Email

- El envío se encapsula en un servicio de correo con transporte SMTP (`nodemailer`).
- **Desarrollo local:** servicio **Mailpit** en Docker Compose. Captura los correos sin enviarlos y los muestra en una interfaz web publicada solo en `127.0.0.1`.
- **Staging y producción:** el proveedor real (SMTP o API) se elegirá al preparar staging, cambiando solo la configuración.
- **Configuración nueva:** URL pública de la aplicación para armar los enlaces, servidor SMTP y remitente. Se documentan en `.env.example` sin valores secretos.

## 7. Invitaciones (AUTH-03)

- Solo un dueño activo invita, indicando email y rol (Recepción, Mecánico o Dueño).
- El enlace contiene un token aleatorio de un solo uso, guardado como hash, que **vence a las 72 horas**. Una nueva invitación al mismo email en el mismo taller invalida la anterior, y el dueño puede revocar las pendientes.
- Al aceptar, la persona elige nombre y contraseña. Usuario, credencial y pertenencia se crean en una transacción y la invitación queda usada. El email se considera verificado porque el enlace llegó a ese buzón.
- El taller y el rol salen de la invitación guardada, nunca de la petición de aceptación.
- Se rechazan las invitaciones vencidas, usadas o revocadas.

## 8. Usuarios que ya pertenecen a otro taller

- Una invitación a un email ya registrado se puede crear, pero **se rechaza al aceptarla** con un mensaje genérico. El taller que invita no se entera de que ese email existe en otro taller.
- **Limitación conocida del MVP:** la pertenencia única incluye las inactivas. Un empleado dado de baja en un taller no puede unirse a otro con el mismo email. Su taller de origen sí puede reactivarlo. Resolverlo requiere una migración y cambios funcionales, previstos junto con «usuarios en varios talleres».

## Consecuencias

- **Migración nueva:** credenciales, sesiones, invitaciones y tokens de verificación de email, con relaciones acotadas al taller donde corresponda. Se agrega como migración nueva; no se editan las existentes.
- **Dependencias nuevas:**
  - Backend: `argon2`, `class-validator`, `class-transformer`, `@nestjs/throttler`, `cookie-parser` y `nodemailer`.
  - Frontend: `react-router`.
- **Pruebas:** HTTP contra PostgreSQL real con dos talleres ficticios, cubriendo accesos cruzados, permisos, sesiones, bajas e invitaciones.

## Pendiente fuera de TS-19

- Recuperación de contraseña (AUTH-05) y datos comerciales (AUTH-07/CFG).
- Auditoría de operaciones sensibles (TEC-13): registrar invitaciones, cambios de rol y bajas cuando se implemente ese módulo.
- Proveedor de email para staging y producción.
- RLS como segunda capa de aislamiento, todavía sin implementar.
