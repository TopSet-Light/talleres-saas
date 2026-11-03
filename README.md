# SaaS de gestión de talleres mecánicos

Aplicación web para talleres mecánicos argentinos. La orden de trabajo reúne el problema informado por el cliente, el diagnóstico, los repuestos utilizados y el estado del vehículo hasta su entrega. Cada taller trabaja con sus propios usuarios y datos.

## Estado del proyecto

Etapa inicial de desarrollo. Esta entrega implementa los puntos 04, 05 y 06: estructura, aplicaciones base y entorno local. El objetivo es comprobar navegador → API → PostgreSQL y persistencia al recrear contenedores.

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
  prisma/schema.prisma    # Configuración del datasource
  Dockerfile
.dockerignore             # Ambos Dockerfiles compilan desde la raíz del monorepo
docker-compose.yml
.env.example
pnpm-workspace.yaml
pnpm-lock.yaml
package.json
README.md
```

El código nuevo de cada aplicación va en su `src/`. Las migraciones futuras irán en `backend/prisma/migrations/`; el esquema de negocio y el aislamiento multi-tenant corresponden al punto 07. No se ejecuta ninguna migración para comprobar `SELECT 1`. No se crea `infra/` sin archivos que lo justifiquen.

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

La pantalla «Gestión de talleres» pasa de «Consultando…» a «Conexión correcta» y muestra la respuesta real. El navegador llama a `/api/health`; Vite reenvía a `http://api:3000`. `api` y `postgres` se resuelven dentro de Compose, no desde el navegador. Solo el frontend publica un puerto, ligado a `127.0.0.1`; API y base no publican puertos.

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

Usar **otro clon/directorio**, con su propio `.env`, para no interferir con datos de desarrollo. Ejecutar estos comandos desde ese clon; `-p talleres-persistencia` crea un volumen independiente. Si el puerto 5173 está ocupado, asignar `FRONTEND_PORT=5174` en ese `.env`.

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
