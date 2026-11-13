const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { setup, Browser, registerOwner, inviteAndAccept } = require('./http-helpers.cjs');

const CLIENT_ID = 'cliente-de-prueba.apps.googleusercontent.com';
const { databaseUrl, startApi } = setup('google_login', { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: 'secreto-de-prueba' });

/**
 * Google simulado: solo se reemplaza el intercambio de red (código por perfil). Todo lo demás
 * (state, cookie, PKCE, nonce, vinculación y sesión) corre con el código real.
 */
function fakeGoogle() {
  const profiles = new Map();
  const exchanges = [];
  const override = app => {
    const { GoogleOidcService } = require('../../dist/modules/auth/google-oidc.service');
    app.get(GoogleOidcService).exchange = async ({ code, codeVerifier }) => {
      exchanges.push({ code, codeVerifier });
      const profile = profiles.get(code);
      if (!profile) throw new Error('código desconocido');
      return profile;
    };
  };
  return { profiles, exchanges, override };
}

async function start(browser) {
  const response = await browser.raw('GET', '/auth/google/start');
  assert.equal(response.status, 302);
  return new URL(response.headers.get('location'));
}

async function finish(browser, params) {
  const response = await browser.raw('GET', `/auth/google/callback?${new URLSearchParams(params)}`);
  assert.equal(response.status, 302);
  return response.headers.get('location');
}

/** Recorrido completo con un perfil de Google; devuelve el destino de la redirección. */
async function loginWithGoogle(api, google, browser, profile, { code = `codigo-${Math.random()}`, nonce } = {}) {
  const authorization = await start(browser);
  google.profiles.set(code, { emailVerified: true, ...profile, nonce: nonce ?? authorization.searchParams.get('nonce') });
  return finish(browser, { state: authorization.searchParams.get('state'), code });
}

test('TS-20 · ingreso con Google para cuentas existentes en PostgreSQL real', async t => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
  const google = fakeGoogle();
  const api = await startApi({ override: google.override });
  try {
    const { browser: owner, me } = await registerOwner(api, { workshopName: 'Taller Google', ownerName: 'Dueña Google', email: 'duena.google@example.invalid' });

    await t.test('la pantalla de ingreso sabe si Google está habilitado', async () => {
      assert.deepEqual((await new Browser(api).get('/auth/options')).body, { google: true });
    });

    await t.test('el inicio redirige a Google con PKCE S256, state y nonce, y ata el state al navegador', async () => {
      const browser = new Browser(api);
      const url = await start(browser);
      assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
      assert.equal(url.searchParams.get('client_id'), CLIENT_ID);
      assert.equal(url.searchParams.get('redirect_uri'), 'http://app.test/api/auth/google/callback');
      assert.equal(url.searchParams.get('scope'), 'openid email');
      assert.equal(url.searchParams.get('response_type'), 'code');
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      assert.match(url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
      assert.match(url.searchParams.get('nonce'), /^[A-Za-z0-9_-]{43}$/);
      assert.ok(browser.cookie.includes(`taller_google_state=${url.searchParams.get('state')}`));
      assert.equal(await prisma.googleLoginAttempt.count({ where: { stateHash: createHash('sha256').update(url.searchParams.get('state')).digest('hex') } }), 1,
        'en la base solo queda el hash del state');
    });

    await t.test('un email verificado con cuenta inicia sesión y queda vinculado', async () => {
      const browser = new Browser(api);
      const authorization = await start(browser);
      google.profiles.set('codigo-ok', { subject: 'google-sub-duena', email: 'Duena.Google@Example.Invalid', emailVerified: true, nonce: authorization.searchParams.get('nonce') });
      const location = await finish(browser, { state: authorization.searchParams.get('state'), code: 'codigo-ok' });
      assert.equal(location, 'http://app.test/');
      const session = await browser.get('/auth/me');
      assert.equal(session.status, 200);
      assert.equal(session.body.user.id, me.user.id);
      assert.equal(session.body.role, 'OWNER');
      const verifier = google.exchanges.at(-1).codeVerifier;
      assert.equal(createHash('sha256').update(verifier).digest('base64url'), authorization.searchParams.get('code_challenge'), 'PKCE coincide');
      assert.equal((await prisma.googleIdentity.findUniqueOrThrow({ where: { userId: me.user.id } })).subject, 'google-sub-duena');
      assert.ok(!browser.cookie.includes('taller_google_state'), 'la cookie del intento se borra');

      // El state es de un solo uso.
      google.profiles.set('codigo-repetido', { subject: 'google-sub-duena', email: 'duena.google@example.invalid', emailVerified: true, nonce: authorization.searchParams.get('nonce') });
      browser.cookie = `taller_google_state=${authorization.searchParams.get('state')}`;
      assert.equal(await finish(browser, { state: authorization.searchParams.get('state'), code: 'codigo-repetido' }), 'http://app.test/login?google=invalid');
    });

    await t.test('se rechaza un state que no es de este navegador, un nonce ajeno y un intento vencido', async () => {
      const victim = new Browser(api);
      const authorization = await start(new Browser(api));
      google.profiles.set('codigo-csrf', { subject: 'google-sub-duena', email: 'duena.google@example.invalid', emailVerified: true, nonce: authorization.searchParams.get('nonce') });
      assert.equal(await finish(victim, { state: authorization.searchParams.get('state'), code: 'codigo-csrf' }), 'http://app.test/login?google=invalid',
        'sin la cookie del navegador que inició el ingreso');
      assert.equal((await victim.get('/auth/me')).status, 401);

      assert.equal(await loginWithGoogle(api, google, new Browser(api), { subject: 'google-sub-duena', email: 'duena.google@example.invalid' }, { nonce: 'n'.repeat(43) }),
        'http://app.test/login?google=invalid', 'nonce distinto');

      const late = new Browser(api);
      const url = await start(late);
      const now = Date.now();
      await prisma.googleLoginAttempt.updateMany({ where: { usedAt: null }, data: { createdAt: new Date(now - 20 * 60000), expiresAt: new Date(now - 60000) } });
      google.profiles.set('codigo-tarde', { subject: 'google-sub-duena', email: 'duena.google@example.invalid', emailVerified: true, nonce: url.searchParams.get('nonce') });
      assert.equal(await finish(late, { state: url.searchParams.get('state'), code: 'codigo-tarde' }), 'http://app.test/login?google=invalid', 'vencido');
    });

    await t.test('email sin verificar, sin cuenta, cancelado o con error de Google no inician sesión', async () => {
      const cases = [
        [{ subject: 'sub-sin-verificar', email: 'duena.google@example.invalid', emailVerified: false }, 'unverified'],
        [{ subject: 'sub-sin-cuenta', email: 'nadie@example.invalid' }, 'no-account'],
      ];
      for (const [profile, reason] of cases) {
        const browser = new Browser(api);
        assert.equal(await loginWithGoogle(api, google, browser, profile), `http://app.test/login?google=${reason}`);
        assert.equal((await browser.get('/auth/me')).status, 401);
      }
      assert.equal(await prisma.user.count({ where: { email: 'nadie@example.invalid' } }), 0, 'Google no crea cuentas');

      const cancelled = new Browser(api);
      const url = await start(cancelled);
      assert.equal(await finish(cancelled, { state: url.searchParams.get('state'), error: 'access_denied' }), 'http://app.test/login?google=cancelled');

      const failing = new Browser(api);
      const failingUrl = await start(failing);
      assert.equal(await finish(failing, { state: failingUrl.searchParams.get('state'), code: 'codigo-que-google-rechaza' }), 'http://app.test/login?google=error');
    });

    await t.test('una cuenta dada de baja no entra con Google', async () => {
      const mechanic = await inviteAndAccept(api, owner, { email: 'mecanico.google@example.invalid', role: 'MECHANIC', name: 'Mecánico' });
      assert.ok(mechanic);
      const employees = (await owner.get('/employees')).body;
      const target = employees.find(e => e.email === 'mecanico.google@example.invalid');
      assert.equal((await owner.patch(`/employees/${target.id}`, { status: 'INACTIVE' })).status, 200);
      const browser = new Browser(api);
      assert.equal(await loginWithGoogle(api, google, browser, { subject: 'sub-mecanico', email: 'mecanico.google@example.invalid' }), 'http://app.test/login?google=disabled');
      assert.equal((await browser.get('/auth/me')).status, 401);
    });

    await t.test('la cuenta vinculada se reconoce por sub y otra cuenta de Google con el mismo email se rechaza', async () => {
      const changedEmail = new Browser(api);
      assert.equal(await loginWithGoogle(api, google, changedEmail, { subject: 'google-sub-duena', email: 'nuevo-email-en-google@example.invalid' }), 'http://app.test/');
      assert.equal((await changedEmail.get('/auth/me')).body.user.id, me.user.id);
      assert.equal(await loginWithGoogle(api, google, new Browser(api), { subject: 'otra-cuenta-google', email: 'duena.google@example.invalid' }),
        'http://app.test/login?google=conflict');
    });

    await t.test('sin credenciales de Google el ingreso queda deshabilitado', async () => {
      const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      const disabled = await startApi();
      try {
        assert.deepEqual((await new Browser(disabled).get('/auth/options')).body, { google: false });
        assert.equal((await new Browser(disabled).raw('GET', '/auth/google/start')).status, 404);
      } finally {
        await disabled.app.close();
        Object.assign(process.env, { GOOGLE_CLIENT_ID: saved.id, GOOGLE_CLIENT_SECRET: saved.secret });
      }
    });
  } finally {
    await api.app.close();
    await prisma.$disconnect();
  }
});
