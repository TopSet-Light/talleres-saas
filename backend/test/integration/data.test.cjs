const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, copyFileSync, rmSync } = require('node:fs');
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
  const temp = mkdtempSync(path.join(os.tmpdir(), 'talleres-point07-'));
  try {
    await t.test('instalación vacía y deploy repetido sin cambios', async () => {
      deploy('empty_install');
      deploy('empty_install');
      assert.equal(await prisma.workshop.count(), 0);
      const migrations = await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`;
      assert.deepEqual(migrations.map(row => row.migration_name), [first, second, third]);
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
      assert.equal(await upgrade.user.count(), 4);
      assert.equal(await upgrade.vehicle.count(), 2);
      assert.equal((await upgrade.vehicle.findUniqueOrThrow({ where: { id: ids.vehicleA } })).plate, 'AB123CD');
      assert.equal(await upgrade.vehicleOwnership.count(), 2);
      await rejects(upgrade.vehicle.create({ data: vehicle({ plate: 'ab 123-cd' }) }));
      await rejects(upgrade.vehicle.create({ data: vehicle({ customerId: ids.customerB }) }));
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
    await Promise.all([prisma.$disconnect(), upgrade.$disconnect()]);
    // Solo se elimina el directorio absoluto creado arriba, dentro del temp del sistema.
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('talleres-point07-'));
    rmSync(temp, { recursive: true, force: true });
  }
});
