const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/database/prisma.service');
const { HealthService } = require('../dist/health/health.service');

test('contrato HTTP: consulta, caída, recuperación y ausencia de secretos', async () => {
  let down = false;
  let calls = 0;
  const app = await NestFactory.create(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  prisma.$queryRaw = async (sql) => {
    assert.equal(sql[0], 'SELECT 1');
    calls++;
    if (down) throw new Error('postgresql://secret:password@postgres/db internal stack');
    return [{ '?column?': 1 }];
  };
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  try {
    const url = `${await app.getUrl()}/api/health`;
    for (const unavailable of [false, true, false]) {
      down = unavailable;
      const response = await fetch(url);
      assert.equal(response.status, down ? 503 : 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), down
        ? { status: 'unavailable', database: 'unavailable' }
        : { status: 'ok', database: 'ok' });
    }
    assert.equal(calls, 3);
  } finally { await app.close(); }
});

test('timeout acotado y una sola consulta pendiente', async () => {
  let calls = 0;
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const service = new HealthService({ $queryRaw: () => { calls++; return pending; } });
  const start = Date.now();
  await Promise.all([1, 2].map(async () => {
    await assert.rejects(service.check(), error => error.getStatus() === 503);
  }));
  assert.ok(Date.now() - start < 4500);
  assert.equal(calls, 1);
  resolve([]);
  await pending;
  assert.deepEqual(await service.check(), { status: 'ok', database: 'ok' });
});
