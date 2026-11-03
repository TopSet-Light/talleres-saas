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

## Completar las verificaciones pendientes

1. Asegurar que `docker version` muestre el servidor y `docker ps` funcione. Resolver el estado de Docker Desktop antes de probar el proyecto.
2. En un clon limpio, seguir «Arranque desde un clon limpio» del README: copiar `.env.example`, completar contraseña y ejecutar `docker compose up --build`.
3. Abrir `http://localhost:5173`, comprobar «Conexión correcta» y el JSON. Consultar `/api/health` con `curl -i` y comprobar HTTP 200. Ejecutar las pruebas dentro de los contenedores con los comandos del README.
4. Editar un texto de `frontend/src/App.tsx`, verificar que cambia en el navegador sin reconstruir y restaurarlo.
5. Seguir «Caída y recuperación» del README: detener PostgreSQL, comprobar 503 y pantalla de error; iniciarlo y comprobar 200 sin reconstruir ni reiniciar API. Probar también la API detenida.
6. Seguir «Persistencia real en un entorno descartable» del README con el proyecto aislado `talleres-persistencia`: insertar `406`, ejecutar `down`, levantar otra vez, consultar el dato y eliminar la tabla de prueba.
7. Registrar resultados reales aquí. Hasta entonces, esta entrega tiene código y pruebas automatizadas aprobadas, pero la aceptación de integración Docker/PostgreSQL sigue pendiente.
