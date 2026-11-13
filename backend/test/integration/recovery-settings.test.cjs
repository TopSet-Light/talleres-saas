const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { setup, Browser, tokenFrom, registerOwner, PASSWORD } = require('./http-helpers.cjs');

const { databaseUrl, startApi } = setup('recovery_settings');

test('TS-20 · AUTH-05: recuperación de contraseña en PostgreSQL real', async t => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
  const api = await startApi();
  try {
    const { browser: openSession } = await registerOwner(api, { workshopName: 'Taller recuperación', ownerName: 'Dueña', email: 'recupera@example.invalid' });

    await t.test('la solicitud responde igual para emails registrados y desconocidos', async () => {
      const mails = api.outbox.length;
      const unknown = await new Browser(api).post('/auth/password/forgot', { email: 'nadie@example.invalid' });
      assert.equal(api.outbox.length, mails, 'un email desconocido no recibe nada');
      const known = await new Browser(api).post('/auth/password/forgot', { email: 'Recupera@Example.Invalid' });
      assert.equal(known.status, 202);
      assert.deepEqual(known.body, unknown.body, 'misma respuesta');
      assert.equal(api.outbox.at(-1).to, 'recupera@example.invalid');
      assert.match(api.outbox.at(-1).text, /\/restablecer-contrasena#token=/);
    });

    await t.test('restablecer cambia la contraseña, cierra sesiones y anula los demás enlaces', async () => {
      const older = tokenFrom(api.outbox.at(-1));
      await new Browser(api).post('/auth/password/forgot', { email: 'recupera@example.invalid' });
      const token = tokenFrom(api.outbox.at(-1));
      assert.equal((await openSession.get('/auth/me')).status, 200, 'sesión abierta antes del cambio');

      const preview = await new Browser(api).post('/auth/password/reset/preview', { token });
      assert.equal(preview.body.email, 'recupera@example.invalid');
      const sameAsEmail = await new Browser(api).post('/auth/password/reset', { token, password: 'recupera@example.invalid' });
      assert.equal(sameAsEmail.status, 400);
      assert.equal((await new Browser(api).post('/auth/password/reset', { token, password: 'corta' })).status, 400);

      const reset = await new Browser(api).post('/auth/password/reset', { token, password: 'contraseña nueva elegida' });
      assert.equal(reset.status, 200);
      assert.equal((await openSession.get('/auth/me')).status, 401, 'la sesión anterior dejó de funcionar');
      assert.equal((await new Browser(api).post('/auth/login', { email: 'recupera@example.invalid', password: PASSWORD })).status, 401,
        'la contraseña anterior dejó de funcionar');
      assert.equal((await new Browser(api).post('/auth/login', { email: 'recupera@example.invalid', password: 'contraseña nueva elegida' })).status, 200);
      assert.equal((await new Browser(api).post('/auth/password/reset', { token, password: 'otra contraseña larga' })).status, 400, 'usado');
      assert.equal((await new Browser(api).post('/auth/password/reset', { token: older, password: 'otra contraseña larga' })).status, 400,
        'los demás enlaces pendientes quedan anulados');
    });

    await t.test('enlaces vencidos e inválidos se rechazan', async () => {
      await prisma.passwordReset.deleteMany({});
      await new Browser(api).post('/auth/password/forgot', { email: 'recupera@example.invalid' });
      const expired = tokenFrom(api.outbox.at(-1));
      const now = Date.now();
      await prisma.passwordReset.updateMany({ where: { usedAt: null }, data: { createdAt: new Date(now - 3 * 3600000), expiresAt: new Date(now - 3600000) } });
      assert.equal((await new Browser(api).post('/auth/password/reset', { token: expired, password: 'otra contraseña larga' })).status, 400);
      assert.equal((await new Browser(api).post('/auth/password/reset/preview', { token: expired })).status, 400);
      assert.equal((await new Browser(api).post('/auth/password/reset', { token: 'x'.repeat(43), password: 'otra contraseña larga' })).status, 400);
      assert.equal((await new Browser(api).post('/auth/password/reset', { token: 'no-es-un-token', password: 'otra contraseña larga' })).status, 400);
    });

    await t.test('el límite de 3 emails por hora resiste pedidos simultáneos', async () => {
      await prisma.passwordReset.deleteMany({});
      const mails = api.outbox.length;
      const responses = await Promise.all(Array.from({ length: 10 }, () =>
        new Browser(api).post('/auth/password/forgot', { email: 'recupera@example.invalid' })));
      assert.ok(responses.every(response => response.status === 202));
      assert.equal(api.outbox.length - mails, 3);
      assert.equal(await prisma.passwordReset.count(), 3);
    });

    await t.test('restablecer libera el bloqueo por intentos fallidos', async () => {
      const failures = [];
      for (let i = 0; i < 6; i++) failures.push((await new Browser(api).post('/auth/login', { email: 'recupera@example.invalid', password: 'equivocada' })).status);
      assert.equal(failures.at(-1), 429, 'bloqueado tras 5 fallos');
      const token = tokenFrom(api.outbox.at(-1));
      assert.equal((await new Browser(api).post('/auth/password/reset', { token, password: 'tercera contraseña larga' })).status, 200);
      assert.equal((await new Browser(api).post('/auth/login', { email: 'recupera@example.invalid', password: 'tercera contraseña larga' })).status, 200);
    });
  } finally {
    await api.app.close();
    await prisma.$disconnect();
  }
});
