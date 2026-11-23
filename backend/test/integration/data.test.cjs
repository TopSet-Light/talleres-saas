const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { ids, seedDemo } = require('../../prisma/demo-data.cjs');

// Este archivo solo es ejecutado por el lanzador que crea su propio PostgreSQL.
if (process.env.POINT07_DISPOSABLE !== '1') throw new Error('Usar pnpm --filter backend test:data');
const baseUrl = new URL(process.env.DATABASE_URL);
if (baseUrl.hostname !== '127.0.0.1' || baseUrl.pathname !== '/point07_test') {
  throw new Error('La integración requiere la base descartable point07_test.');
}
const backend = path.resolve(__dirname, '../..');
const first = '202611050001_initial_data';
const second = '202611050002_data_integrity';
const third = '202611090001_access';
const fourth = '202611100001_pending_registration';
const fifth = '202611130001_recovery_settings_google';
const sixth = '202611140001_review_ts20';
const seventh = '202611180001_google_link_session';
// SHA-256 del SQL en main (5f162ab), con saltos LF para admitir checkouts de Windows.
// Esta referencia protege la historia aplicada antes de TS-21, no solo una instalación vacía.
const mainMigrations = [
  [first, '38d2d8ba541b7e1bfd62918e0dd30bbe245cb361a5596817d11ef68eec59e4e9'],
  [second, 'ed9f91e4dcc8a7d08b8536bf72a64141f4699ddfd5780cd0000a131a2acbbfad'],
  [third, '4e8eec9ff6993bcbe9f611f07ef0aa0e5f359b99b7b683c8af417a397648c2fa'],
  [fourth, 'f7d72c65624125874587398bb4b843d8c091f6cd3ca0818b2dc50c98da442dbd'],
  [fifth, '5855592c6de0be2f622c34b11732e558c92773a08fb8d0c2fc1b55483d145a53'],
  [sixth, '152997fd931ae854eabd7e1de772e3283cd796b3bc65ae774cf5c587b3e2fc66'],
  [seventh, 'db6507fa32f11657ed4a9324afcaea7970f22216680c3c6d11eb49bce1487d7b'],
];
function urlFor(schema) {
  const url = new URL(baseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}
function client(schema) {
  return new PrismaClient({ datasourceUrl: urlFor(schema), log: [] });
}
function deploy(schema, schemaFile = path.join(backend, 'prisma/schema.prisma')) {
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'),
    'migrate', 'deploy', '--schema', schemaFile], {
    cwd: backend, env: { ...process.env, DATABASE_URL: urlFor(schema) },
    encoding: 'utf8', windowsHide: true,
  });
  // No imprimir salida de Prisma que pueda contener la URL de conexión.
  assert.equal(result.status, 0, 'prisma migrate deploy debe finalizar correctamente');
}
const rejects = (operation, code) => assert.rejects(operation, code ? error => error.code === code : undefined);
const vehicle = (data = {}) => ({ workshopId: ids.workshopA, customerId: ids.customerA, ...data });

test('punto 07: migraciones e integridad en PostgreSQL real', async t => {
  const prisma = client('empty_install');
  const upgrade = client('previous_version');
  const mainUpgrade = client('main_upgrade');
  const temp = mkdtempSync(path.join(os.tmpdir(), 'talleres-point07-'));
  try {
    await t.test('instalación vacía y deploy repetido sin cambios', async () => {
      deploy('empty_install');
      deploy('empty_install');
      assert.equal(await prisma.workshop.count(), 0);
      const migrations = await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`;
      assert.deepEqual(migrations.map(row => row.migration_name), [
        first, second, third, fourth, fifth, sixth, seventh,
        '202611180003_google_registration', '202611220001_review_ts21_integrity',
      ]);
    });

    await t.test('actualización de la primera migración conserva registros y agrega reglas e historial', async () => {
      copyFileSync(path.join(backend, 'prisma/schema.prisma'), path.join(temp, 'schema.prisma'));
      mkdirSync(path.join(temp, 'migrations', first), { recursive: true });
      copyFileSync(path.join(backend, 'prisma/migrations/migration_lock.toml'), path.join(temp, 'migrations/migration_lock.toml'));
      copyFileSync(path.join(backend, 'prisma/migrations', first, 'migration.sql'), path.join(temp, 'migrations', first, 'migration.sql'));
      deploy('previous_version', path.join(temp, 'schema.prisma'));
      await seedDemo(upgrade);
      assert.equal(await upgrade.vehicleOwnership.count(), 0);
      await rejects(upgrade.vehicleOwnership.create({ data: { workshopId: ids.workshopB, vehicleId: ids.vehicleA, customerId: ids.customerB } }), 'P2003');
      await rejects(upgrade.vehicleOwnership.create({ data: { workshopId: ids.workshopA, vehicleId: ids.vehicleA, customerId: ids.customerB } }), 'P2003');
      await upgrade.vehicle.update({ where: { id: ids.vehicleA }, data: { plate: ' ab-123 cd ' } });
      deploy('previous_version');
      assert.equal(await upgrade.workshop.count(), 2);
      const legacy = await upgrade.workshopSettings.findUniqueOrThrow({ where: { workshopId: ids.workshopA } });
      assert.deepEqual([legacy.contactPhone, legacy.locality, legacy.address], [null, null, null]);
      assert.equal(await upgrade.user.count(), 4);
      assert.equal(await upgrade.vehicle.count(), 2);
      assert.equal((await upgrade.vehicle.findUniqueOrThrow({ where: { id: ids.vehicleA } })).plate, 'AB123CD');
      assert.equal(await upgrade.vehicleOwnership.count(), 2);
      // TS-20: los talleres existentes reciben configuración y numeración iniciales.
      assert.equal(await upgrade.workshopSettings.count(), 2);
      assert.deepEqual((await upgrade.documentNumbering.findMany({ where: { workshopId: ids.workshopA }, orderBy: { kind: 'asc' } }))
        .map(n => [n.kind, n.prefix, n.next]), [['WORK_ORDER', 'OT-', 1], ['ESTIMATE', 'PRE-', 1]]);
      await rejects(upgrade.vehicle.create({ data: vehicle({ plate: 'ab 123-cd' }) }));
      await rejects(upgrade.vehicle.create({ data: vehicle({ customerId: ids.customerB }) }));
    });

    await t.test('TS-21 actualiza main sin cambiar checksums ni perder contacto o registros pendientes', async () => {
      const baseline = path.join(temp, 'main');
      mkdirSync(path.join(baseline, 'migrations'), { recursive: true });
      const schemaFile = path.join(baseline, 'schema.prisma');
      copyFileSync(path.join(backend, 'prisma/schema.prisma'), schemaFile);
      copyFileSync(path.join(backend, 'prisma/migrations/migration_lock.toml'), path.join(baseline, 'migrations/migration_lock.toml'));
      const copyMigration = name => {
        mkdirSync(path.join(baseline, 'migrations', name), { recursive: true });
        copyFileSync(path.join(backend, 'prisma/migrations', name, 'migration.sql'), path.join(baseline, 'migrations', name, 'migration.sql'));
      };
      for (const [name, checksum] of mainMigrations) {
        const sql = readFileSync(path.join(backend, 'prisma/migrations', name, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
        assert.equal(createHash('sha256').update(sql).digest('hex'), checksum, `migración histórica intacta: ${name}`);
        copyMigration(name);
      }
      deploy('main_upgrade', schemaFile);
      await seedDemo(mainUpgrade);
      const contact = { contactPhone: '+54 11 5555-0123', locality: 'Córdoba', address: 'Calle ficticia 123' };
      await mainUpgrade.workshopSettings.upsert({
        where: { workshopId: ids.workshopA }, create: { workshopId: ids.workshopA, ...contact }, update: contact,
      });
      const pending = await mainUpgrade.pendingRegistration.create({ data: {
        email: 'pendiente@example.invalid', workshopName: 'Taller pendiente', ownerName: 'Dueña pendiente',
        ...contact, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 86400000),
      } });
      const history = await mainUpgrade.$queryRaw`SELECT migration_name, checksum FROM _prisma_migrations ORDER BY migration_name`;

      // La migración original de Google ya fue aplicada en desarrollo. Su extensión
      // debe conservar incluso los registros anteriores vencidos y usados.
      copyMigration('202611180003_google_registration');
      deploy('main_upgrade', schemaFile);
      const oldId = randomUUID();
      const expiry = new Date('2026-01-01T12:00:00Z');
      await mainUpgrade.$executeRaw`INSERT INTO registro_google (id, token_hash, sub, email, nombre_dueno, expira_at, usada_at)
        VALUES (${oldId}::uuid, ${'b'.repeat(64)}, 'sub-anterior', 'anterior@gmail.com', 'Dueña anterior', ${expiry}, ${expiry})`;

      deploy('main_upgrade');
      deploy('main_upgrade');
      const after = await mainUpgrade.$queryRaw`SELECT migration_name, checksum FROM _prisma_migrations ORDER BY migration_name`;
      assert.deepEqual(after.slice(0, history.length), history, 'las migraciones aplicadas mantienen sus checksums');
      assert.deepEqual(await mainUpgrade.pendingRegistration.findUniqueOrThrow({ where: { id: pending.id } }), pending);
      assert.deepEqual(await mainUpgrade.workshopSettings.findUniqueOrThrow({
        where: { workshopId: ids.workshopA }, select: { contactPhone: true, locality: true, address: true },
      }), contact);
      assert.equal(await mainUpgrade.workshop.count(), 2);
      const old = await mainUpgrade.googleRegistration.findUniqueOrThrow({ where: { id: oldId } });
      assert.equal(old.createdAt.getTime(), expiry.getTime() - 30 * 60000);
      assert.deepEqual(old.usedAt, expiry);
      assert.deepEqual(old.expiresAt, expiry);
      const duplicates = await mainUpgrade.$queryRaw`SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'main_upgrade' AND (
          (table_name = 'taller' AND column_name IN ('telefono_contacto', 'pais', 'localidad', 'direccion')) OR
          (table_name = 'registro_pendiente' AND column_name IN ('telefono_contacto', 'pais', 'direccion'))) `;
      assert.deepEqual(duplicates, [], 'sin columnas duplicadas');
    });

    await t.test('SQL rechaza registros Google inválidos e intentos que mezclan registro y vinculación', async () => {
      const registration = {
        tokenHash: 'c'.repeat(64), subject: 'sub-integridad', email: 'integridad@gmail.com', ownerName: 'Dueña ficticia',
        createdAt: new Date('2026-01-01T12:00:00Z'), expiresAt: new Date('2026-01-01T12:30:00Z'),
      };
      for (const invalid of [
        { tokenHash: 'z'.repeat(64) }, { email: ' Mayuscula@gmail.com ' }, { email: '' },
        { subject: '  ' }, { expiresAt: registration.createdAt },
      ]) {
        await rejects(prisma.googleRegistration.create({ data: { ...registration, ...invalid } }));
      }
      await prisma.googleRegistration.create({ data: registration });
      const attempt = {
        registration: true, stateHash: 'd'.repeat(64), nonce: 'nonce', codeVerifier: 'verificador',
        expiresAt: new Date(Date.now() + 600000),
      };
      await prisma.googleLoginAttempt.create({ data: attempt });
      // En main_upgrade hay usuarios existentes; las referencias deben ser válidas
      // para comprobar específicamente la nueva restricción de propósito.
      const session = await mainUpgrade.session.create({ data: {
        userId: ids.ownerA, tokenHash: 'e'.repeat(64), expiresAt: attempt.expiresAt, idleExpiresAt: attempt.expiresAt,
      } });
      for (const link of [{ userId: ids.ownerA, sessionId: session.id }, { sessionId: session.id }]) {
        await rejects(mainUpgrade.googleLoginAttempt.create({ data: { ...attempt, ...link } }));
      }
      await mainUpgrade.googleLoginAttempt.create({ data: {
        ...attempt, registration: false, userId: ids.ownerA, sessionId: session.id,
      } });
    });

    await t.test('seed explícito de dos talleres repetible sin borrar cambios', async () => {
      await seedDemo(prisma);
      await prisma.workshop.update({ where: { id: ids.workshopA }, data: { name: 'Demostración editada' } });
      await seedDemo(prisma);
      assert.equal(await prisma.workshop.count(), 2);
      assert.equal(await prisma.user.count(), 4);
      assert.equal(await prisma.membership.count(), 4);
      assert.equal(await prisma.vehicleOwnership.count(), 2);
      assert.equal((await prisma.workshop.findUniqueOrThrow({ where: { id: ids.workshopA } })).name, 'Demostración editada');
      const roles = await prisma.membership.findMany({ where: { workshopId: ids.workshopA } });
      assert.deepEqual(roles.map(row => row.role).sort(), ['MECHANIC', 'OWNER', 'RECEPTION']);
    });

    await t.test('un usuario no admite una segunda pertenencia, tampoco estando inactivo', async () => {
      await rejects(prisma.membership.create({ data: { workshopId: ids.workshopA, userId: ids.ownerA, role: 'MECHANIC' } }), 'P2002');
      await prisma.membership.update({ where: { userId: ids.ownerA }, data: { status: 'INACTIVE' } });
      await rejects(prisma.membership.create({ data: { workshopId: ids.workshopB, userId: ids.ownerA, role: 'OWNER' } }), 'P2002');
      await prisma.membership.update({ where: { userId: ids.ownerA }, data: { status: 'ACTIVE' } });
    });

    await t.test('cliente ajeno rechazado tanto al crear como al editar un vehículo', async () => {
      await rejects(prisma.vehicle.create({ data: vehicle({ customerId: ids.customerB }) }), 'P2003');
      await rejects(prisma.vehicle.update({ where: { id: ids.vehicleA }, data: { customerId: ids.customerB } }), 'P2003');
      assert.equal((await prisma.vehicle.findUniqueOrThrow({ where: { id: ids.vehicleA } })).customerId, ids.customerA);
      assert.equal(await prisma.vehicleOwnership.count({ where: { vehicleId: ids.vehicleA } }), 1);
    });

    await t.test('los registros no pueden trasladarse entre talleres alterando taller_id', async () => {
      await rejects(prisma.customer.update({ where: { id: ids.customerA }, data: { workshopId: ids.workshopB } }));
      await rejects(prisma.vehicle.update({ where: { id: ids.vehicleA }, data: { workshopId: ids.workshopB, customerId: ids.customerB } }));
      await rejects(prisma.membership.update({ where: { userId: ids.ownerA }, data: { workshopId: ids.workshopB } }));
    });

    await t.test('patentes normalizadas, unicidad por taller y archivo/reactivación', async () => {
      const a = await prisma.vehicle.create({ data: vehicle({ plate: ' aa-070 zz ' }) });
      assert.equal(a.plate, 'AA070ZZ');
      await rejects(prisma.vehicle.create({ data: vehicle({ plate: 'AA070ZZ' }) }), 'P2002');
      const b = await prisma.vehicle.create({ data: vehicle({ workshopId: ids.workshopB, customerId: ids.customerB, plate: 'AA070ZZ' }) });
      assert.equal(b.plate, a.plate);
      await prisma.vehicle.update({ where: { id: a.id }, data: { active: false } });
      await prisma.vehicle.create({ data: vehicle({ plate: 'aa070zz' }) });
      await rejects(prisma.vehicle.update({ where: { id: a.id }, data: { active: true } }));
      await rejects(prisma.vehicle.create({ data: vehicle({ plate: '???' }) }));
    });

    await t.test('la unicidad de patente resiste escrituras concurrentes', async () => {
      const results = await Promise.allSettled([1, 2].map(() => prisma.vehicle.create({ data: vehicle({ plate: 'RACE070' }) })));
      assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
      assert.equal(await prisma.vehicle.count({ where: { workshopId: ids.workshopA, plate: 'RACE070' } }), 1);
    });

    await t.test('datos incompletos y contactos repetidos entre talleres', async () => {
      const contact = { phone: 'CONTACTO-COMPARTIDO', taxId: 'DOCUMENTO-DEMO', email: 'cliente@example.invalid' };
      const a = await prisma.customer.create({ data: { workshopId: ids.workshopA, ...contact } });
      const b = await prisma.customer.create({ data: { workshopId: ids.workshopB, type: 'COMPANY', ...contact } });
      assert.equal(a.name, null);
      assert.equal(b.taxId, a.taxId);
      for (const plate of [null, null, ' - ']) {
        const row = await prisma.vehicle.create({ data: vehicle({ plate }) });
        assert.equal(row.plate, null);
        assert.equal(row.vin, null);
      }
      await rejects(prisma.customer.create({ data: { workshopId: ids.workshopA, phone: ' ' } }));
      await rejects(prisma.vehicle.create({ data: vehicle({ mileage: -1 }) }));
      await rejects(prisma.vehicle.create({ data: vehicle({ year: 0 }) }));
    });

    await t.test('cambios de propietario conservan períodos y son atómicos con rollback', async () => {
      const next = await prisma.customer.create({ data: { workshopId: ids.workshopA, phone: 'NUEVO-PROPIETARIO' } });
      await prisma.vehicle.update({ where: { id: ids.vehicleA }, data: { customerId: next.id } });
      const history = await prisma.vehicleOwnership.findMany({ where: { vehicleId: ids.vehicleA }, orderBy: [{ startedAt: 'asc' }, { endedAt: { sort: 'asc', nulls: 'last' } }] });
      assert.equal(history.length, 2);
      assert.equal(history[0].customerId, ids.customerA);
      assert.equal(history[0].endedAt.getTime(), history[1].startedAt.getTime());
      assert.equal(history[1].customerId, next.id);
      assert.equal(history[1].endedAt, null);
      await prisma.vehicle.update({ where: { id: ids.vehicleA }, data: { mileage: 100 } });
      assert.equal(await prisma.vehicleOwnership.count({ where: { vehicleId: ids.vehicleA } }), 2);
      await assert.rejects(prisma.$transaction(async tx => {
        await tx.vehicle.update({ where: { id: ids.vehicleA }, data: { customerId: ids.customerA } });
        throw new Error('Fallo simulado');
      }), /Fallo simulado/);
      assert.equal((await prisma.vehicle.findUniqueOrThrow({ where: { id: ids.vehicleA } })).customerId, next.id);
      assert.equal(await prisma.vehicleOwnership.count({ where: { vehicleId: ids.vehicleA } }), 2);
      await rejects(prisma.vehicleOwnership.update({ where: { id: history[0].id }, data: { customerId: next.id } }));
      await rejects(prisma.vehicleOwnership.delete({ where: { id: history[0].id } }));
      await rejects(prisma.vehicleOwnership.create({ data: { workshopId: ids.workshopB, vehicleId: ids.vehicleA, customerId: ids.customerB } }));
      const future = await prisma.vehicle.create({ data: vehicle({ createdAt: new Date(Date.now() + 60000) }) });
      await prisma.vehicle.update({ where: { id: future.id }, data: { customerId: next.id } });
      const closed = await prisma.vehicleOwnership.findFirstOrThrow({ where: { vehicleId: future.id, endedAt: { not: null } } });
      assert.ok(closed.endedAt >= closed.startedAt);
    });

    await t.test('actualizaciones concurrentes del propietario dejan una sola titularidad actual', async () => {
      const row = await prisma.vehicle.create({ data: vehicle() });
      const other = await prisma.customer.create({ data: { workshopId: ids.workshopA, phone: 'CONCURRENTE' } });
      const third = await prisma.customer.create({ data: { workshopId: ids.workshopA, phone: 'CONCURRENTE-2' } });
      await Promise.all([other, third].map(customer => prisma.vehicle.update({ where: { id: row.id }, data: { customerId: customer.id } })));
      const current = await prisma.vehicleOwnership.findMany({ where: { vehicleId: row.id, endedAt: null } });
      assert.equal(current.length, 1);
      assert.equal(current[0].customerId, (await prisma.vehicle.findUniqueOrThrow({ where: { id: row.id } })).customerId);
      assert.equal(await prisma.vehicleOwnership.count({ where: { vehicleId: row.id } }), 3);
    });

    await t.test('SQL directo respeta normalización, relaciones y conservación del historial', async () => {
      const id = randomUUID();
      await prisma.$executeRaw`INSERT INTO vehiculo(id, taller_id, cliente_id, patente) VALUES (${id}::uuid, ${ids.workshopA}::uuid, ${ids.customerA}::uuid, ' sql-070 ')`;
      assert.equal((await prisma.vehicle.findUniqueOrThrow({ where: { id } })).plate, 'SQL070');
      await rejects(prisma.$executeRaw`UPDATE vehiculo SET cliente_id = ${ids.customerB}::uuid WHERE id = ${id}::uuid`);
      await rejects(prisma.customer.delete({ where: { id: ids.customerA } }));
      await rejects(prisma.vehicle.delete({ where: { id } }));
      await rejects(prisma.workshop.delete({ where: { id: ids.workshopA } }));
    });
  } finally {
    await Promise.all([prisma.$disconnect(), upgrade.$disconnect(), mainUpgrade.$disconnect()]);
    // Solo se elimina el directorio absoluto creado arriba, dentro del temp del sistema.
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('talleres-point07-'));
    rmSync(temp, { recursive: true, force: true });
  }
});
