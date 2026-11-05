# SaaS de gestión de talleres mecánicos

Aplicación web para talleres mecánicos argentinos. La orden de trabajo reúne el problema informado por el cliente, el diagnóstico, los repuestos utilizados y el estado del vehículo hasta su entrega. Cada taller trabaja con sus propios usuarios y datos.

## Estado del proyecto

Etapa inicial de desarrollo. Están implementados los puntos 04, 05 y 06 (estructura, aplicaciones base y entorno local) y el 07 (modelos, migraciones e integridad de datos). El punto 08 de acceso todavía no está implementado: no hay login ni endpoints de negocio.

Decisiones confirmadas: base compartida con aislamiento por taller, una sucursal por taller y ARS en el MVP; cada usuario tiene una sola pertenencia y cada taller puede tener varios usuarios. Las instrucciones de datos están en [Migraciones y datos de prueba](#migraciones-y-datos-de-prueba).

## Alcance del MVP

- Registrar clientes y sus vehículos. Un cliente puede tener varios autos.
- Registrar el ingreso de un vehículo, abrir una orden de trabajo y seguir su estado en un tablero.
- Preparar presupuestos en PDF, compartirlos por WhatsApp y convertir un presupuesto aceptado en una orden de trabajo.
- Liquidar el trabajo realizado, registrar anticipos y cobros, y consultar el saldo pendiente.
- Controlar repuestos mediante entradas, consumos vinculados a órdenes y ajustes de stock.

La facturación electrónica con ARCA queda para una versión posterior. En el MVP se gestionan liquidaciones y comprobantes internos. Estos módulos todavía no están implementados.

## Tecnologías y decisiones

| Componente | Definición |
| --- | --- |
| Organización | Monorepo, confirmado por el equipo |
| Gestor | pnpm 10.26.2, lockfile único en la raíz |
| Runtime de contenedores | Node.js 22.23.4, imagen `node:22.23.4-bookworm-slim` |
| Frontend | React 19.3.1 + Vite 7.3.7 + TypeScript 5.9 |
| Backend | NestJS 11.2.8 + Prisma 6.19.3, confirmado por el equipo |
| Base de datos | Imagen oficial `postgres:17.11-bookworm` |
| Entorno local | Docker Engine + Docker Compose v2 |
| Despliegue previsto | VPS; Coolify o Dokploy pendiente de definición, fuera de esta entrega |

Las versiones resueltas de todas las dependencias están en `pnpm-lock.yaml`. Las imágenes fijan versión y distribución. La instalación usa `pnpm install --frozen-lockfile`. Prisma 6 mantiene su configuración de conexión en `schema.prisma`; una actualización mayor requiere revisar su configuración.

## Estructura

El [mapa de estructura actual y propuesta](docs/estructura-del-proyecto.md) detalla dónde incorporar cada módulo de frontend, backend y base de datos. Las [instrucciones para Codex](AGENTS.md) describen las convenciones de trabajo. El backlog completo y sus criterios de aceptación están en el [PDF de requerimientos](<docs/requerimientos/Requerimientos-SaaS-Talleres (1).pdf>).

```text
frontend/
  src/                    # React y pruebas de pantalla (*.test.tsx)
  Dockerfile              # Servidor Vite para desarrollo local
  vite.config.ts          # Proxy /api y recarga por polling
backend/
  src/
    database/             # Módulo Prisma, sin entidades de negocio
    health/               # Módulo, controlador y servicio de salud
  test/                   # Pruebas HTTP y de timeout (node:test)
  prisma/schema.prisma    # Taller, usuario, pertenencia, cliente, vehículo y titularidad
  prisma/migrations/      # Migraciones SQL versionadas y restricciones de integridad
  prisma/seed-demo.cjs     # Carga explícita de datos ficticios de dos talleres
  scripts/test-data.cjs    # PostgreSQL descartable para pruebas de datos
  Dockerfile
.dockerignore             # Ambos Dockerfiles compilan desde la raíz del monorepo
docker-compose.yml
.env.example
pnpm-workspace.yaml
pnpm-lock.yaml
package.json
README.md
```

El código de las aplicaciones va en su `src/`; las migraciones están en `backend/prisma/migrations/`. El punto 07 impide relaciones cruzadas en la base; el aislamiento de operaciones HTTP se implementará con acceso y los módulos de negocio. No se ejecuta ninguna migración para comprobar `SELECT 1`. No se crea `infra/` sin archivos que lo justifiquen.

## Arranque desde un clon limpio

Requisitos: Git, Docker con contenedores Linux y Docker Compose **v2.24 o superior**. En Windows, iniciar Docker Desktop con su motor Linux y habilitar el acceso al directorio del clon. No hace falta Node ni pnpm en la máquina anfitriona.

```sh
git clone <URL-de-este-repositorio> talleres-saas
cd talleres-saas
```

Copiar la configuración, en PowerShell:

```powershell
Copy-Item .env.example .env
```

En macOS/Linux:

```sh
cp .env.example .env
```

Editar `.env` y reemplazar `POSTGRES_PASSWORD` por una contraseña local. Para esta URL interpolada usar letras, números, guiones y guiones bajos. Los demás valores ya tienen ejemplos funcionales. No usar credenciales de producción.

```sh
docker compose up --build
```

Abrir **http://localhost:5173**. Si se cambió `FRONTEND_PORT`, usar ese puerto. La primera construcción descarga las imágenes y dependencias. Para ejecutar en segundo plano usar `docker compose up --build -d`.

La pantalla «Gestión de talleres» pasa de «Consultando…» a «Conexión correcta» y muestra la respuesta real. El navegador llama a `/api/health`; Vite reenvía a `http://api:3000`. `api` y `postgres` se resuelven dentro de Compose, no desde el navegador. El frontend y PostgreSQL publican sus puertos ligados a `127.0.0.1`, solo para acceso desde la máquina local; la API no publica puertos.

Para conectar Database Client de VS Code u otro cliente local a PostgreSQL, usar host `127.0.0.1`, puerto `5432`, SSL desactivado y los valores `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB` del `.env` como usuario, contraseña y base. El ejemplo usa `talleres` para usuario y base. La API conserva su conexión interna a `postgres:5432`. Después de agregar o cambiar la publicación del puerto, aplicar con `docker compose up -d postgres`; se conserva el volumen de datos. El puerto local `5432` debe estar libre.

Consulta de salud, válida en PowerShell y macOS/Linux:

```sh
curl -i http://localhost:5173/api/health
```

En Windows PowerShell clásico, usar `curl.exe` en lugar del alias `curl`.

```json
{"status":"ok","database":"ok"}
```

Responde HTTP 200 después de ejecutar `SELECT 1` con Prisma. Si la consulta falla o supera 3 segundos, devuelve HTTP 503 y exactamente `{"status":"unavailable","database":"unavailable"}`. La URL de conexión acota conexión, espera del pool y socket a 2 segundos. Las consultas de salud simultáneas comparten una consulta pendiente para evitar acumulación. El frontend cancela la consulta a los 7 segundos, muestra el error ante HTTP 503, error de red o respuesta inválida y permite reintentar recargando. No se devuelven errores internos al navegador.

## Desarrollo, logs y pruebas

```sh
docker compose ps
docker compose logs -f frontend api postgres
docker compose exec frontend pnpm typecheck
docker compose exec frontend pnpm build
docker compose exec frontend pnpm test
docker compose exec api pnpm build
docker compose exec api pnpm test
```

Las pruebas del frontend se ejecutan en `frontend/` con Vitest y Testing Library; las del backend en `backend/` con `node:test`, incluyendo un servidor HTTP real con la consulta de base sustituida para simular fallas y recuperación. La integración con PostgreSQL real se verifica con el procedimiento siguiente.

Editar `frontend/src/` o `frontend/index.html` activa recarga en Vite mediante polling, también con Docker Desktop. Se montan solo esos archivos: `node_modules` y los enlaces de pnpm quedan dentro de la imagen, sin montajes que los oculten. Si se cambian dependencias, configuración de Vite o código del backend, reconstruir con `docker compose up --build -d`.

Opcional, con Node 22.23.4 y pnpm 10.26.2 instalados en el anfitrión:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## Migraciones y datos de prueba

El esquema inicial contiene taller, usuario, pertenencia con rol y estado, cliente, vehículo e historial de titularidad (base de TEC-01, TEC-03, TEC-04 y TEC-06). Los roles almacenados son Dueño/Administrador, Recepción y Mecánico. Todavía no hay credenciales, sesiones ni validación de permisos HTTP.

Las relaciones compuestas por taller impiden asociar un vehículo con un cliente ajeno. La patente se normaliza quitando espacios y guiones y pasando a mayúsculas; es única entre vehículos activos del mismo taller. Se permiten vehículos sin patente y clientes con solo teléfono. Cambiar el cliente de un vehículo conserva automáticamente el propietario anterior en una operación atómica; el historial no se edita ni borra directamente. Los registros relacionados se archivan en lugar de eliminarlos. El aislamiento de lecturas se completará en el punto 08; no hay RLS implementado.

Las dos migraciones versionadas crean la estructura y agregan las restricciones e historial, conservando los datos de la primera versión. Son transaccionales; si los datos previos violan una restricción, fallan sin corregirlos ni borrarlos automáticamente. No editar migraciones aplicadas. Los índices parciales, checks y triggers viven en SQL: usar migraciones, no `prisma db push`, y conservar esas reglas al generar cambios futuros. Sucursales múltiples y usuarios en varios talleres requerirán migraciones y cambios funcionales posteriores.

Desde la raíz, con la configuración local preparada:

```bash
docker compose up -d --wait postgres
docker compose build api
docker compose run --rm --no-deps api pnpm db:migrate
docker compose run --rm --no-deps api pnpm db:status
docker compose up -d api
```

La migración no se ejecuta automáticamente al iniciar ni al consultar salud. Opcionalmente, para cargar datos ficticios en la base configurada para la API:

```bash
docker compose run --rm --no-deps api pnpm db:seed:demo
```

El seed crea dos talleres, cuatro usuarios con los tres roles representados, pertenencias, un cliente y un vehículo por taller. No contiene contraseñas ni habilita login. Es repetible y no restablece datos existentes. Usarlo únicamente en desarrollo o demostración; no se ejecuta automáticamente.

Con herramientas locales, configurar `DATABASE_URL` en el entorno del backend y usar `pnpm --filter backend generate`, `pnpm --filter backend db:migrate`, `pnpm --filter backend db:status` y, opcionalmente, `pnpm --filter backend db:seed:demo`. Estos comandos no cargan automáticamente el `.env` de Compose desde la raíz. No imprimir ni compartir la URL.

Para probar datos y migraciones con dependencias locales instaladas y Docker disponible:

```bash
pnpm --filter backend test:data
```

El lanzador usa un PostgreSQL propio con puerto aleatorio en loopback, contraseña efímera y almacenamiento `tmpfs`, sin leer `.env` ni montar el volumen de desarrollo. Prueba instalación vacía, actualización con datos, relaciones cruzadas, patentes, concurrencia, historial y rollback. Al finalizar elimina el contenedor. Si se interrumpe abruptamente, identificar cualquier contenedor `talleres-point07-*` con `docker ps` antes de detenerlo. Esta integración es independiente de `pnpm test` y no está incorporada al workflow de CI.

## CI y pull requests en GitHub

El workflow [CI](.github/workflows/ci.yml) verifica instalación reproducible, esquema Prisma, tipos, compilación y pruebas de ambas aplicaciones en PRs hacia `main` y pushes a `main`. Usa Node y pnpm alineados con el entorno local, sin necesitar secretos ni un servidor propio. Las pruebas actuales sustituyen la consulta de PostgreSQL; la integración real sigue siendo una comprobación local.

La [guía de CI y colaboración](docs/ci-github.md) explica cómo subir esta configuración, exigir PR y CI correcto para `main`, y **activar una aprobación obligatoria al final**, después de integrar este primer cambio. Incluye recomendaciones de merges, permisos y mantenimiento. Las reglas se activan en GitHub; el workflow por sí solo no bloquea pushes directos. No hay despliegue configurado.

## Caída y recuperación

Con el entorno levantado:

```sh
docker compose stop postgres
curl -i http://localhost:5173/api/health
```

Esperar HTTP 503 y el JSON de indisponibilidad. Recargar la pantalla: debe mostrar «Servicio no disponible» y el JSON. Luego:

```sh
docker compose start postgres
docker compose ps
curl -i http://localhost:5173/api/health
```

Cuando PostgreSQL esté saludable, esperar HTTP 200 y recargar para ver «Conexión correcta». No reconstruir ni reiniciar la API. También se puede comprobar API caída con `docker compose stop api`, recargar y verificar que sale de carga; restaurar con `docker compose start api`.

La API espera el healthcheck inicial de PostgreSQL para el arranque conjunto. Su conexión Prisma es perezosa: el proceso puede arrancar sin una base accesible y los pedidos posteriores vuelven a intentar la conexión.

## Persistencia real en un entorno descartable

Usar **otro clon/directorio**, con su propio `.env`, para no interferir con datos de desarrollo. Ejecutar estos comandos desde ese clon; `-p talleres-persistencia` crea un volumen independiente. Si el puerto 5173 está ocupado, asignar `FRONTEND_PORT=5174` en ese `.env`. Si el puerto 5432 está ocupado, cambiar solo en el Compose de ese clon descartable la publicación a `127.0.0.1:5433:5432`; la conexión interna de la API no cambia.

```sh
docker compose -p talleres-persistencia up --build -d
docker compose -p talleres-persistencia exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE TABLE public.local_persistence_probe (id integer PRIMARY KEY); INSERT INTO public.local_persistence_probe VALUES (406);"'
docker compose -p talleres-persistencia down
docker compose -p talleres-persistencia up -d --wait
docker compose -p talleres-persistencia exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id FROM public.local_persistence_probe;"'
docker compose -p talleres-persistencia exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP TABLE public.local_persistence_probe;"'
docker compose -p talleres-persistencia down
```

Esperar `406` después de recrear los contenedores. Los comandos con comillas anteriores funcionan en shells POSIX y PowerShell 7.3+; para Windows PowerShell 5.1, usar una sesión interactiva y ejecutar el SQL dentro de `psql`:

```sh
docker compose -p talleres-persistencia exec postgres sh
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Ejecutar el `CREATE TABLE` e `INSERT` anteriores, salir con `\q` y `exit`, recrear con `down` y `up -d --wait`, volver a entrar y ejecutar el `SELECT` y luego `DROP TABLE`. Esta tabla descartable no pertenece al esquema de negocio ni a las migraciones.

## Apagado y reinicio

```sh
docker compose down
docker compose up -d
```

`down` elimina contenedores y red, pero **conserva** el volumen `postgres_data`. Para reiniciar sin recrear: `docker compose restart`.

**Eliminación explícita y destructiva de los datos locales**, solo cuando se quiera reiniciar la base desde cero:

```sh
docker compose down --volumes
```

En el entorno descartable usar `docker compose -p talleres-persistencia down --volumes`. No ejecutar contra bases con datos que se quieran conservar. Cambiar usuario, contraseña o nombre de base en `.env` no modifica un volumen ya inicializado: PostgreSQL aplica esas variables solo al crear la base por primera vez.

## Configuración y secretos

`.env` está ignorado por Git y excluido del contexto Docker; no se copia a imágenes. Solo `api` recibe `DATABASE_URL` y solo `postgres` recibe las variables `POSTGRES_*`. El servicio frontend no recibe credenciales ni usa variables `VITE_*`. Cualquier futura variable con ese prefijo debe ser pública porque se incorpora al navegador. Evitar compartir la salida de `docker compose config`, que contiene la configuración interpolada.

## Verificaciones de esta entrega

Ver `VERIFICATION.md` para el registro de ejecución y sus limitaciones. Los procedimientos anteriores permiten repetir las comprobaciones desde un clon limpio.
