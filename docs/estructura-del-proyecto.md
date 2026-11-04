# Estructura del proyecto

## Alcance de este documento

Organización sugerida para desarrollar el backlog de `requeriments/Requerimientos-SaaS-Talleres (1).pdf`, especialmente el mapa de épicas (p. 5), las funcionalidades (pp. 6–16), el backlog técnico (p. 17) y el modelo y navegación (p. 18).

Se conserva el monorepo confirmado: frontend React + Vite + TypeScript, backend NestJS + Prisma y PostgreSQL. Esta propuesta define dónde guardar cada parte; **no implementa módulos, modelos, migraciones, rutas ni pantallas futuras**. Los nombres de carpetas son una convención propuesta en inglés, mientras la interfaz del producto usa español argentino.

## Raíz del repositorio

```text
/
├── README.md                         Producto, alcance y arranque local
├── AGENTS.md                         Instrucciones de trabajo para Codex
├── VERIFICATION.md                   Evidencia de verificaciones y pendientes
├── .github/
│   ├── workflows/ci.yml              Instalación, Prisma, compilación y pruebas
│   └── pull_request_template.md      Descripción y verificación del cambio
├── docs/
│   ├── ci-github.md                  CI, protección de main y colaboración
│   ├── estructura-del-proyecto.md    Este mapa de carpetas y responsabilidades
│   └── requeriments/
│       └── Requerimientos-SaaS-Talleres (1).pdf
├── frontend/                         Aplicación web
├── backend/                          API y esquema Prisma
├── docker-compose.yml               Frontend, API, PostgreSQL y volumen local
├── .dockerignore                     Contexto raíz de ambos Dockerfiles
├── .env.example                      Variables de ejemplo sin secretos reales
├── .gitignore
├── package.json                      Scripts coordinados y versión de pnpm
├── pnpm-workspace.yaml               Paquetes frontend y backend
└── pnpm-lock.yaml                    Dependencias reproducibles
```

Se respeta el nombre real `docs/requeriments/` y el nombre del PDF agregado al repositorio. No crear otra copia en `docs/requisitos/`. No se necesita `infra/` por ahora: Compose y los Dockerfiles existentes resuelven el entorno local. Cuando se trabaje en despliegue o backups, su configuración concreta podrá justificar esa carpeta. Tampoco hay un paquete compartido obligatorio: extraer contratos solo si hay una necesidad real, sin exponer tipos de Prisma al navegador.

## Estado actual y crecimiento

Actualmente existen la pantalla de salud en `frontend/src/App.tsx`, su prueba y estilos, y los módulos `health/` y `database/` directamente en `backend/src/`. `backend/prisma/schema.prisma` contiene el datasource y generador, sin entidades de negocio. Se conservan esas ubicaciones.

Las carpetas que aparecen a continuación y no están en el repositorio son **propuestas**. Crear únicamente las necesarias para la historia en curso, sin mover el código existente en esta entrega.

## Frontend

```text
frontend/
├── Dockerfile
├── package.json
├── index.html
├── vite.config.ts                    Servidor local y proxy /api
├── tsconfig.json
├── public/                           Recursos públicos: iconos y futura PWA
└── src/
    ├── main.tsx                      Entrada de React (existente)
    ├── App.tsx                       Composición principal y salud actual
    ├── App.test.tsx                  Pruebas actuales de salud
    ├── style.css                     Estilos base actuales
    ├── test-setup.ts                 Configuración de pruebas existente
    ├── app/
    │   ├── routes/                   Rutas y composición de pantallas
    │   ├── layouts/                  Navegación de recepción y mecánica
    │   └── providers/                Sesión y estado transversal si se necesitan
    ├── features/
    │   ├── auth/                     Inicio/cierre de sesión y recuperación
    │   ├── workshops/                Alta de taller y pertenencia del usuario
    │   ├── users/                    Invitaciones, roles y bajas
    │   ├── customers/                Clientes, búsqueda y ficha
    │   ├── vehicles/                 Ficha, propietarios e historial
    │   ├── work-orders/              Ingreso, diagnóstico, tablero y entrega
    │   ├── estimates/                Presupuestos, PDF, aceptación y conversión
    │   ├── settlements/              Liquidaciones y detalle definitivo
    │   ├── payments/                 Anticipos, cobros, saldo y comprobantes
    │   ├── products/                 Catálogo de repuestos
    │   ├── inventory/                Movimientos, consumos, ajustes y alertas
    │   ├── dashboard/                Indicadores del taller
    │   ├── workshop-settings/        Datos comerciales, logo y numeración
    │   ├── search/                   Búsqueda global dentro del taller
    │   ├── audit/                    Consulta autorizada de eventos sensibles
    │   ├── appointments/             Futuro: turnos y agenda
    │   ├── suppliers/                Futuro: proveedores
    │   ├── purchases/                Futuro: órdenes y recepción de compras
    │   ├── fiscal-invoicing/         Futuro: facturación ARCA
    │   ├── subscriptions/            Lanzamiento comercial: suscripciones
    │   └── saas-admin/               Lanzamiento comercial: panel interno
    └── shared/
        ├── api/                      Cliente HTTP, errores y contratos públicos
        ├── ui/                       Componentes visuales reutilizables
        ├── hooks/                    Hooks sin reglas de un módulo concreto
        ├── lib/                      Formato de fechas, moneda y utilidades
        └── assets/                   Recursos estáticos importados por la app
```

Dentro de una funcionalidad, usar según necesidad `pages/`, `components/`, `api/`, `hooks/` y `types/`, con pruebas `*.test.tsx` o `*.test.ts` próximas al código. No crear cinco capas para una pantalla simple. Los contratos HTTP describen respuestas públicas, no entidades internas de la base. Las pantallas muestran carga, vacío, error y éxito reales.

El menú futuro se compone en `app/layouts/`: Inicio, Órdenes de trabajo, Clientes, Vehículos, Presupuestos, Liquidaciones y cobros, Productos y stock, Configuración. El historial de un vehículo vive en su ficha y el historial de estados en la OT; no requieren duplicar páginas o almacenamiento en un módulo genérico de historial. `audit/` corresponde a consultas transversales autorizadas. Ocultar un menú por rol no sustituye la autorización de la API.

`public/` contiene solo recursos públicos del producto. Logos privados, fotografías de vehículos y PDFs de clientes no se guardan ahí. La PWA y su estrategia de caché son trabajo futuro; no cachear datos privados de otros usuarios o talleres por defecto.

## Backend

Se propone un monolito modular NestJS. No se necesitan microservicios ni un servicio separado por épica.

```text
backend/
├── Dockerfile
├── package.json
├── tsconfig.json
├── prisma/                           Esquema y evolución de PostgreSQL
├── src/
│   ├── main.ts                       Bootstrap y prefijo /api (existente)
│   ├── app.module.ts                 Composición de módulos (existente)
│   ├── health/                       Salud HTTP y SELECT 1 (existente)
│   ├── database/                     PrismaService y DatabaseModule (existentes)
│   ├── config/                       Lectura y validación de configuración
│   ├── common/
│   │   ├── decorators/               Metadatos y acceso al contexto autenticado
│   │   ├── guards/                   Guardas realmente compartidas
│   │   ├── filters/                  Errores públicos consistentes
│   │   └── interceptors/             Comportamiento transversal HTTP
│   └── modules/
│       ├── auth/                     Sesión, credenciales y recuperación
│       ├── workshops/                Taller, pertenencias y contexto de acceso
│       ├── users/                    Usuarios, roles, invitaciones y bajas
│       ├── customers/
│       ├── vehicles/
│       ├── work-orders/
│       ├── estimates/
│       ├── settlements/
│       ├── payments/
│       ├── products/
│       ├── inventory/
│       ├── dashboard/                Consultas agregadas, no copia de datos
│       ├── workshop-settings/
│       ├── search/                   Consultas con alcance del taller
│       ├── audit/                    Eventos y consulta de operaciones sensibles
│       ├── files/                    Metadatos, permisos y almacenamiento privado
│       ├── documents/                Renderizado PDF y plantillas compartidas
│       ├── appointments/             Futuro
│       ├── suppliers/                Futuro
│       ├── purchases/                Futuro
│       ├── fiscal-invoicing/         Futuro, integración ARCA encapsulada
│       ├── subscriptions/            Lanzamiento comercial
│       └── saas-admin/               Administración de plataforma autorizada
└── test/
    ├── health.test.cjs               Contrato HTTP y timeout (existente)
    ├── unit/                        Reglas de negocio aisladas
    ├── integration/                 Prisma, transacciones y PostgreSQL real
    ├── e2e/                         Flujos HTTP completos y permisos
    └── fixtures/                    Datos ficticios y constructores de prueba
```

Patrón de un módulo, por ejemplo `modules/work-orders/`:

```text
work-orders/
├── work-orders.module.ts             Dependencias y servicios exportados
├── work-orders.controller.ts         Endpoints REST
├── work-orders.service.ts            Casos de uso y reglas de la OT
├── dto/                              Entradas y respuestas públicas
├── policies/                         Transiciones y permisos específicos
└── work-orders.repository.ts         Opcional, si simplifica consultas complejas
```

No crear repositorios genéricos que oculten filtros por taller ni una jerarquía de capas obligatoria para cada CRUD. Para casos simples un servicio puede usar PrismaService directamente. El contexto de taller se resuelve en acceso y se pasa a las operaciones de negocio, incluidas búsquedas y agregaciones. Los guards específicos de autenticación viven en `auth/`; `common/guards/` solo aloja comportamiento reutilizable.

`work-orders/` coordina el ingreso y la relación cliente/vehículo/OT. La API debe definir el límite transaccional del ingreso conjunto. El consumo de repuestos se coordina con `inventory/`, y el cierre económico con `settlements/` y `payments/`, sin que un controlador escriba directamente en otro dominio. Exportar servicios con interfaces claras y evitar dependencias circulares.

Los módulos funcionales determinan el contenido y autorización de sus documentos; `documents/` comparte el renderizado y las plantillas cuando haga falta. `files/` gestiona el almacenamiento privado; no es una carpeta pública de descargas. El proveedor de email, almacenamiento o ARCA se encapsula dentro del módulo que lo usa cuando se elija, sin añadir servicios de infraestructura anticipadamente.

## Base de datos y Prisma

PostgreSQL es un servicio de Compose, no un tercer paquete de pnpm. La definición versionada de datos pertenece al backend:

```text
backend/prisma/
├── schema.prisma                     Datasource, generador y futuros modelos
├── migrations/                       Futuras migraciones SQL generadas y revisadas
│   ├── migration_lock.toml
│   └── <timestamp>_<descripcion>/
│       └── migration.sql
└── seed.ts                           Futuro seed explícito de datos ficticios
```

Hoy solo existe `schema.prisma`. Mantener inicialmente un esquema único; no dividirlo en archivos sin una necesidad concreta y sin configurar Prisma para ello. El cliente generado es una dependencia de compilación, no código para editar o versionar. `seed.ts` necesitará script y configuración de ejecución cuando se implemente: no hay un seed habilitado actualmente.

Las siguientes agrupaciones son un mapa conceptual del PDF, **no un esquema SQL/Prisma aprobado ni migraciones listas**:

| Área | Entidades y relaciones a diseñar |
| --- | --- |
| Taller y acceso | Taller, Usuario, Pertenencia con rol, Invitación y mecanismo de sesión/recuperación según la autenticación elegida. Configuración comercial vinculada al taller. |
| Clientes y vehículos | Cliente, Vehículo e historial de titularidad. Cliente con varios vehículos; preservar el propietario que figuraba en trabajos anteriores. |
| Órdenes | OrdenTrabajo, detalles de servicios/repuestos, historial de estados y asignación de mecánico. Cliente, vehículo, creador y responsables del mismo taller. Checklist y adjuntos cuando se desarrollen sus historias. |
| Presupuestos | Presupuesto, detalles, versiones y aceptación; contacto sin cliente formal y vehículo opcional; vínculo con OT de origen o generada. Conservar precios y descripciones de cada cotización emitida. |
| Liquidaciones y cobros | Liquidación y sus detalles, Pago/anticipo y correcciones; asociación con la OT y saldo calculado. Comprobante interno separado de la factura fiscal futura. |
| Productos y stock | Producto, MovimientoStock y vínculo del consumo con detalle de OT; cantidades, motivo, usuario e identificador de operación para idempotencia. Servicio frecuente es una idea posterior, no catálogo obligatorio del MVP. |
| Configuración, documentos y auditoría | Datos comerciales y numeración por taller, metadatos de archivos privados y eventos de auditoría. El mecanismo de correlativos se definirá con sus garantías de concurrencia. |
| Turnos y compras (P2) | Turno/disponibilidad; Proveedor, OrdenCompra y recepción vinculada a movimientos de entrada. Modelo por definir al iniciar estas épicas. |
| ARCA (P2) | Factura vinculada a liquidación, CAE y notas de crédito. Modelo e integración fiscal por definir. |
| SaaS comercial | Plan, Suscripción, límites y estado de activación/suspensión del taller. Separar permisos de administración de plataforma de los del dueño del taller. |

Dashboard y búsqueda consultan datos existentes; no requieren duplicar tablas de negocio. Auditoría transversal no sustituye el historial propio de estados o titularidad.

Antes de fijar el esquema, confirmar los supuestos del PDF: base compartida con aislamiento lógico, una sucursal por taller y ARS como moneda principal. El diseño deberá contemplar UUID internos, relaciones e índices acotados por `taller_id`, correlativos por taller, importes decimales exactos, transacciones en cobros/stock e idempotencia. RLS se evaluará como segunda capa. Estas decisiones se implementan y prueban en las historias de datos/acceso; no están resueltas por este árbol.

Las migraciones se aplican tanto sobre una base vacía como sobre la versión anterior. No modificar una migración ya aplicada para cambiar el pasado. Las pruebas de integración deben incluir dos talleres y rechazar relaciones y consultas cruzadas. Los datos físicos viven en el volumen nombrado `postgres_data`, fuera de Git. Archivos privados y copias de seguridad requieren almacenamiento y recuperación propios cuando se aborde infraestructura.

## Cobertura del backlog

| Épica del PDF | Prioridad | Frontend `src/features/` | Backend `src/modules/` |
| --- | --- | --- | --- |
| EP-01 Acceso, talleres y usuarios | P0, con historias P1 | `auth`, `workshops`, `users` | `auth`, `workshops`, `users` |
| EP-02 Clientes | P0, con historias P1 | `customers` | `customers` |
| EP-03 Vehículos | P0, con historias P1 | `vehicles` | `vehicles` |
| EP-04 Ingreso y OT | P0, con historias P1 | `work-orders` | `work-orders` |
| EP-05 Presupuestos y PDF | P0, con historias P1 | `estimates` | `estimates`, apoyo de `documents`/`files` |
| EP-06 Liquidaciones y cobros | P0, con historias P1 | `settlements`, `payments` | `settlements`, `payments` |
| EP-07 Productos y stock | P0, con historias P1 | `products`, `inventory` | `products`, `inventory` |
| EP-08 Dashboard | P1 | `dashboard` | `dashboard` |
| EP-09 Configuración | P1 | `workshop-settings` | `workshop-settings` |
| EP-10 Historial, búsqueda y auditoría | P1; HIS-02/HIS-03 son P0 | `vehicles`, `work-orders`, `search`, `audit` | `vehicles`, `work-orders`, `search`, `audit` |
| EP-11 Turnos y agenda | P2 | `appointments` | `appointments` |
| EP-12 Proveedores y compras | P2 | `suppliers`, `purchases` | `suppliers`, `purchases` |
| EP-13 Facturación ARCA | P2 | `fiscal-invoicing` | `fiscal-invoicing` |
| EP-14 Suscripciones y administración SaaS | P1 comercial | `subscriptions`, `saas-admin` | `subscriptions`, `saas-admin` |

AUTH-07 y CFG describen la misma configuración comercial desde distintos criterios: mantener una implementación en `workshop-settings/`. HIS-02 se desarrolla con VEH-04 y HIS-03 con OT-12. EP-11 a EP-14 aún no tienen IDs de historia asignados en el PDF. El árbol no convierte esas épicas en trabajo aprobado para la entrega actual.

## Pruebas y documentación futura

- Frontend: pruebas de componentes y hooks junto a su funcionalidad; conservar Vitest y Testing Library existentes.
- Backend: conservar `test/health.test.cjs` y organizar nuevas pruebas por unidad, integración y flujo HTTP con el runner existente. Las pruebas de aislamiento, transacciones, idempotencia y numeración requieren casos específicos.
- Flujo completo de navegador: cuando se incorpore un runner E2E, alojar escenarios en `frontend/e2e/`, contra frontend, API y PostgreSQL del entorno de pruebas. La herramienta todavía no está elegida ni configurada.
- Seeds y fixtures: datos ficticios con dos talleres separados; no datos reales de clientes. Los fixtures de pruebas no son configuración inicial obligatoria de producción.
- Decisiones de arquitectura: crear `docs/decisiones/` cuando se registren decisiones concretas. Guías operativas de despliegue, backups y restauración podrán ir en `docs/operacion/` al abordar esas tareas.
- CI (parte de TEC-08) está configurado en `.github/workflows/ci.yml`; `docs/ci-github.md` explica su alcance y la activación de reglas en GitHub. Despliegue, backups y monitoreo (TEC-08 a TEC-10) siguen pendientes; no se incluye configuración de VPS.
