const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { readdirSync } = require('node:fs');

const name = `talleres-point07-${randomBytes(6).toString('hex')}`;
const password = randomBytes(24).toString('hex');
function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.status !== 0) throw new Error('Falló Docker. Verificar que Docker Desktop esté disponible.');
  return result.stdout.trim();
}

async function main() {
  let started = false;
  try {
    // Sin .env, sin volumen persistente y sin utilizar la base del desarrollador.
    docker(['run', '--detach', '--rm', '--name', name,
      '--tmpfs', '/var/lib/postgresql/data', '--publish', '127.0.0.1::5432',
      '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER=point07', '--env', 'POSTGRES_DB=point07_test',
      'postgres:17.11-bookworm'], { env: { ...process.env, POSTGRES_PASSWORD: password } });
    started = true;
    const deadline = Date.now() + 60000;
    while (true) {
      const ready = spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'point07', '-d', 'point07_test'], { windowsHide: true });
      if (ready.status === 0) break;
      if (Date.now() > deadline) throw new Error('PostgreSQL de prueba no estuvo disponible a tiempo.');
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    const address = docker(['port', name, '5432/tcp']);
    if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error('Puerto de prueba inesperado.');
    const databaseUrl = `postgresql://point07:${password}@${address}/point07_test`;
    // Datos (punto 07) y acceso HTTP (punto 08), cada archivo en su propio esquema.
    const files = readdirSync(path.resolve(__dirname, '../test/integration'))
      .filter(file => file.endsWith('.test.cjs')).map(file => `test/integration/${file}`);
    const result = spawnSync(process.execPath, ['--test', ...files], {
      cwd: path.resolve(__dirname, '..'), windowsHide: true, stdio: 'inherit',
      env: { ...process.env, POINT07_DISPOSABLE: '1', DATABASE_URL: databaseUrl },
    });
    process.exitCode = result.status ?? 1;
  } finally {
    if (started) docker(['stop', '--time', '1', name]);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
