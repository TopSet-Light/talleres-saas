# Registro de verificaciones — 3 de noviembre de 2026

Entorno: Windows, Node.js 22.23.4, pnpm 10.26.2, Docker CLI 27.3.1 y Compose v2.29.7.

| Comprobación | Resultado y evidencia |
| --- | --- |
| Dependencias reproducibles | `pnpm install` generó `pnpm-lock.yaml`; `pnpm install --frozen-lockfile --offline` pasó sin cambios de resolución. |
| Frontend | `pnpm --filter frontend build`: TypeScript sin errores y compilación Vite correcta. `pnpm --filter frontend test`: 6 pruebas aprobadas, incluyendo carga, éxito, HTTP 503, cuerpo no saludable, error de red, respuesta inválida y cancelación por timeout. |
| Backend | `pnpm --filter backend test`: generación Prisma y compilación correctas; 2 pruebas aprobadas. Servidor HTTP Nest real con consulta sustituida verifica `SELECT 1`, contrato exacto 200/503, recuperación y ausencia de secretos. Otra prueba verifica timeout de 3 segundos y que no se acumulan consultas pendientes. |
| API real sin PostgreSQL | Arrancó con una URL local a un puerto sin servidor. `curl.exe -i http://127.0.0.1:3000/api/health` devolvió HTTP 503, `Cache-Control: no-store` y `{"status":"unavailable","database":"unavailable"}` en aproximadamente 2 segundos. |
| Navegador, verificación parcial | Con Vite ejecutado en el anfitrión, el navegador abrió `http://localhost:5173/`, mostró «Gestión de talleres», «Consultando…» y luego «Servicio no disponible». El destino interno `api` no existe fuera de Compose. Esto verifica salida de carga con proxy inaccesible, **no** el recorrido exitoso hasta PostgreSQL. |
| Compose | `docker compose config --quiet` pasó con `.env` copiado desde el ejemplo. |
| Imágenes | `docker manifest inspect postgres:17.11-bookworm` y `docker manifest inspect node:22.23.4-bookworm-slim` encontraron ambas etiquetas, incluyendo plataformas amd64 y arm64. |
| Secretos | `git check-ignore .env` confirmó que está ignorado. Revisión de Compose y Dockerfiles: frontend sin credenciales; `.env` excluido del contexto raíz. No hay variables `VITE_*`. |
| Formato | `git diff --check` sin errores de espacios. |
| Arranque limpio con Docker | **Pendiente**: Docker Desktop devolvió HTTP 500 en `/version` y `/containers/json` al ejecutar `docker compose up --build -d`. También falló `docker ps`, aun probando API 1.41 además de 1.47. No se pudo construir ni levantar el entorno. No se reinició Docker Desktop para evitar afectar otros proyectos. |
| Recorrido navegador → API → PostgreSQL | **Aprobado, comprobación posterior a las 15:55 (Argentina)**: con Docker Desktop recuperado, los tres servicios estaban activos. `/api/health` respondió HTTP 200 con `{"status":"ok","database":"ok"}` y el navegador mostró «Conexión correcta» y el JSON real. |
| Caída y recuperación de PostgreSQL real | **Aprobado, 15:55–15:56 (Argentina)**: `docker compose stop postgres` produjo HTTP 503 con `{"status":"unavailable","database":"unavailable"}`; al recargar, la pantalla mostró «Servicio no disponible» y ese JSON. Después de `docker compose start postgres`, la API volvió a HTTP 200 y la pantalla a «Conexión correcta». No se reconstruyeron imágenes ni se reinició la API; los tres servicios quedaron funcionando. |
| Persistencia después de recrear contenedores | **Pendiente** por el mismo fallo. No se creó ningún dato de prueba en una base real. |
| Recarga dentro del contenedor | **Pendiente** por el mismo fallo. Configurado montaje solo de fuente y polling, conservando dependencias de la imagen. |

## CI de GitHub — 4 de noviembre de 2026

Alcance: integración continua de TEC-08 y guía de colaboración; sin despliegue ni cambios de configuración remota. Entorno local: Windows, Node.js 22.23.4 y pnpm 10.26.2.

| Comprobación | Resultado y evidencia |
| --- | --- |
| Instalación reproducible | `pnpm install --frozen-lockfile` con `CI=true` aprobado, sin modificar el lockfile. La descarga inicial falló por DNS del entorno restringido; se completó con acceso autorizado fuera de ese entorno. |
| Prisma | `pnpm --filter backend exec prisma validate` aprobado con URL ficticia de CI, sin conectar a PostgreSQL. |
| Tipos y compilación | `pnpm --filter frontend typecheck` y `pnpm build` aprobados; frontend Vite y backend TypeScript/Prisma compilaron correctamente. |
| Frontend | `pnpm test` ejecutó y aprobó las 6 pruebas del frontend. |
| Backend | En la misma ejecución, la prueba HTTP falló con `fetch failed` dentro del entorno restringido y la de timeout pasó. Repetición autorizada con `pnpm --filter backend test` fuera de la restricción: 2/2 aprobadas. HTTP local real con consulta sustituida; no integración con PostgreSQL. |
| Workflow | Revisión manual de eventos, comandos, permisos de lectura, timeout, concurrencia y correspondencia con scripts existentes. Sin validación con actionlint, que no está instalado. |
| Formato | `git diff --check` aprobado. |
| GitHub Actions y protección de main | **Pendientes**: subir e integrar el PR, comprobar `CI / Quality` en el runner de GitHub y guardar el ruleset según `docs/ci-github.md`. La aprobación obligatoria se activa al final. No se hizo push ni se modificaron reglas remotas. |

## Acceso local a PostgreSQL — 5 de noviembre de 2026

- Se publicó `127.0.0.1:5432:5432` y se aplicó con `docker compose up -d postgres`, conservando el volumen existente.
- `docker compose config --quiet` aprobado. `docker compose ps` mostró PostgreSQL saludable y `docker compose port postgres 5432` devolvió `127.0.0.1:5432`.
- Una conexión TCP desde Windows a `127.0.0.1:5432` fue correcta. `docker compose exec -T postgres psql -U talleres -d talleres -c "SELECT 1 AS connection_ok;"` devolvió `1` contra PostgreSQL real.
- Usuario y base confirmados: `talleres`. No se mostró la contraseña ni se modificaron datos.
- `git diff --check` aprobado. La conexión autenticada desde Database Client queda pendiente de completar por el usuario.
- Inicialmente frontend y API no estaban levantados. Se iniciaron con `docker compose up -d frontend api`: la consulta a `http://127.0.0.1:5173/api/health` devolvió HTTP 200 con `{"status":"ok","database":"ok"}`. Al detener PostgreSQL devolvió HTTP 503 con `{"status":"unavailable","database":"unavailable"}`; después de iniciarlo con `docker compose up -d --wait postgres`, volvió a HTTP 200 sin reiniciar la API. Los tres servicios quedaron activos y PostgreSQL saludable. No se verificaron visualmente los estados de pantalla.

## Punto 07 · Datos — 5 de noviembre de 2026

Alcance: modelos Prisma, dos migraciones SQL transaccionales, integridad por taller, historial de titularidad, datos ficticios y pruebas de integración. No se implementó el punto 08. Se conservaron los cambios previos de acceso local a PostgreSQL; no se modificó Compose ni se aplicaron migraciones sobre el volumen de desarrollo.

| Comprobación | Resultado y evidencia |
| --- | --- |
| Dependencias | `pnpm install --frozen-lockfile` aprobado con `CI=true`, sin modificar el lockfile ni agregar dependencias. El intento offline no encontró todos los paquetes; la instalación se completó con acceso autorizado. |
| Esquema Prisma | `pnpm --filter backend exec prisma validate` aprobado con URL ficticia, sin consultar la base de desarrollo. |
| Compilación | `pnpm build` aprobado: frontend con comprobación de tipos y Vite; backend con generación Prisma y TypeScript. |
| Pruebas existentes | `pnpm test` aprobó las 6 pruebas del frontend. La prueba HTTP del backend falló por `fetch failed` en el entorno restringido; repetición autorizada de `pnpm --filter backend test`: 2/2 aprobadas. La salud usa consulta sustituida, no PostgreSQL real. |
| Integración real | `pnpm --filter backend test:data` aprobado: 12 escenarios, 13 tests contabilizados por node:test incluyendo el contenedor padre. PostgreSQL `17.11-bookworm` real en un contenedor propio, puerto aleatorio en loopback y almacenamiento tmpfs; sin volumen persistente ni lectura de `.env`. |
| Migraciones | Instalación desde base vacía y deploy repetido aprobados. Actualización desde la primera migración con dos talleres, cuatro usuarios y dos vehículos conserva datos, normaliza patente y completa titularidades. Ambas migraciones quedan aplicadas en cada esquema de prueba. |
| Restricciones | Rechazo de cliente ajeno al crear/editar vehículo, FK cruzadas de titularidad, cambio de taller de registros y segunda pertenencia incluso inactiva. Unicidad de patente activa por taller, normalización, archivo/reactivación y carrera de dos inserciones comprobados. |
| Titularidad | Creación inicial automática, cierre/apertura al cambiar cliente, rollback conjunto, bloqueo de reescritura/borrado y concurrencia de dos propietarios comprobados. La primera ejecución detectó fechas del anfitrión adelantadas respecto de PostgreSQL; se corrigió el cierre para que nunca retroceda respecto del inicio y se agregó una fecha futura explícita al escenario. Reejecución completa aprobada. |
| Datos ficticios | Seed de dos talleres repetido sin duplicaciones ni restablecer cambios existentes; incluye tres roles en A y dueño en B, sin credenciales. SQL directo confirma normalización, FK y restricciones de borrado. |
| Limpieza y formato | El contenedor de prueba se detuvo y eliminó; `docker ps --filter name=talleres-point07-` no mostró contenedores remanentes. `git diff --check` aprobado. |
| Límites | Sin autorización HTTP, RLS, login, invitaciones ni pantallas de negocio. No se ejecutó CI remoto, despliegue ni migración/carga de demostración en la base local del usuario. Los comandos para aplicar esas migraciones están en la sección «Migraciones y datos de prueba» del README. |

## Aplicación local del punto 07 — 5 de noviembre de 2026

A solicitud del usuario se aplicaron las migraciones a la base local de Compose, conservando el volumen y la publicación del puerto para VS Code.

- `docker compose up -d --wait postgres`: PostgreSQL saludable. Consulta previa a `pg_tables`: esquema público sin tablas.
- `docker compose build api`: imagen reconstruida y compilación correcta con las migraciones del punto 07.
- `docker compose run --rm --no-deps api pnpm db:migrate`: `202611050001_initial_data` y `202611050002_data_integrity` aplicadas correctamente.
- `docker compose run --rm --no-deps api pnpm db:status`: esquema actualizado, sin migraciones pendientes.
- Consulta directa a PostgreSQL confirma `taller`, `usuario`, `pertenencia`, `cliente`, `vehiculo`, `titularidad_vehiculo` y `_prisma_migrations`; ambas migraciones tienen fecha de finalización. Las seis tablas de negocio tienen cero registros.
- No se ejecutó el seed de demostración ni se implementó el punto 08. No se borraron datos ni se restableció la base.

## Punto 08 · Acceso (TS-19) — 9 de noviembre de 2026

Alcance: AUTH-01, AUTH-02, AUTH-03, AUTH-04 y AUTH-06 según `docs/decisiones/0001-acceso.md`. Entorno: Windows 11, Node.js 22.23.4 (fnm), pnpm 10.26.2, Docker 29.8.2 y Compose 5.6.0. En este equipo hay un PostgreSQL de Windows en el puerto 5432, así que el clon usa un `docker-compose.override.yml` local, excluido de Git, que publica la base en `127.0.0.1:5433`.

| Comprobación | Resultado y evidencia |
| --- | --- |
| Instalación reproducible | `CI=true pnpm install --frozen-lockfile` aprobado. Dependencias nuevas fijadas con versión exacta. |
| Prisma | `prisma validate` aprobado con URL ficticia. El SQL de `202611090001_access` se generó con `prisma migrate diff` contra un PostgreSQL descartable y se completó a mano con checks, índice parcial y trigger. |
| Tipos y compilación | `pnpm --filter frontend typecheck` y `pnpm build` aprobados. |
| Pruebas sin base | `pnpm test`: frontend 20/20 (6 de salud existentes y 14 nuevas de registro, login, verificación, invitación, empleados, permisos y sesión vencida); backend 8/8 (2 de salud y 6 unitarias de permisos, intentos, configuración, tokens, Origin y Argon2id). |
| Integración con PostgreSQL real | `pnpm --filter backend test:data`: 24/24 en un contenedor `postgres:17.11-bookworm` descartable con tmpfs. Incluye las 13 de datos del punto 07, actualizadas para esperar la tercera migración, y 11 de acceso HTTP con la API real: registro atómico con falla simulada por trigger, respuestas genéricas, verificación de un solo uso, cookie `HttpOnly`/`SameSite=Lax`/`Path=/api`, logout con control de Origin, sesiones vencidas, invitaciones usadas, revocadas, vencidas y reemplazadas, email de otro taller, permisos con el frontend manipulado, ids cruzados entre dos talleres (404 sin cambios), dueños concurrentes, baja con sesión abierta, reactivación y límites por IP y por email. Sin contenedores remanentes. |
| Recorrido real en Docker | Proyecto descartable `talleres-e2e` (frontend, API, PostgreSQL y Mailpit): 21/21 comprobaciones por HTTP a través de Vite, leyendo los emails desde la API de Mailpit. Registro, email de verificación, login bloqueado antes de verificar, verificación, cookie sin `Secure` en http local, invitación por email, aceptación de un solo uso, 403 para Recepción en empleados, baja que corta la sesión abierta y bloquea el login, logout desde otro origen rechazado y SPA servida en rutas internas. Se eliminó con `down --volumes`. |
| Base local de desarrollo | `db:migrate` aplicó `202611090001_access`; `db:status`: 3 migraciones, esquema al día. Tablas nuevas `credencial`, `sesion`, `verificacion_email` e `invitacion`, sin datos de prueba. Salud HTTP 200. |
| Protección de `main` | Consultada por la API pública de GitHub: ruleset `main-protection` activo, con PR, 1 aprobación, CI `Quality` y rama actualizada obligatorios. |
| Formato | `git diff --check` aprobado. |
| Pendiente | No se revisaron las pantallas en un navegador ni el diseño responsive (Definition of Done 06): las pruebas del frontend usan jsdom y API simulada. CI remoto pendiente hasta el push. Las pruebas de integración siguen fuera del workflow de CI. Sin lint configurado. Falta elegir el proveedor de email para staging. |

## Revisión del PR #4 (TS-19) — 10 de noviembre de 2026

Correcciones pedidas por Ezequiel-Cagolo. Mismo entorno que la sección anterior.

| Comprobación | Resultado y evidencia |
| --- | --- |
| Registro con contraseña elegida por un tercero (comentario 1) | Corregido: el formulario solo guarda una solicitud (`202611100001_pending_registration`) y la contraseña se elige al abrir el enlace. Prueba de integración: el intruso registra primero el email del titular y no puede entrar; el titular completa su propio enlace, entra a su taller y el enlace del intruso queda anulado. |
| IP elegida por el cliente (comentario 2) | Corregido: Vite reemplaza `X-Forwarded-For` (`frontend/vite.proxy.ts`) y la API confía en `TRUST_PROXY_HOPS` proxies. Integración: con límite 3, cuatro logins con distinta primera entrada de `X-Forwarded-For` recibieron `401,401,401,429`. Pruebas unitarias del proxy (3). |
| Reenvío que anulaba enlaces (comentario 3) | Corregido: registrarse de nuevo no anula enlaces y hay un máximo de 3 emails por hora por destinatario. Integración: el cuarto registro no envía email y el primer enlace sigue vigente. |
| Logout fallido y `/auth/me` tardío (comentarios 4 y 5) | Corregido en `session.tsx` y `AppLayout.tsx`. Pruebas del frontend: un logout con error de red mantiene la sesión, muestra el error y el reintento funciona; un 401 del `/auth/me` inicial que llega después del login no lo pisa. La prueba detectó que el aviso global de 401 también debía ignorar pedidos anteriores, y se corrigió. |
| Tipos de `@Transform` (comentarios 6 y 7) | Aplicados en `auth/dto.ts` y `users/dto.ts`. |
| Comprobaciones del CI en local | `CI=true pnpm install --frozen-lockfile`, `prisma validate`, `typecheck`, `pnpm build` aprobados. `pnpm test`: frontend 26/26, backend 8/8. |
| Integración con PostgreSQL real | `pnpm --filter backend test:data`: 26/26, con las cuatro migraciones. |
| Recorrido real en Docker | Proyecto descartable `talleres-e2e`, eliminado con `down --volumes`: 11/12 comprobaciones aprobadas por HTTP a través de Vite y Mailpit, incluidos el intento del intruso y el límite por destinatario. La restante fue un error del script: esperaba el 429 en el pedido 11 de una serie de logins con `X-Forwarded-For` distinto, pero llegó en el 9 porque también se contaron los 2 logins previos de la misma IP. El 429 confirma que el encabezado falso no evade el límite. |
| Base local de desarrollo | Sin migrar en esta revisión: el entorno local quedó apagado a pedido del usuario. Aplicar con `docker compose run --rm --no-deps api pnpm db:migrate`. |
| Pendiente | Revisión visual en navegador y diseño según Figma (indicado por la revisión). Proveedor SMTP de producción con autenticación, `MAIL_FROM` de dominio verificado y `APP_URL` HTTPS (comentario 8). Pruebas de integración fuera del CI. Sin lint configurado. |

## TS-21 · Acceso y cuenta — 13 de noviembre de 2026

- Figma MCP confirmó acceso a la copia. El plan Starter limitó la lectura detallada de algunos frames. Las referencias de escritorio y móvil están enlazadas en el README.
- En Chrome a 1440 y 390 px se verificaron las pantallas de acceso y registro. Con Compose, Mailpit y PostgreSQL del proyecto de prueba se completaron alta, verificación por email, login, invitación, aceptación, baja, reactivación y logout.
- Pasaron el build del frontend, 26 pruebas de frontend, 26 pruebas de integración del backend con PostgreSQL descartable, ESLint y `git diff --check`.
- La migración de teléfono, país y localidad se aplicó en un entorno aislado. Las pruebas HTTP con PostgreSQL verificaron su persistencia al completar el alta y la conservación de talleres anteriores. En Chrome a 1440 y 390 px se revisó Inicio y se recorrió el registro con los nuevos campos, verificación y login con la API real.
- Pendientes con API: recuperación (AUTH-05), persistencia comercial (AUTH-07) e indicadores de Inicio (EP-08). Google se presenta como botón deshabilitado. La API vigente unifica invitaciones vencidas, usadas y revocadas en un estado público.
## TS-20 · Recuperación, configuración del taller y Google — 13 de noviembre de 2026

Alcance: AUTH-05, AUTH-07/CFG, ingreso con Google para cuentas existentes, datos opcionales del registro (TS-21) y corrección del límite de emails de TS-19. Decisiones en `docs/decisiones/0002-recuperacion-configuracion-google.md`. Mismo entorno que las secciones anteriores.

| Comprobación | Resultado y evidencia |
| --- | --- |
| Corrección de TS-19 | Prueba de integración con 10 registros simultáneos al mismo email. Contra el código anterior falló: 4 emails en lugar de 3. Con la reserva atómica (`pg_advisory_xact_lock`) pasa: exactamente 3. |
| Comprobaciones del CI en local | `CI=true pnpm install --frozen-lockfile`, `prisma validate`, `typecheck`, `pnpm build` y `git diff --check` aprobados. `pnpm test`: frontend 26/26, backend 13/13 (incluye CUIT, firma del logo, numeración, rutas del almacenamiento y configuración de Google). |
| Integración con PostgreSQL real | `pnpm --filter backend test:data`: 50/50, en tres archivos con esquemas propios. **Migración:** instalación vacía y actualización desde la versión anterior, con configuración y numeración iniciales para los talleres existentes. **AUTH-05:** misma respuesta para emails registrados y desconocidos; la contraseña y las sesiones anteriores dejan de funcionar; enlaces usados, vencidos e inválidos rechazados; los demás enlaces anulados; límite simultáneo; bloqueo por intentos liberado. **AUTH-07:** guardar y volver a consultar; validaciones por campo; la numeración no vuelve atrás; un campo `workshopId` se rechaza; Recepción recibe 403; otro taller no ve los datos ni el logo; logo validado por contenido (SVG disfrazado, más de 2 MB); el reemplazo borra el archivo anterior; 20 asignaciones simultáneas sin repetidos; una alta revertida no consume número. **Google (simulado):** PKCE S256, `state` atado al navegador y de un solo uso, `nonce`, vencimiento, email sin verificar, sin cuenta, baja, cancelación, error de Google, vinculación por `sub` y conflicto; deshabilitado sin credenciales. |
| Recorrido real en Docker | Proyecto descartable `talleres-e2e`, eliminado con `down --volumes`: 19/19 comprobaciones por HTTP a través de Vite. Registro con los campos de TS-21; configuración guardada y consultada; logo subido por el proxy, guardado en el volumen `workshop_files` y negado sin sesión; recuperación con el email real de Mailpit, con la sesión y la contraseña anteriores invalidadas; 10 registros simultáneos con exactamente 3 emails; Google deshabilitado sin credenciales. |
| Base local de desarrollo | Sin migrar: el entorno local queda apagado. Aplicar con `docker compose run --rm --no-deps api pnpm db:migrate`. |
| Pendiente | **Google:** probar con un cliente OAuth real (sin credenciales todavía). **TS-21:** conectar el frontend (recuperación, configuración, `/auth/options`, `/login?google=…` y subida del logo); TS-20 no modifica pantallas. **Volumen de archivos:** incluir en los backups. **Limpieza:** de intentos y enlaces vencidos. **CI:** las pruebas de integración siguen fuera. |

## Revisión del PR #6 (TS-20) — 14 de noviembre de 2026

Correcciones pedidas por Ezequiel-Cagolo. Para cada comentario se escribió primero una prueba de integración que lo reproduce; las 17 pruebas nuevas o adaptadas fallaron con el código anterior y pasan con las correcciones.

| Comentario | Falla reproducida con el código anterior | Resultado con la corrección |
| --- | --- | --- |
| 1 · Vincular Google exige controlar la cuenta | Una cuenta de Google con el email del dueño, nunca vinculada, entraba a su cuenta. | Responde `not-linked` y no crea vínculo. La vinculación exige sesión con contraseña y la misma sesión que la inició. Se prueban el robo de `state` por otra sesión, el cierre de sesión en el medio, los conflictos de vínculo y la desvinculación. |
| 2 · Login en curso con la contraseña anterior | Un login frenado después de verificar la contraseña anterior terminó en 200 con una sesión activa tras el restablecimiento. | El login se rechaza y no queda ninguna sesión activa. La prueba frena el login de forma determinista entre la verificación y la creación de la sesión. |
| 3 · Restablecimientos simultáneos | Dos enlaces vigentes usados a la vez devolvieron 500 (bloqueo mutuo). | 5 rondas: siempre uno 200 y el otro 400. |
| 4 · Numeración incompleta | Omitir `numbering` devolvió 500. | 400 con el campo indicado al omitir `numbering`, `workOrder` o `estimate`, o enviar `null`. |
| 5 · Números visibles duplicados | Los prefijos con dígitos se aceptaban. | La API rechaza `OT-1`, `OT1-` y `2026-`, y la base también (migración `202611140001_review_ts20`). |
| 6 · Archivos de logo huérfanos | 6 subidas simultáneas dejaron 4 archivos en disco. | Queda un solo archivo, el registrado en la base. 6 rondas de subida y borrado simultáneos mantienen el disco igual que la base. |

| Comprobación | Resultado y evidencia |
| --- | --- |
| Clon limpio de la rama (`1cc56cd`) | `CI=true pnpm install --frozen-lockfile`, `prisma validate`, `typecheck`, `pnpm build` y `git diff --check` aprobados. `pnpm test`: frontend 26/26, backend 13/13. |
| Integración con PostgreSQL real | `pnpm --filter backend test:data`: 62/62, en tres corridas consecutivas (las pruebas de concurrencia no fallaron en ninguna). |
| Recorrido real en Docker | Proyecto descartable desde el clon limpio, eliminado al terminar: 19/19 a través de Vite y Mailpit. |
| Pendiente | **Google:** probar con un cliente OAuth real. **TS-21:** necesita el botón «Vincular con Google» (`/api/auth/google/link/start`) y los nuevos motivos (`not-linked`; `?google=linked` y `?google=conflict` en el inicio). Lo demás pendiente de TS-20 sigue igual. |

## Segunda revisión del PR #6 (TS-20) — 18 de noviembre de 2026

Comentario de Ezequiel-Cagolo sobre la vinculación con Google: debe quedar atada a la sesión que la inició, no solo al usuario, y comprobarse al guardar el vínculo.

| Comprobación | Resultado y evidencia |
| --- | --- |
| Falla reproducida | Prueba de integración nueva con tres casos. Contra el código anterior, sin la migración nueva, los tres guardaban el vínculo (`?google=linked`). Los casos: cerrar sesión y volver a entrar con la misma cuenta antes del callback; cerrar sesión mientras la API habla con Google; restablecer la contraseña en ese intercambio. |
| Corrección | El intento guarda `sesion_id` (migración `202611180001_google_link_session`). El callback exige esa sesión exacta, y el vínculo se guarda en una transacción que relee la sesión y la pertenencia con `FOR SHARE`. Los tres casos responden `/login?google=invalid` y no guardan vínculo. |
| Comprobaciones | `pnpm --filter backend test:data`: 63/63 en tres corridas consecutivas. **Clon limpio (`3229d93`):** `CI=true pnpm install --frozen-lockfile`, `prisma validate`, `typecheck`, `pnpm build` y `git diff --check` aprobados; `pnpm test` frontend 26/26 y backend 13/13; `test:data` 63/63. **Docker:** recorrido real en un proyecto descartable 19/19, eliminado al terminar; corrió con la base en 5434 y Mailpit en 8026 porque otro proyecto local ocupaba 5433 y 8025. |

## Verificaciones de TS-21

### Integración de main en TS-21 — 18 de noviembre de 2026

Se integró main hasta `5f162ab`, conservando la interfaz de TS-21 y las correcciones de TS-20. El contrato de la API mantiene los datos de contacto opcionales para sus clientes anteriores. El formulario de TS-21 sigue solicitándolos.

Ambas ramas agregaban localidad al registro pendiente. Se hizo idempotente esa adición en las dos migraciones para admitir instalaciones de cualquiera de las ramas. Una migración adicional copia los datos de contacto anteriores hacia las columnas y configuración comercial de TS-20, conservando los campos históricos.

Pasaron `pnpm build`, las 27 pruebas del frontend, las 13 del backend (con permisos para HTTP local), las 63 de integración con PostgreSQL descartable y ESLint sobre el código de ambos paquetes. La base local de desarrollo queda pendiente de migrar.

1. Asegurar que `docker version` muestre el servidor y `docker ps` funcione. Resolver el estado de Docker Desktop antes de probar el proyecto.
2. En un clon limpio, seguir «Arranque desde un clon limpio» del README: copiar `.env.example`, completar contraseña y ejecutar `docker compose up --build`.
3. Abrir `http://localhost:5173`, comprobar «Conexión correcta» y el JSON. Consultar `/api/health` con `curl -i` y comprobar HTTP 200. Ejecutar las pruebas dentro de los contenedores con los comandos del README.
4. Editar un texto de `frontend/src/App.tsx`, verificar que cambia en el navegador sin reconstruir y restaurarlo.
5. Seguir «Caída y recuperación» del README: detener PostgreSQL, comprobar 503 y pantalla de error; iniciarlo y comprobar 200 sin reconstruir ni reiniciar API. Probar también la API detenida.
6. Seguir «Persistencia real en un entorno descartable» del README con el proyecto aislado `talleres-persistencia`: insertar `406`, ejecutar `down`, levantar otra vez, consultar el dato y eliminar la tabla de prueba.
7. Registrar resultados reales aquí. Hasta entonces, esta entrega tiene código y pruebas automatizadas aprobadas, pero la aceptación de integración Docker/PostgreSQL sigue pendiente.

### Integración frontend AUTH-05 y AUTH-07 — 18 de noviembre de 2026

- Figma MCP: acceso confirmado al archivo original. Se consultaron contexto y capturas de los frames 14:156 y 31:364 (recuperación), 12:802 y 31:418 (configuración). Referencias en el README. No se adjuntó a una tarjeta externa: se recibió el enlace de Figma, sin enlace o identificador de la tarjeta.
- Frontend: 38/38 pruebas Vitest + Testing Library. Las nuevas pruebas verifican solicitud y errores de recuperación, confirmación de contraseña, token usado/vencido, contrato completo comercial, error de numeración sin pérdida de datos, permisos de lectura/escritura y multipart del logo sin descartar ediciones pendientes. El equipo también respeta permisos individuales y evita consultar invitaciones sin autorización.
- Compilación: `pnpm build` aprobado para ambos paquetes; `pnpm --filter frontend build` y typecheck aprobados tras los cambios de permisos. ESLint sobre `frontend/src` aprobado. `git diff --check` sin errores.
- Integración real: proyecto Compose aislado `talleres-ts21-verificacion`, API Nest, PostgreSQL y Mailpit. Se aplicaron las migraciones pendientes solo en esa base descartable; no en la base de desarrollo. `GET /api/health` devolvió 200 y el contrato correcto.
- Chrome automatizado, 1440×1000 y 390×844, sin reemplazar respuestas de API: alta con teléfono/localidad/dirección, verificación desde Mailpit, login y Home; guardado comercial y consulta tras recarga; numeración que no retrocede; carga, lectura privada y eliminación de logo; invitación y aceptación por email; cambio de rol, baja, rechazo de cuenta desactivada, reactivación y denegación de configuración para otro rol; invitación usada; recuperación desde Mailpit, cambio de contraseña, invalidación de sesiones, rechazo del enlace usado y login con la contraseña nueva. 17 verificaciones completas correctas. Capturas locales en `tmp/ts21-browser/integracion-*.png` y resultado en `integration-result.json` (artefactos ignorados).
- Se revisaron las capturas de recuperación y configuración en escritorio y móvil; se ajustaron tipografía de campos, distribución y ausencia de desborde horizontal. Se conservan los estados sin datos operativos de EP-08 y los cambios visuales pedidos previamente. Google continúa como botón deshabilitado por indicación del usuario.
- Al terminar se detuvo únicamente el proyecto de verificación, conservando sus volúmenes. No se ejecutó CI remoto, ni se hizo push o merge de esta integración frontend.

### TS-21 · Registro con Google y pantallas de Acceso y cuenta — 18 de noviembre de 2026

- Figma: revisados los frames de la sección de escritorio `55:373` y las pantallas móviles correspondientes. El formulario de Google usa los frames `102:336` y `104:147`. El registro por email conserva la elección de contraseña después de verificar el buzón.
- Chrome a 1440 y 390 px con respuestas de API simuladas: botones de Google en ingreso y registro, navegación y creación del taller, perfil, confirmación de cierre, recuperación, invitación válida, vencida y usada, sesión vencida, baja y acceso denegado. Se verificaron la carga del ícono de Figma a 18 × 18 px y el formulario sin desborde horizontal.
- Frontend: 45/45 pruebas y compilación de Vite con chequeo de tipos. Backend: 13/13 pruebas en Docker y 65/65 pruebas de integración con PostgreSQL descartable. El intercambio de red con Google fue simulado. Se comprobó que confirmaciones simultáneas crean un solo taller, con configuración, numeración y sesión, y que una cuenta existente conserva su vínculo original.
- Compose local: aplicada `202611180003_google_registration` y recreada la API. Salud HTTP 200 con PostgreSQL. Los dos botones devolvieron a su pantalla de origen con el aviso `google=unavailable` cuando faltan las credenciales.
- Pendiente: configurar las dos variables OAuth de Google y probar ingreso y registro con una cuenta real. Los pasos están en el README.

## TS-22 · Correo transaccional con Resend — 21 de noviembre de 2026

- Backend: `pnpm --filter backend test`, 18/18. Incluye selección explícita de transporte, configuración incompleta, HTTPS y cookie segura en producción, contrato de envío de Resend y señal de timeout de 10 segundos, respuestas inválidas, rechazos 401/403/422/429/500, fallas de red y timeout simulados, ausencia de datos sensibles en logs, y entrega/rechazo contra un servidor SMTP local real. La primera ejecución restringida falló en conexiones HTTP/SMTP locales; la ejecución con permisos pasó completa.
- Frontend: typecheck y build de Vite aprobados; Vitest informó 45/45, incluidas las pantallas de salud. No se modificó código del frontend.
- ESLint sobre `app-config.ts`, `mail.service.ts` y `mail.test.cjs` aprobado. `git diff --check` y `docker compose config --quiet` aprobados, sin imprimir configuración interpolada. No se agregaron dependencias ni se modificó el lockfile.
- Integración real: `pnpm --filter backend test:data`, 65/65 contra PostgreSQL descartable, con correos capturados en memoria y Google simulado. El lanzador eliminó su propio contenedor al terminar.
- Compose: imágenes construidas y servicios levantados en el proyecto aislado `talleres-ts22-verificacion`, usando `.env.example`, puertos propios y volúmenes separados. Migraciones aplicadas únicamente a esa base de prueba. Registro, verificación, login, invitación/aceptación y recuperación/cambio de contraseña comprobados por HTTP a través de Vite y con emails reales capturados por Mailpit. Los tres enlaces usaron el `APP_URL` configurado.
- Salud real: HTTP 200 con PostgreSQL, 503 al detenerlo y recuperación a 200 sin reiniciar la API. Chrome automatizado comprobó `/estado`: «Conexión correcta», «Servicio no disponible» con base caída, recuperación, API caída y recuperación. No se sustituyeron respuestas HTTP en este recorrido.
- Artefactos de prueba ignorados en `tmp/ts22/`: override del proyecto aislado, scripts de comprobación HTTP/navegador y `smoke-result.json`. El proyecto de comprobación se apaga al terminar y conserva sus volúmenes. No se migró ni modificó la base de desarrollo.
- Pendiente: verificar el dominio propio en Resend, crear la clave de envío, configurar `MAIL_FROM` y `APP_URL` pública HTTPS, y probar entrega real a casillas controladas. Las pruebas de Resend usan `fetch` sustituido: no prueban autenticación real, DNS ni entrega del proveedor. Pasos en `docs/resend.md`. No se ejecutó CI remoto, push, merge ni despliegue.
- Configuración posterior: se agregó `notificaciones.topset-software.com.ar` en Resend. La carga de registros DNS queda pendiente de coordinar con el integrante del equipo que administra el DNS; el dominio todavía no está verificado y no se probó entrega real. Se conserva SMTP/Mailpit para desarrollo. El push posterior no implica despliegue ni validación del proveedor.
