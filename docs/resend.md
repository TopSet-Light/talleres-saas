# Correo transaccional con Resend · TS-22

Registro y verificación (AUTH-01), invitaciones (AUTH-03) y recuperación de contraseña (AUTH-05) usan `MailService`. Con `MAIL_TRANSPORT=resend` se envían por `POST https://api.resend.com/emails`, autenticado con `RESEND_API_KEY`, mediante el `fetch` de Node 22. No se agrega un SDK ni se modifica la base de datos. Los textos, vencimientos, límites por destinatario y tokens de un solo uso se conservan.

`MAIL_TRANSPORT=smtp` es el valor predeterminado. En Compose apunta a Mailpit, sin credenciales y sin entregar a casillas reales. Tener una clave de Resend configurada no activa por sí solo el envío real.

## 1. Verificar un dominio propio

La cuenta de Gmail de TopSet sirve para ingresar y administrar Resend. No permite usar `@gmail.com` como remitente verificado: se necesita un dominio propio y acceso a sus DNS.

1. En **Domains** de Resend, agregar un subdominio, por ejemplo `notificaciones.tudominio.com`. Es un ejemplo: reemplazarlo por el dominio real de TopSet.
2. En el proveedor DNS, cargar exactamente los registros de envío que muestre Resend para ese dominio: DKIM y SPF/Return-Path, respetando los tipos TXT, CNAME o MX que indique el panel. No reemplazar los MX del correo existente del dominio raíz. No hace falta habilitar recepción de emails para este envío transaccional.
3. Esperar la propagación y ejecutar la verificación hasta que Resend indique **Verified**.
4. Elegir el remitente, por ejemplo `TopSet <no-responder@notificaciones.tudominio.com>`. El dominio debe coincidir con el verificado.
5. Configurar DMARC según la política del dominio. Mantener desactivado el seguimiento de clics y aperturas para estos correos de acceso, para evitar modificar los enlaces con tokens.

Resend recomienda subdominios para separar la reputación de los envíos. Los valores DNS dependen de la región y del dominio: copiarlos del panel, no de ejemplos de terceros. Ver [dominios verificados](https://resend.com/docs/dashboard/domains/introduction).

## 2. Crear una clave de envío

En **API Keys**, crear una clave para este SaaS con permiso **Sending access**, limitada al dominio verificado. Guardarla en el gestor de secretos o en las variables privadas del backend. Usar claves diferentes para pruebas y producción. La clave no se comparte por chat, no se sube al repositorio y no se coloca en el frontend.

Ver [gestión de claves](https://resend.com/docs/dashboard/api-keys/introduction).

## 3. Configurar el backend de producción

Configurar estas variables en el entorno privado del proceso API:

```dotenv
NODE_ENV=production
MAIL_TRANSPORT=resend
RESEND_API_KEY=<clave privada de envío>
MAIL_FROM="TopSet <no-responder@notificaciones.tudominio.com>"
APP_URL=https://app.tudominio.com
```

`APP_URL` es la URL de la aplicación que abre el usuario, no la URL interna de la API. Se usa para los enlaces de verificación, invitación y recuperación, el control de Origin y el callback de Google si está habilitado. Mantener el dominio público correcto en todos esos servicios.

Con Resend son obligatorios `RESEND_API_KEY`, un `MAIL_FROM` con formato válido y `APP_URL` explícita. La API valida la configuración al iniciar sin imprimir secretos. La verificación efectiva del dominio y los permisos de la clave los comprueba Resend al enviar. En producción exige HTTPS y cookie segura; el SMTP alternativo requiere un proveedor y credenciales explícitos.

No hacen falta `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` ni `SMTP_PASSWORD` con la API de Resend. Reiniciar o recrear la API después de cambiar variables. El Compose del repositorio sigue siendo exclusivamente de desarrollo; esta tarea no crea infraestructura de producción ni despliega la aplicación.

## 4. Probar antes de desplegar

Para probar con una casilla propia desde el entorno local, editar el `.env` ignorado con `MAIL_TRANSPORT=resend`, la clave privada y el remitente verificado. `APP_URL` puede seguir en `http://localhost:5173` para esta prueba local; usar el puerto real si es distinto. Los enlaces locales solo abren la aplicación en la máquina donde está funcionando.

Con los servicios locales ya iniciados, desde la raíz en Git Bash:

```bash
docker compose up -d --build --no-deps api
```

Verificar los tres recorridos con direcciones controladas por el equipo:

1. Registrar un taller: recibir el correo en la casilla real, abrir el enlace y completar la contraseña.
2. Invitar a otro email controlado: recibir la invitación, aceptarla y comprobar que puede iniciar sesión.
3. Solicitar recuperación: recibir el correo, cambiar la contraseña y comprobar el nuevo acceso y el rechazo del enlace ya usado.
4. Consultar **Emails** en Resend y comprobar la entrega, además de revisar bandeja y spam. La aceptación de la API no garantiza la entrega final.

Estos correos ya no aparecerán en Mailpit. Para volver a capturarlos sin entrega real, restaurar `MAIL_TRANSPORT=smtp` y recrear solo `api` con el mismo comando. No se necesitan envíos reales para ejecutar las pruebas automatizadas.

Antes del despliegue repetir los recorridos con `APP_URL` pública HTTPS, confirmar que ningún enlace apunta a localhost y revisar los límites de envío vigentes de la cuenta en Resend.

## Comportamiento ante errores

El envío por Resend tiene un límite de 10 segundos. Rechazos del proveedor, límites de envío, errores de red, timeout o respuestas inválidas devuelven `false` al servicio que lo llamó. Los logs contienen un aviso genérico sin destinatarios, asuntos, contenido, tokens, claves ni respuesta del proveedor. No se cambia automáticamente a Mailpit ni se reintenta un envío cuyo resultado podría ser incierto.

Se conserva el contrato actual: registro y recuperación responden de forma genérica para evitar revelar cuentas; las invitaciones informan `emailSent`. Este valor indica aceptación por el proveedor, no entrega final. No hay cola, reintentos persistentes ni webhooks de entrega en esta tarea. Ante una falla, revisar Resend y volver a solicitar el enlace respetando los límites existentes.

## Alternativa: Resend por SMTP

El transporte SMTP existente también admite Resend: `MAIL_TRANSPORT=smtp`, `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend` y `SMTP_PASSWORD` con la clave de API. `MAIL_FROM` y `APP_URL` siguen siendo necesarios; no se configura `RESEND_API_KEY` para ese modo. El puerto 465 usa TLS desde el inicio; 587 usa STARTTLS obligatorio con credenciales. Ver [configuración SMTP oficial](https://resend.com/docs/send-with-smtp).

La implementación principal de TS-22 usa la [API de envío de Resend](https://resend.com/docs/api-reference/emails/send-email).
