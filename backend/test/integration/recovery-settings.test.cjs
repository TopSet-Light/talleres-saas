const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, mkdtempSync, readdirSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { setup, Browser, tokenFrom, registerOwner, inviteAndAccept, PASSWORD } = require('./http-helpers.cjs');

// Carpeta privada de archivos propia de la prueba; se borra al terminar.
const filesDir = mkdtempSync(path.join(os.tmpdir(), 'talleres-ts20-files-'));
process.on('exit', () => rmSync(filesDir, { recursive: true, force: true }));
const { databaseUrl, startApi } = setup('recovery_settings', { FILES_DIR: filesDir });

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 2)]);
function logoForm(content, name = 'logo.png', type = 'image/png') {
  const form = new FormData();
  form.append('logo', new Blob([content], { type }), name);
  return form;
}
const uploadLogo = (browser, form) => browser.raw('PUT', '/workshop-settings/logo', { body: form });
const logoFiles = workshopId => {
  const dir = path.join(filesDir, 'workshops', workshopId);
  return existsSync(dir) ? readdirSync(dir) : [];
};

const validSettings = (overrides = {}) => ({
  workshopName: 'Taller Horizonte', taxId: '20-12345678-6', address: 'Av. Siempre Viva 742', locality: 'Córdoba',
  contactPhone: '351 555-0101', contactEmail: 'Contacto@Horizonte.Example', documentFooter: 'Gracias por confiar en nosotros.',
  quoteValidityDays: 10, defaultTerms: 'Seña del 30 %. Saldo contra entrega.',
  numbering: { workOrder: { prefix: 'ot-', next: 42 }, estimate: { prefix: 'PRE-', next: 18 } }, ...overrides,
});

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

test('TS-20 · AUTH-07: configuración del taller, logo privado y numeración en PostgreSQL real', async t => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
  const api = await startApi();
  try {
    const { browser: ownerA, me: meA } = await registerOwner(api, { workshopName: 'Taller Norte', ownerName: 'Dueña Norte', email: 'norte@example.invalid' });
    const { browser: ownerB, me: meB } = await registerOwner(api, { workshopName: 'Taller Sur', ownerName: 'Dueño Sur', email: 'sur@example.invalid' });
    const receptionA = await inviteAndAccept(api, ownerA, { email: 'recepcion.norte@example.invalid', role: 'RECEPTION', name: 'Recepción Norte' });

    await t.test('un taller nuevo tiene configuración y numeración iniciales', async () => {
      const settings = await ownerA.get('/workshop-settings');
      assert.equal(settings.status, 200);
      assert.equal(settings.body.workshopName, 'Taller Norte');
      assert.equal(settings.body.taxId, null);
      assert.equal(settings.body.quoteValidityDays, 15);
      assert.equal(settings.body.logo, null);
      assert.deepEqual(settings.body.numbering, { workOrder: { prefix: 'OT-', next: 1 }, estimate: { prefix: 'PRE-', next: 1 } });
    });

    await t.test('los datos opcionales del registro (TS-21) quedan en la configuración', async () => {
      const { browser } = await registerOwner(api, {
        workshopName: 'Taller con datos', ownerName: 'Persona', email: 'datos@example.invalid',
        extra: { contactPhone: ' 351 555-0199 ', locality: 'Villa María', address: 'San Martín 100' },
      });
      const settings = (await browser.get('/workshop-settings')).body;
      assert.deepEqual([settings.contactPhone, settings.locality, settings.address], ['351 555-0199', 'Villa María', 'San Martín 100']);
      const tooLong = await new Browser(api).post('/auth/register', { workshopName: 'Taller', ownerName: 'Persona', email: 'largo@example.invalid', address: 'x'.repeat(301) });
      assert.equal(tooLong.status, 400);
      assert.ok(tooLong.body.fields.address);
    });

    await t.test('el dueño guarda y vuelve a consultar la configuración', async () => {
      const saved = await ownerA.put('/workshop-settings', validSettings());
      assert.equal(saved.status, 200);
      const again = await ownerA.get('/workshop-settings');
      assert.deepEqual({ ...again.body, updatedAt: undefined }, { ...saved.body, updatedAt: undefined });
      assert.equal(again.body.taxId, '20123456786', 'el CUIT se guarda solo con dígitos');
      assert.equal(again.body.contactEmail, 'contacto@horizonte.example');
      assert.deepEqual(again.body.numbering.workOrder, { prefix: 'OT-', next: 42 });
      assert.equal((await ownerA.get('/auth/me')).body.workshop.name, 'Taller Horizonte', 'el nombre comercial es el del taller');
      const cleared = await ownerA.put('/workshop-settings', validSettings({ taxId: '', address: '  ', documentFooter: null }));
      assert.equal(cleared.body.taxId, null);
      assert.equal(cleared.body.address, null);
    });

    await t.test('valida los datos y no permite volver atrás la numeración', async () => {
      const invalid = await ownerA.put('/workshop-settings', validSettings({
        taxId: '20123456785', quoteValidityDays: 0, contactEmail: 'no-es-email',
        numbering: { workOrder: { prefix: 'OT/', next: 0 }, estimate: { prefix: 'PRE-', next: 18 } },
      }));
      assert.equal(invalid.status, 400);
      assert.deepEqual(Object.keys(invalid.body.fields).sort(),
        ['contactEmail', 'numbering.workOrder.next', 'numbering.workOrder.prefix', 'quoteValidityDays', 'taxId']);
      const backwards = await ownerA.put('/workshop-settings', validSettings({ numbering: { workOrder: { prefix: 'OT-', next: 41 }, estimate: { prefix: 'PRE-', next: 18 } } }));
      assert.equal(backwards.status, 400);
      assert.match(backwards.body.fields['numbering.workOrder.next'], /no puede ser menor que 42/);
      const smuggled = await ownerA.put('/workshop-settings', { ...validSettings(), workshopId: meB.workshop.id });
      assert.equal(smuggled.status, 400, 'no acepta un taller en el cuerpo');
      assert.equal((await ownerB.get('/workshop-settings')).body.workshopName, 'Taller Sur');
    });

    await t.test('permisos: solo el dueño consulta y modifica; cada taller ve solo lo suyo', async () => {
      assert.equal((await receptionA.get('/workshop-settings')).status, 403);
      assert.equal((await receptionA.put('/workshop-settings', validSettings({ workshopName: 'Intento' }))).status, 403);
      assert.equal((await uploadLogo(receptionA, logoForm(PNG))).status, 403);
      assert.equal((await receptionA.delete('/workshop-settings/logo')).status, 403);
      assert.equal((await new Browser(api).get('/workshop-settings')).status, 401);
      const b = await ownerB.get('/workshop-settings');
      assert.equal(b.body.taxId, null, 'el otro taller no ve los datos de A');
      assert.notEqual(b.body.workshopName, 'Taller Horizonte');
      assert.equal((await prisma.workshop.findUniqueOrThrow({ where: { id: meA.workshop.id } })).name, 'Taller Horizonte');
    });

    await t.test('logo: privado, validado por contenido y reemplazable', async () => {
      const uploaded = await uploadLogo(ownerA, logoForm(PNG));
      assert.equal(uploaded.status, 200);
      const body = await uploaded.json();
      assert.deepEqual({ ...body.logo, updatedAt: undefined },
        { contentType: 'image/png', size: PNG.length, updatedAt: undefined, url: '/api/workshop-settings/logo' });
      assert.ok(!JSON.stringify(body).includes('workshops/'), 'no expone la ruta del archivo');
      assert.equal(logoFiles(meA.workshop.id).length, 1);

      for (const browser of [ownerA, receptionA]) {
        const logo = await browser.raw('GET', '/workshop-settings/logo');
        assert.equal(logo.status, 200);
        assert.equal(logo.headers.get('content-type'), 'image/png');
        assert.equal(logo.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(logo.headers.get('cache-control'), 'private, no-store');
        assert.ok(Buffer.from(await logo.arrayBuffer()).equals(PNG));
      }
      assert.equal((await ownerB.raw('GET', '/workshop-settings/logo')).status, 404, 'otro taller no accede al logo de A');
      assert.equal((await new Browser(api).raw('GET', '/workshop-settings/logo')).status, 401);

      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      assert.equal((await uploadLogo(ownerA, logoForm(svg, 'logo.png', 'image/png'))).status, 400, 'un SVG con nombre .png se rechaza');
      const huge = await uploadLogo(ownerA, logoForm(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)])));
      assert.equal(huge.status, 413);
      assert.equal((await huge.json()).code, 'FILE_TOO_LARGE');

      const replaced = await uploadLogo(ownerA, logoForm(JPEG, 'logo.jpg', 'image/jpeg'));
      assert.equal(replaced.status, 200);
      assert.equal((await replaced.json()).logo.contentType, 'image/jpeg');
      assert.deepEqual(logoFiles(meA.workshop.id).map(f => path.extname(f)), ['.jpg'], 'el logo anterior se borra del disco');

      assert.equal((await ownerA.delete('/workshop-settings/logo')).status, 204);
      assert.equal((await ownerA.raw('GET', '/workshop-settings/logo')).status, 404);
      assert.deepEqual(logoFiles(meA.workshop.id), []);
    });

    await t.test('numeración: asignación atómica por taller con pedidos simultáneos', async () => {
      const { NumberingService } = require('../../dist/modules/workshop-settings/numbering.service');
      const numbering = api.app.get(NumberingService);
      const allocations = await Promise.all(Array.from({ length: 20 }, () =>
        prisma.$transaction(tx => numbering.allocate(tx, meA.workshop.id, 'WORK_ORDER'))));
      assert.deepEqual(allocations.map(a => a.value).sort((x, y) => x - y), Array.from({ length: 20 }, (_, i) => 42 + i), 'sin repetidos ni saltos');
      assert.ok(allocations.some(a => a.number === 'OT-0042'));
      await assert.rejects(prisma.$transaction(async tx => {
        await numbering.allocate(tx, meA.workshop.id, 'WORK_ORDER');
        throw new Error('alta revertida');
      }));
      assert.equal((await ownerA.get('/workshop-settings')).body.numbering.workOrder.next, 62, 'una alta revertida no consume número');
      const numberingB = await prisma.documentNumbering.findUniqueOrThrow({ where: { workshopId_kind: { workshopId: meB.workshop.id, kind: 'WORK_ORDER' } } });
      assert.equal(numberingB.next, 1, 'los correlativos son por taller');
    });
  } finally {
    await api.app.close();
    await prisma.$disconnect();
  }
});
