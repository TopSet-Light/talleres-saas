// Utilidades compartidas por las pruebas HTTP de integración. Cada archivo de prueba corre en
// su propio proceso y su propio esquema de la base descartable creada por scripts/test-data.cjs.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (process.env.POINT07_DISPOSABLE !== '1') throw new Error('Usar pnpm --filter backend test:data');
const baseUrl = new URL(process.env.DATABASE_URL);
if (baseUrl.hostname !== '127.0.0.1' || baseUrl.pathname !== '/point07_test') {
  throw new Error('La integración requiere la base descartable point07_test.');
}

const backend = path.resolve(__dirname, '../..');
const ORIGIN = 'http://app.test';
const PASSWORD = 'contraseña de prueba segura';

function schemaUrl(schema) {
  const url = new URL(baseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

function deploy(databaseUrl) {
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: backend, env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8', windowsHide: true,
  });
  // No imprimir la salida de Prisma, que puede contener la URL de conexión.
  assert.equal(result.status, 0, 'prisma migrate deploy debe finalizar correctamente');
}

/** Prepara el esquema, fija la configuración y devuelve una función para levantar la API real. */
function setup(schema, env = {}) {
  const databaseUrl = schemaUrl(schema);
  deploy(databaseUrl);
  Object.assign(process.env, { DATABASE_URL: databaseUrl, APP_URL: ORIGIN, ...env });
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../../dist/app.module');
  const { configureApp } = require('../../dist/app.setup');
  const { MailService } = require('../../dist/mail/mail.service');
  async function startApi({ rateLimit = 1000, override } = {}) {
    process.env.AUTH_RATE_LIMIT = String(rateLimit);
    const app = configureApp(await NestFactory.create(AppModule, { logger: false }));
    const outbox = [];
    // Correo capturado en memoria: la prueba lee los enlaces sin un servidor SMTP.
    app.get(MailService).send = async message => { outbox.push(message); return true; };
    if (override) override(app);
    await app.listen(0, '127.0.0.1');
    return { app, outbox, url: `${await app.getUrl()}/api` };
  }
  return { databaseUrl, startApi };
}

/** Navegador mínimo: guarda la cookie de sesión y envía el Origin de la aplicación. */
class Browser {
  constructor(api) { this.api = api; this.cookie = undefined; }
  async raw(method, route, { body, headers = {}, origin = ORIGIN, redirect = 'manual' } = {}) {
    const all = { ...headers };
    if (origin) all.origin = origin;
    if (this.cookie) all.cookie = this.cookie;
    const response = await fetch(`${this.api.url}${route}`, { method, headers: all, body, redirect });
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(';');
      const [name, ...rest] = pair.split('=');
      const cookies = new Map((this.cookie ?? '').split('; ').filter(Boolean).map(c => [c.split('=')[0], c]));
      if (rest.join('=') === '' || /Expires=Thu, 01 Jan 1970/i.test(value)) cookies.delete(name);
      else cookies.set(name, pair);
      this.cookie = [...cookies.values()].join('; ') || undefined;
    }
    return response;
  }
  async call(method, route, body, options = {}) {
    const response = await this.raw(method, route, {
      ...options,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? options.headers : { 'content-type': 'application/json', ...options.headers },
    });
    const text = await response.text();
    const json = text && (response.headers.get('content-type') ?? '').includes('json') ? JSON.parse(text) : undefined;
    return { status: response.status, text, body: json, headers: response.headers };
  }
  get(route, options) { return this.call('GET', route, undefined, options); }
  post(route, body, options) { return this.call('POST', route, body ?? {}, options); }
  put(route, body, options) { return this.call('PUT', route, body, options); }
  patch(route, body, options) { return this.call('PATCH', route, body, options); }
  delete(route, options) { return this.call('DELETE', route, undefined, options); }
}

function tokenFrom(message) {
  const match = /#token=([A-Za-z0-9_-]{43})/.exec(message.text);
  assert.ok(match, 'el email contiene un enlace con token');
  return match[1];
}

/** Registra un taller completo (solicitud, enlace, contraseña) e inicia sesión. */
async function registerOwner(api, { workshopName, ownerName, email, password = PASSWORD, extra = {} }) {
  const browser = new Browser(api);
  assert.equal((await browser.post('/auth/register', { workshopName, ownerName, email, ...extra })).status, 202);
  const token = tokenFrom(api.outbox.at(-1));
  assert.equal((await browser.post('/auth/registration/complete', { token, password })).status, 201);
  const login = await browser.post('/auth/login', { email, password });
  assert.equal(login.status, 200);
  return { browser, me: login.body };
}

async function inviteAndAccept(api, owner, { email, role, name, password = PASSWORD }) {
  assert.equal((await owner.post('/invitations', { email, role })).status, 201);
  const guest = new Browser(api);
  assert.equal((await guest.post('/invitations/accept', { token: tokenFrom(api.outbox.at(-1)), name, password })).status, 201);
  assert.equal((await guest.post('/auth/login', { email, password })).status, 200);
  return guest;
}

module.exports = { setup, Browser, tokenFrom, registerOwner, inviteAndAccept, ORIGIN, PASSWORD };
