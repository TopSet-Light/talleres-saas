# Instrucciones de trabajo para Codex

## Contexto y fuentes

Este repositorio contiene un SaaS de gestión de talleres mecánicos argentinos. Es un monorepo con React, Vite y TypeScript en `frontend/`, NestJS en `backend/`, Prisma como ORM y PostgreSQL como base de datos.

Antes de cambiar código, leer:

1. `README.md`: alcance, decisiones confirmadas y arranque local.
2. `docs/estructura-del-proyecto.md`: ubicación del código actual y organización sugerida.
3. Los archivos de proyecto, pruebas y lockfile relacionados con el cambio.

### Lectura del PDF y consumo de tokens

- No abrir, extraer ni releer automáticamente `docs/requerimientos/Requerimientos-SaaS-Talleres (1).pdf` al iniciar una tarea o desarrollar un módulo.
- Consultar el PDF únicamente cuando el usuario lo pida explícitamente y sea necesario para resolver la tarea. Una referencia a un módulo o ID de historia no implica por sí sola una solicitud de leer el PDF.
- Usar primero las instrucciones del usuario, este archivo, la documentación Markdown y el código pertinente. Si falta un criterio imprescindible que solo está en el PDF, pedir al usuario ese criterio o que indique si quiere consultar el documento.
- Cuando corresponda leerlo, limitar la extracción a las páginas o secciones necesarias y reutilizar la información ya disponible en la conversación. No cargar el documento completo por defecto.
- El PDF aporta requisitos, no autorización para implementar todo el backlog. Respetar el alcance solicitado y las decisiones posteriores confirmadas por el usuario.

## Decisiones del repositorio

- Mantener el monorepo y usar **pnpm**, con el lockfile único `pnpm-lock.yaml` en la raíz. No introducir `package-lock.json`, `yarn.lock` ni otro gestor.
- Conservar React + Vite + TypeScript, NestJS, Prisma y PostgreSQL. No agregar una segunda API ni otro ORM.
- El entorno local se ejecuta con Docker Compose v2: servicios `frontend`, `api` y `postgres`. Los dos Dockerfiles tienen contexto de compilación en la raíz y comparten `.dockerignore`.
- El navegador llama a rutas relativas `/api`; Vite usa `api:3000` dentro de la red de Compose. Los nombres internos no son URLs para el navegador.
- El despliegue futuro en VPS y la elección entre Coolify y Dokploy siguen fuera del entorno local. No agregar infraestructura ni CI salvo que la tarea lo pida.
- Dar los comandos al usuario en Bash / Git Bash por defecto. En Git Bash, este clon está en `/c/TopSet-Software/talleres-saas`; no asumir que otros clones tendrán esa ruta.

## Organización e implementación

- Mantener el cambio acotado a la historia solicitada y conservar el trabajo previo. No reubicar los módulos actuales solo para que coincidan con el árbol futuro.
- Crear carpetas cuando haya código, pruebas o documentación concreta. No generar árboles vacíos, archivos `.gitkeep`, CRUD ni dependencias para reservar módulos futuros.
- Frontend: agrupar pantallas, componentes y acceso HTTP por funcionalidad en `src/features/` cuando se implemente el negocio. Colocar componentes reutilizables sin reglas de dominio en `src/shared/`.
- Backend: usar módulos NestJS por capacidad de negocio. Los controladores reciben HTTP y delegan; los servicios aplican permisos y reglas; el acceso a datos usa el módulo Prisma existente. Incorporar DTO y validación al desarrollar endpoints de negocio.
- Base: mantener el esquema en `backend/prisma/schema.prisma` y las migraciones versionadas en `backend/prisma/migrations/` cuando se aborde datos. No crear una aplicación independiente para PostgreSQL ni guardar archivos del volumen en Git.
- Las migraciones de negocio y el aislamiento multi-tenant pertenecen al punto 07 y las etapas posteriores. No aplicarlos como efecto colateral de una tarea de documentación.

## Reglas de negocio para las próximas historias

Aplicar las siguientes reglas resumidas al implementar cada área. La consulta del PDF se rige exclusivamente por la política de lectura anterior:

- Resolver el taller desde la identidad autenticada y validar permisos en la API; nunca confiar en un `taller_id` enviado por el navegador como prueba de autorización. Probar accesos cruzados entre dos talleres.
- Mantener relaciones e identificadores de negocio dentro del taller. Los correlativos de órdenes, presupuestos y liquidaciones son por taller; su asignación debe resistir concurrencia.
- Separar el estado operativo de una OT del saldo y estado de sus cobros.
- Presupuestos: admitir contactos no registrados, conservar la cotización aceptada y vincular la conversión a OT. Aceptar una cotización no consume stock. WhatsApp en el MVP abre un texto preparado y permite adjuntar manualmente el PDF.
- Cobros: usar importes decimales exactos y transacciones; conservar trazabilidad de anticipos, pagos y correcciones. No implementar facturación ARCA como parte de los comprobantes internos.
- Stock: consumo y movimiento deben ser atómicos e idempotentes. Bloquear stock negativo por defecto y registrar las excepciones autorizadas. Preferir movimientos compensatorios a borrar historial.
- Preservar historial de titularidad, cambios de estado y operaciones sensibles. HIS-02 y HIS-03 son P0 aunque EP-10 figure como P1; desarrollarlos con vehículos y órdenes.
- Archivos y PDFs de negocio deben tener acceso privado por taller. No guardar archivos reales de clientes, credenciales ni datos personales en fixtures.
- Base compartida con aislamiento lógico, una sucursal por taller y ARS son supuestos del PDF que deben confirmarse antes de fijar el esquema. RLS es una posible segunda capa, no una decisión ya implementada.

## Configuración y datos

- Documentar variables nuevas en `.env.example`; mantener `.env` ignorado y excluido de las imágenes.
- Las credenciales de PostgreSQL pertenecen a API y base. Toda variable `VITE_*` es pública: no colocar secretos en ella.
- No exponer cadenas de conexión, contraseñas ni trazas internas en respuestas HTTP o logs. No imprimir `.env` ni la salida interpolada de `docker compose config`.
- No borrar volúmenes, restablecer la base ni ejecutar migraciones destructivas sin autorización explícita para esos datos. Usar un entorno descartable para pruebas de persistencia y migraciones.
- Mantener el contrato público de `GET /api/health`: 200 con `{"status":"ok","database":"ok"}` tras una consulta real; 503 con `{"status":"unavailable","database":"unavailable"}` ante falla o timeout acotado.

## Verificación

Usar los scripts existentes, desde la raíz y con dependencias instaladas:

```bash
pnpm install --frozen-lockfile
pnpm --filter frontend typecheck
pnpm build
pnpm test
git diff --check
```

También se pueden ejecutar las comprobaciones sin herramientas de proyecto en el anfitrión:

```bash
docker compose exec frontend pnpm build
docker compose exec frontend pnpm test
docker compose exec api pnpm build
docker compose exec api pnpm test
```

Ejecutar las verificaciones pertinentes al cambio: no hace falta compilar aplicaciones por una edición solo documental. Para comportamiento nuevo o corregido, agregar pruebas que verifiquen reglas y resultados observables. Las pruebas actuales usan Vitest + Testing Library en frontend y `node:test` en backend; no introducir otro runner sin necesidad concreta.

Si cambian salud, conexión o Compose, verificar API disponible, base caída, recuperación y estados de pantalla. La persistencia se prueba en un entorno descartable con el procedimiento del README. Distinguir una prueba con consulta sustituida de una integración real con PostgreSQL. Registrar los resultados en `VERIFICATION.md` cuando corresponda, sin dar por aprobadas comprobaciones no ejecutadas.

## Entrega

- Actualizar README y documentación si cambian estructura, comandos, configuración o comportamiento.
- Vincular el cambio con la épica/historia cuando su ID esté disponible en la solicitud o el contexto, sin abrir el PDF solo para buscarlo. No inventar IDs para EP-11 a EP-14.
- Explicar qué cambió, cómo se verificó y qué sigue pendiente. No afirmar que pasó CI, fue desplegado, revisado o integrado si no ocurrió.
- No publicar, desplegar, hacer push ni modificar archivos ajenos al alcance como parte automática de una implementación local.
