const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

// Solo lo ejecuta el lanzador que crea un PostgreSQL descartable (pnpm --filter backend test:data).
if (process.env.POINT07_DISPOSABLE !== '1') throw new Error('Usar pnpm --filter backend test:data');
const baseUrl = new URL(process.env.DATABASE_URL);
if (baseUrl.hostname !== '127.0.0.1' || baseUrl.pathname !== '/point07_test') {
  throw new Error('La integración requiere la base descartable point07_test.');
}
const backend = path.resolve(__dirname, '../..');
const ORIGIN = 'http://app.test';
const databaseUrl = (() => { const url = new URL(baseUrl); url.searchParams.set('schema', 'access_http'); return url.toString(); })();

function deploy() {
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: backend, env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8', windowsHide: true,
  });
  // No imprimir la salida de Prisma, que puede contener la URL de conexión.
  assert.equal(result.status, 0, 'prisma migrate deploy debe finalizar correctamente');
}

// La configuración se lee al crear la aplicación.
process.env.DATABASE_URL = databaseUrl;
process.env.APP_URL = ORIGIN;
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { MailService } = require('../../dist/mail/mail.service');

async function startApi(rateLimit) {
  process.env.AUTH_RATE_LIMIT = String(rateLimit);
  const app = configureApp(await NestFactory.create(AppModule, { logger: false }));
  const outbox = [];
  // Correo capturado en memoria: la prueba lee los enlaces sin un servidor SMTP.
  app.get(MailService).send = async message => { outbox.push(message); return true; };
  await app.listen(0, '127.0.0.1');
  return { app, outbox, url: `${await app.getUrl()}/api` };
}

/** Navegador mínimo: guarda la cookie de sesión y envía el Origin de la aplicación. */
class Browser {
  constructor(api) { this.api = api; this.cookie = undefined; }
  async call(method, route, body, { origin = ORIGIN } = {}) {
    const headers = {};
    if (origin) headers.origin = origin;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    const response = await fetch(`${this.api.url}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = response.headers.getSetCookie().find(value => value.startsWith('taller_sesion='));
    if (setCookie) {
      const value = setCookie.split(';')[0];
      this.cookie = value === 'taller_sesion=' ? undefined : value;
      this.lastSetCookie = setCookie;
    }
    const text = await response.text();
    return { status: response.status, text, body: text ? JSON.parse(text) : undefined };
  }
  get(route) { return this.call('GET', route); }
  post(route, body, options) { return this.call('POST', route, body ?? {}, options); }
  patch(route, body) { return this.call('PATCH', route, body); }
  delete(route) { return this.call('DELETE', route); }
}

function tokenFrom(message) {
  const match = /#token=([A-Za-z0-9_-]{43})/.exec(message.text);
  assert.ok(match, 'el email contiene un enlace con token');
  return match[1];
}

const PASSWORD = 'contraseña de prueba segura';

async function registerAndLogin(api, browser, { workshopName, ownerName, email }) {
  const before = api.outbox.length;
  assert.equal((await browser.post('/auth/register', { workshopName, ownerName, email, password: PASSWORD })).status, 202);
  assert.equal(api.outbox.length, before + 1);
  const token = tokenFrom(api.outbox.at(-1));
  assert.equal((await browser.post('/auth/verify-email', { token })).status, 200);
  const login = await browser.post('/auth/login', { email, password: PASSWORD });
  assert.equal(login.status, 200);
  return login.body;
}

async function inviteAndAccept(api, owner, { email, role, name }) {
  const invitation = await owner.post('/invitations', { email, role });
  assert.equal(invitation.status, 201);
  assert.equal(invitation.body.emailSent, true);
  const token = tokenFrom(api.outbox.at(-1));
  const guest = new Browser(api);
  assert.equal((await guest.post('/invitations/accept', { token, name, password: PASSWORD })).status, 201);
  assert.equal((await guest.post('/auth/login', { email, password: PASSWORD })).status, 200);
  return { guest, token, invitationId: invitation.body.id };
}

test('punto 08: acceso, permisos y aislamiento con dos talleres en PostgreSQL real', async t => {
  deploy();
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
  const api = await startApi(1000);
  try {
    const ownerA = new Browser(api);
    const ownerB = new Browser(api);
    let employees;

    await t.test('AUTH-01: registro atómico, sin revelar emails existentes ni aceptar datos inválidos', async () => {
      const me = await registerAndLogin(api, ownerA, { workshopName: 'Taller ficticio Norte', ownerName: 'Dueña Norte', email: 'Duena.Norte@Example.Invalid' });
      assert.equal(me.role, 'OWNER');
      assert.equal(me.user.email, 'duena.norte@example.invalid');
      assert.equal(me.workshop.name, 'Taller ficticio Norte');
      assert.ok(me.permissions.includes('employees.invite'));

      const mails = api.outbox.length;
      const repeated = await new Browser(api).post('/auth/register', {
        workshopName: 'Taller duplicado', ownerName: 'Otra persona', email: 'duena.norte@example.invalid', password: PASSWORD,
      });
      assert.equal(repeated.status, 202, 'misma respuesta que un registro nuevo');
      assert.equal(await prisma.workshop.count({ where: { name: 'Taller duplicado' } }), 0, 'no deja un taller huérfano');
      assert.equal(api.outbox.length, mails);

      const invalid = await new Browser(api).post('/auth/register', { workshopName: 'X', ownerName: '', email: 'no-es-email', password: 'corta' });
      assert.equal(invalid.status, 400);
      assert.deepEqual(Object.keys(invalid.body.fields).sort(), ['email', 'ownerName', 'password', 'workshopName']);
      assert.ok(!invalid.text.includes('corta'), 'no repite los valores enviados');
      const sameAsEmail = await new Browser(api).post('/auth/register', {
        workshopName: 'Taller Igual', ownerName: 'Persona', email: 'igual.email@example.invalid', password: 'igual.email@example.invalid',
      });
      assert.equal(sameAsEmail.status, 400);
      assert.ok(sameAsEmail.body.fields.password);

      // Una falla en el último paso de la transacción no deja registros parciales.
      await prisma.$executeRawUnsafe(`CREATE FUNCTION falla_prueba() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'falla simulada'; END; $$`);
      await prisma.$executeRawUnsafe('CREATE TRIGGER falla_prueba BEFORE INSERT ON verificacion_email FOR EACH ROW EXECUTE FUNCTION falla_prueba()');
      try {
        const failed = await new Browser(api).post('/auth/register', {
          workshopName: 'Taller que falla', ownerName: 'Persona que falla', email: 'falla@example.invalid', password: PASSWORD,
        });
        assert.equal(failed.status, 500);
        assert.deepEqual(failed.body, { statusCode: 500, message: 'Internal server error' }, 'sin detalles internos');
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER falla_prueba ON verificacion_email');
        await prisma.$executeRawUnsafe('DROP FUNCTION falla_prueba()');
      }
      assert.equal(await prisma.workshop.count({ where: { name: 'Taller que falla' } }), 0);
      assert.equal(await prisma.user.count({ where: { email: 'falla@example.invalid' } }), 0);
      assert.equal(await prisma.workshop.count(), 1);
    });

    await t.test('AUTH-02: verificación obligatoria, errores genéricos, cookie protegida y cierre de sesión', async () => {
      const pending = new Browser(api);
      await pending.post('/auth/register', { workshopName: 'Taller sin verificar', ownerName: 'Persona', email: 'pendiente@example.invalid', password: PASSWORD });
      const firstLink = tokenFrom(api.outbox.at(-1));
      const unverified = await pending.post('/auth/login', { email: 'pendiente@example.invalid', password: PASSWORD });
      assert.equal(unverified.status, 403);
      assert.equal(unverified.body.code, 'EMAIL_NOT_VERIFIED');
      assert.equal((await pending.post('/auth/resend-verification', { email: 'pendiente@example.invalid' })).status, 202);
      const secondLink = tokenFrom(api.outbox.at(-1));
      assert.equal((await pending.post('/auth/verify-email', { token: firstLink })).status, 400, 'el enlace anterior queda inutilizable');
      assert.equal((await pending.post('/auth/verify-email', { token: secondLink })).status, 200);
      assert.equal((await pending.post('/auth/verify-email', { token: secondLink })).status, 400, 'un solo uso');
      assert.equal((await pending.post('/auth/resend-verification', { email: 'nadie@example.invalid' })).status, 202);

      const wrong = await new Browser(api).post('/auth/login', { email: 'duena.norte@example.invalid', password: 'contraseña equivocada' });
      const unknown = await new Browser(api).post('/auth/login', { email: 'nadie@example.invalid', password: 'contraseña equivocada' });
      assert.equal(wrong.status, 401);
      assert.deepEqual(unknown.body, wrong.body, 'email inexistente y contraseña errónea responden igual');

      const session = new Browser(api);
      await session.post('/auth/login', { email: 'duena.norte@example.invalid', password: PASSWORD });
      assert.match(session.lastSetCookie, /HttpOnly/i);
      assert.match(session.lastSetCookie, /SameSite=Lax/i);
      assert.match(session.lastSetCookie, /Path=\/api/);
      const cookie = session.cookie;
      assert.equal((await session.get('/auth/me')).status, 200);
      assert.equal((await session.post('/auth/logout', undefined, { origin: null })).status, 403, 'logout exige Origin');
      assert.equal((await session.post('/auth/logout', undefined, { origin: 'https://otro.example' })).status, 403);
      assert.equal((await session.post('/auth/logout')).status, 204);
      session.cookie = cookie;
      assert.equal((await session.get('/auth/me')).status, 401, 'la sesión cerrada no vuelve a servir');
      assert.equal((await new Browser(api).get('/auth/me')).status, 401);
    });

    await t.test('sesiones vencidas por inactividad o máximo absoluto se rechazan', async () => {
      for (const field of ['idleExpiresAt', 'expiresAt']) {
        const browser = new Browser(api);
        await browser.post('/auth/login', { email: 'pendiente@example.invalid', password: PASSWORD });
        const session = await prisma.session.findFirstOrThrow({
          where: { revokedAt: null, user: { email: 'pendiente@example.invalid' } }, orderBy: { createdAt: 'desc' },
        });
        const now = Date.now();
        // El vencimiento debe quedar en el pasado y respetar expira_at > created_at.
        await prisma.session.update({
          where: { id: session.id },
          data: field === 'expiresAt'
            ? { createdAt: new Date(now - 2 * 3600000), expiresAt: new Date(now - 3600000), idleExpiresAt: new Date(now - 3600000) }
            : { idleExpiresAt: new Date(now - 60000) },
        });
        assert.equal((await browser.get('/auth/me')).status, 401, field);
      }
    });

    await t.test('AUTH-03: invitaciones de un solo uso, con taller y rol de la invitación', async () => {
      await registerAndLogin(api, ownerB, { workshopName: 'Taller ficticio Sur', ownerName: 'Dueño Sur', email: 'dueno.sur@example.invalid' });

      const { guest: reception, token } = await inviteAndAccept(api, ownerA, { email: 'recepcion.norte@example.invalid', role: 'RECEPTION', name: 'Recepción Norte' });
      const me = (await reception.get('/auth/me')).body;
      assert.equal(me.role, 'RECEPTION');
      assert.equal(me.workshop.name, 'Taller ficticio Norte');
      assert.equal((await new Browser(api).post('/invitations/accept', { token, name: 'Otra vez', password: PASSWORD })).status, 400, 'usada');

      // El taller no puede venir del pedido: un campo extra se rechaza.
      await ownerA.post('/invitations', { email: 'mecanico.norte@example.invalid', role: 'MECHANIC' });
      const mechanicToken = tokenFrom(api.outbox.at(-1));
      const tampered = await new Browser(api).post('/invitations/accept', {
        token: mechanicToken, name: 'Mecánico', password: PASSWORD, workshopId: (await prisma.workshop.findFirstOrThrow({ where: { name: 'Taller ficticio Sur' } })).id,
      });
      assert.equal(tampered.status, 400);
      const preview = await new Browser(api).post('/invitations/preview', { token: mechanicToken });
      assert.deepEqual({ ...preview.body, expiresAt: undefined }, {
        workshopName: 'Taller ficticio Norte', email: 'mecanico.norte@example.invalid', role: 'MECHANIC', expiresAt: undefined,
      });

      // Reinvitar reemplaza la invitación pendiente.
      await ownerA.post('/invitations', { email: 'mecanico.norte@example.invalid', role: 'MECHANIC' });
      const newer = tokenFrom(api.outbox.at(-1));
      assert.equal((await new Browser(api).post('/invitations/preview', { token: mechanicToken })).status, 400);
      assert.equal((await new Browser(api).post('/invitations/preview', { token: newer })).status, 200);
      const pending = (await ownerA.get('/invitations')).body;
      assert.equal(pending.length, 1);
      assert.ok(!JSON.stringify(pending).includes('token'), 'el listado no expone tokens');

      // Revocada y vencida.
      assert.equal((await ownerA.delete(`/invitations/${pending[0].id}`)).status, 204);
      assert.equal((await new Browser(api).post('/invitations/accept', { token: newer, name: 'Mecánico', password: PASSWORD })).status, 400);
      await ownerA.post('/invitations', { email: 'vencida@example.invalid', role: 'MECHANIC' });
      const expiredToken = tokenFrom(api.outbox.at(-1));
      const now = Date.now();
      await prisma.invitation.updateMany({
        where: { email: 'vencida@example.invalid' },
        data: { createdAt: new Date(now - 4 * 86400000), expiresAt: new Date(now - 86400000) },
      });
      assert.equal((await new Browser(api).post('/invitations/accept', { token: expiredToken, name: 'Vencida', password: PASSWORD })).status, 400);

      // Ya forma parte del taller / pertenece a otro taller sin revelarlo a quien invita.
      assert.equal((await ownerA.post('/invitations', { email: 'recepcion.norte@example.invalid', role: 'MECHANIC' })).body.code, 'ALREADY_MEMBER');
      const foreign = await ownerA.post('/invitations', { email: 'dueno.sur@example.invalid', role: 'MECHANIC' });
      assert.equal(foreign.status, 201, 'quien invita no se entera de que el email existe');
      const foreignAccept = await new Browser(api).post('/invitations/accept', { token: tokenFrom(api.outbox.at(-1)), name: 'Dueño Sur', password: PASSWORD });
      assert.equal(foreignAccept.status, 409);
      assert.equal(foreignAccept.body.code, 'INVITATION_UNAVAILABLE');
      assert.equal((await prisma.membership.findFirstOrThrow({ where: { user: { email: 'dueno.sur@example.invalid' } }, include: { workshop: true } })).workshop.name, 'Taller ficticio Sur');

      await inviteAndAccept(api, ownerA, { email: 'mecanico.norte@example.invalid', role: 'MECHANIC', name: 'Mecánico Norte' });
      employees = (await ownerA.get('/employees')).body;
      assert.deepEqual(employees.map(e => e.email).sort(), ['duena.norte@example.invalid', 'mecanico.norte@example.invalid', 'recepcion.norte@example.invalid']);
    });

    await t.test('AUTH-04: el backend aplica permisos aunque se manipule el frontend', async () => {
      const reception = new Browser(api);
      await reception.post('/auth/login', { email: 'recepcion.norte@example.invalid', password: PASSWORD });
      const mechanic = employees.find(e => e.email === 'mecanico.norte@example.invalid');
      assert.equal((await reception.get('/employees')).status, 403);
      assert.equal((await reception.get('/invitations')).status, 403);
      assert.equal((await reception.post('/invitations', { email: 'nuevo@example.invalid', role: 'OWNER' })).status, 403);
      assert.equal((await reception.patch(`/employees/${mechanic.id}`, { role: 'OWNER' })).status, 403);
      assert.equal((await reception.patch(`/employees/${mechanic.id}`, { status: 'INACTIVE' })).status, 403);
      assert.equal((await prisma.membership.findUniqueOrThrow({ where: { id: mechanic.id } })).role, 'MECHANIC');
      assert.equal(await prisma.invitation.count({ where: { email: 'nuevo@example.invalid' } }), 0);
    });

    await t.test('aislamiento: cambiar ids no permite leer ni modificar otro taller', async () => {
      const listB = (await ownerB.get('/employees')).body;
      assert.deepEqual(listB.map(e => e.email), ['dueno.sur@example.invalid']);
      const receptionA = employees.find(e => e.email === 'recepcion.norte@example.invalid');
      const crossPatch = await ownerB.patch(`/employees/${receptionA.id}`, { status: 'INACTIVE' });
      assert.equal(crossPatch.status, 404);
      assert.equal((await prisma.membership.findUniqueOrThrow({ where: { id: receptionA.id } })).status, 'ACTIVE');
      await ownerA.post('/invitations', { email: 'pendiente.norte@example.invalid', role: 'MECHANIC' });
      const invitationA = (await ownerA.get('/invitations')).body.find(i => i.email === 'pendiente.norte@example.invalid');
      assert.equal((await ownerB.delete(`/invitations/${invitationA.id}`)).status, 404);
      assert.ok(!(await ownerB.get('/invitations')).body.some(i => i.id === invitationA.id));
      assert.equal((await prisma.invitation.findUniqueOrThrow({ where: { id: invitationA.id } })).revokedAt, null);
      assert.equal((await ownerB.patch('/employees/no-es-un-uuid', { role: 'OWNER' })).status, 404);
      // El taller sale de la sesión: un parámetro con otro taller se ignora o se rechaza.
      const workshopA = await prisma.workshop.findFirstOrThrow({ where: { name: 'Taller ficticio Norte' } });
      const withQuery = await ownerB.get(`/employees?workshopId=${workshopA.id}`);
      assert.deepEqual(withQuery.body.map(e => e.email), ['dueno.sur@example.invalid']);
    });

    await t.test('AUTH-04: cambio de rol, sin autoedición y con dueños concurrentes', async () => {
      const reception = employees.find(e => e.email === 'recepcion.norte@example.invalid');
      const changed = await ownerA.patch(`/employees/${reception.id}`, { role: 'MECHANIC' });
      assert.equal(changed.status, 200);
      assert.equal(changed.body.role, 'MECHANIC');
      const self = employees.find(e => e.isCurrentUser);
      assert.equal((await ownerA.patch(`/employees/${self.id}`, { role: 'MECHANIC' })).body.code, 'SELF_CHANGE');
      assert.equal((await ownerA.patch(`/employees/${self.id}`, { status: 'INACTIVE' })).body.code, 'SELF_CHANGE');
      assert.equal((await ownerA.patch(`/employees/${reception.id}`, {})).status, 400);
      assert.equal((await ownerA.patch(`/employees/${reception.id}`, { role: 'ADMIN' })).status, 400);
      assert.equal((await ownerA.patch(`/employees/${reception.id}`, { role: 'RECEPTION' })).status, 200);

      // Dos dueños se quitan el rol al mismo tiempo: solo uno lo logra y el taller conserva un dueño.
      const { guest: secondOwner } = await inviteAndAccept(api, ownerA, { email: 'socia.norte@example.invalid', role: 'OWNER', name: 'Socia Norte' });
      const list = (await ownerA.get('/employees')).body;
      const first = list.find(e => e.email === 'duena.norte@example.invalid');
      const second = list.find(e => e.email === 'socia.norte@example.invalid');
      const results = await Promise.all([
        ownerA.patch(`/employees/${second.id}`, { role: 'RECEPTION' }),
        secondOwner.patch(`/employees/${first.id}`, { role: 'RECEPTION' }),
      ]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 403]);
      const workshopA = await prisma.workshop.findFirstOrThrow({ where: { name: 'Taller ficticio Norte' } });
      assert.equal(await prisma.membership.count({ where: { workshopId: workshopA.id, role: 'OWNER', status: 'ACTIVE' } }), 1);
      // Restaurar: quien quedó como dueño devuelve el rol a la otra persona.
      const winner = results[0].status === 200 ? ownerA : secondOwner;
      const loser = results[0].status === 200 ? second : first;
      assert.equal((await winner.patch(`/employees/${loser.id}`, { role: 'OWNER' })).status, 200);
    });

    await t.test('AUTH-06: la baja bloquea operaciones con sesión abierta y nuevos inicios de sesión', async () => {
      const mechanic = new Browser(api);
      await mechanic.post('/auth/login', { email: 'mecanico.norte@example.invalid', password: PASSWORD });
      assert.equal((await mechanic.get('/auth/me')).status, 200);
      const target = employees.find(e => e.email === 'mecanico.norte@example.invalid');
      const deactivated = await ownerA.patch(`/employees/${target.id}`, { status: 'INACTIVE' });
      assert.equal(deactivated.body.status, 'INACTIVE');
      assert.equal((await mechanic.get('/auth/me')).status, 401, 'la sesión abierta deja de servir');
      const user = await prisma.user.findUniqueOrThrow({ where: { email: 'mecanico.norte@example.invalid' } });
      assert.equal(await prisma.session.count({ where: { userId: user.id, revokedAt: null } }), 0);
      const again = await new Browser(api).post('/auth/login', { email: 'mecanico.norte@example.invalid', password: PASSWORD });
      assert.equal(again.status, 403);
      assert.equal(again.body.code, 'ACCESS_DISABLED');
      assert.equal((await ownerA.patch(`/employees/${target.id}`, { status: 'ACTIVE' })).status, 200);
      assert.equal((await new Browser(api).post('/auth/login', { email: 'mecanico.norte@example.invalid', password: PASSWORD })).status, 200);
    });

    await t.test('las respuestas no exponen contraseñas, hashes ni tokens', async () => {
      const bodies = [(await ownerA.get('/auth/me')).text, (await ownerA.get('/employees')).text, (await ownerA.get('/invitations')).text];
      for (const body of bodies) {
        assert.ok(!/argon2|password|tokenHash|token_hash/i.test(body));
      }
      const stored = await prisma.credential.findMany();
      assert.ok(stored.every(c => c.passwordHash.startsWith('$argon2id$') && !c.passwordHash.includes(PASSWORD)));
    });
  } finally {
    await api.app.close();
    await prisma.$disconnect();
  }
});

test('límite de intentos por IP y por email', async () => {
  const api = await startApi(3);
  try {
    const browser = new Browser(api);
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await browser.post('/auth/login', { email: `ip${i}@example.invalid`, password: 'x' })).status);
    assert.deepEqual(statuses, [401, 401, 401, 429], 'cuarto pedido por minuto desde la misma IP');
  } finally { await api.app.close(); }

  const api2 = await startApi(1000);
  try {
    const browser = new Browser(api2);
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await browser.post('/auth/login', { email: 'duena.norte@example.invalid', password: 'contraseña equivocada' })).status);
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
    const blocked = await browser.post('/auth/login', { email: 'duena.norte@example.invalid', password: PASSWORD });
    assert.equal(blocked.status, 429, 'bloqueado aunque la contraseña sea correcta');
    assert.equal((await browser.post('/auth/login', { email: 'socia.norte@example.invalid', password: PASSWORD })).status, 200, 'otro email no se bloquea');
  } finally { await api2.app.close(); }
});
