const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { setup, Browser, tokenFrom, registerOwner, inviteAndAccept, PASSWORD } = require('./http-helpers.cjs');

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
      // Permite simular algo que ocurre mientras la API habla con Google.
      if (profile.during) await profile.during();
      return profile;
    };
  };
  return { profiles, exchanges, override };
}

async function start(browser, route = '/auth/google/start') {
  const response = await browser.raw('GET', route);
  assert.equal(response.status, 302, `${route} redirige a Google`);
  return new URL(response.headers.get('location'));
}

async function finish(browser, params) {
  const response = await browser.raw('GET', `/auth/google/callback?${new URLSearchParams(params)}`);
  assert.equal(response.status, 302);
  return response.headers.get('location');
}

let codes = 0;
/** Recorrido completo con un perfil de Google; devuelve el destino de la redirección. */
async function googleFlow(google, browser, profile, { route, nonce } = {}) {
  const authorization = await start(browser, route);
  const code = `codigo-${++codes}`;
  google.profiles.set(code, { emailVerified: true, ...profile, nonce: nonce ?? authorization.searchParams.get('nonce') });
  return finish(browser, { state: authorization.searchParams.get('state'), code });
}
const link = (google, browser, profile) => googleFlow(google, browser, profile, { route: '/auth/google/link/start' });
const login = (google, browser, profile, options) => googleFlow(google, browser, profile, options);

test('TS-20 · ingreso con Google para cuentas vinculadas en PostgreSQL real', async t => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
  const google = fakeGoogle();
  const api = await startApi({ override: google.override });
  try {
    const { browser: owner, me } = await registerOwner(api, { workshopName: 'Taller Google', ownerName: 'Dueña Google', email: 'duena.google@example.invalid' });

    await t.test('la pantalla de ingreso sabe si Google está habilitado', async () => {
      assert.deepEqual((await new Browser(api).get('/auth/options')).body, { google: true });
      assert.equal((await owner.get('/auth/me')).body.googleLinked, false);
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

    await t.test('revisión: una cuenta de Google con el email del dueño no entra si no fue vinculada', async () => {
      // Caso reportado: email_verified puede seguir en true aunque el buzón externo cambie de dueño.
      const attacker = new Browser(api);
      assert.equal(await login(google, attacker, { subject: 'google-de-un-tercero', email: 'duena.google@example.invalid' }),
        'http://app.test/login?google=not-linked');
      assert.equal((await attacker.get('/auth/me')).status, 401);
      assert.equal(await prisma.googleIdentity.count(), 0, 'no se vincula por email');
    });

    await t.test('vincular exige una sesión iniciada con contraseña', async () => {
      assert.equal((await new Browser(api).raw('GET', '/auth/google/link/start')).status, 401);
      const location = await link(google, owner, { subject: 'google-sub-duena', email: 'cualquier-email@example.invalid' });
      assert.equal(location, 'http://app.test/?google=linked');
      assert.equal((await prisma.googleIdentity.findUniqueOrThrow({ where: { userId: me.user.id } })).subject, 'google-sub-duena');
      assert.equal((await owner.get('/auth/me')).body.googleLinked, true);
      assert.equal((await owner.get('/auth/me')).status, 200, 'la sesión con contraseña sigue igual');
    });

    await t.test('una cuenta vinculada inicia sesión con Google', async () => {
      const browser = new Browser(api);
      const authorization = await start(browser);
      google.profiles.set('codigo-ok', { subject: 'google-sub-duena', email: 'otro-email-en-google@example.invalid', emailVerified: true, nonce: authorization.searchParams.get('nonce') });
      assert.equal(await finish(browser, { state: authorization.searchParams.get('state'), code: 'codigo-ok' }), 'http://app.test/');
      const session = await browser.get('/auth/me');
      assert.equal(session.body.user.id, me.user.id);
      assert.equal(session.body.role, 'OWNER');
      const verifier = google.exchanges.at(-1).codeVerifier;
      assert.equal(createHash('sha256').update(verifier).digest('base64url'), authorization.searchParams.get('code_challenge'), 'PKCE coincide');
      assert.ok(!browser.cookie.includes('taller_google_state'), 'la cookie del intento se borra');

      // El state es de un solo uso.
      google.profiles.set('codigo-repetido', { subject: 'google-sub-duena', email: 'x@example.invalid', emailVerified: true, nonce: authorization.searchParams.get('nonce') });
      browser.cookie = `taller_google_state=${authorization.searchParams.get('state')}`;
      assert.equal(await finish(browser, { state: authorization.searchParams.get('state'), code: 'codigo-repetido' }), 'http://app.test/login?google=invalid');
    });

    await t.test('la vinculación solo se completa en el navegador y la sesión que la iniciaron', async () => {
      const { browser: other } = await registerOwner(api, { workshopName: 'Otro taller', ownerName: 'Otra persona', email: 'otra@example.invalid' });
      // Otra sesión con el state robado: no puede completar la vinculación ajena.
      const ownerLink = await start(owner, '/auth/google/link/start');
      google.profiles.set('codigo-robado', { subject: 'google-sub-robado', email: 'x@example.invalid', emailVerified: true, nonce: ownerLink.searchParams.get('nonce') });
      const intruder = new Browser(api);
      intruder.cookie = `${other.cookie}; taller_google_state=${ownerLink.searchParams.get('state')}`;
      assert.equal(await finish(intruder, { state: ownerLink.searchParams.get('state'), code: 'codigo-robado' }), 'http://app.test/login?google=invalid');
      // Si la sesión se cerró entre el inicio y la vuelta de Google, tampoco.
      const closing = (await registerOwner(api, { workshopName: 'Taller que cierra', ownerName: 'Persona', email: 'cierra@example.invalid' })).browser;
      const closingLink = await start(closing, '/auth/google/link/start');
      const stateCookie = closing.cookie.split('; ').find(c => c.startsWith('taller_google_state='));
      assert.equal((await closing.post('/auth/logout')).status, 204);
      closing.cookie = stateCookie;
      google.profiles.set('codigo-cerrado', { subject: 'google-sub-cerrado', email: 'x@example.invalid', emailVerified: true, nonce: closingLink.searchParams.get('nonce') });
      assert.equal(await finish(closing, { state: closingLink.searchParams.get('state'), code: 'codigo-cerrado' }), 'http://app.test/login?google=invalid');
      assert.equal(await prisma.googleIdentity.count({ where: { subject: { in: ['google-sub-robado', 'google-sub-cerrado'] } } }), 0);
    });

    await t.test('revisión: la vinculación queda atada a la sesión exacta y vigente que la inició', async () => {
      // 1. Cerrar sesión y volver a entrar con la misma cuenta antes de volver de Google.
      const { browser: relogin } = await registerOwner(api, { workshopName: 'Taller relogin', ownerName: 'Persona', email: 'relogin@example.invalid' });
      const url = await start(relogin, '/auth/google/link/start');
      assert.equal((await relogin.post('/auth/logout')).status, 204);
      assert.equal((await relogin.post('/auth/login', { email: 'relogin@example.invalid', password: PASSWORD })).status, 200);
      assert.ok(relogin.cookie.includes('taller_google_state='), 'mismo navegador, con la cookie del intento');
      google.profiles.set('codigo-relogin', { subject: 'sub-relogin', email: 'x@example.invalid', emailVerified: true, nonce: url.searchParams.get('nonce') });
      assert.equal(await finish(relogin, { state: url.searchParams.get('state'), code: 'codigo-relogin' }), 'http://app.test/login?google=invalid',
        'otra sesión del mismo usuario no completa la vinculación');

      // 2. Cerrar sesión mientras la API habla con Google.
      const { browser: closing } = await registerOwner(api, { workshopName: 'Taller cierra', ownerName: 'Persona', email: 'cierra-durante@example.invalid' });
      const closingSession = closing.cookie;
      assert.equal(await link(google, closing, {
        subject: 'sub-cierra-durante', email: 'x@example.invalid',
        during: async () => {
          const sameSession = new Browser(api);
          sameSession.cookie = closingSession;
          assert.equal((await sameSession.post('/auth/logout')).status, 204);
        },
      }), 'http://app.test/login?google=invalid');

      // 3. Restablecer la contraseña mientras la API habla con Google.
      const { browser: resetting } = await registerOwner(api, { workshopName: 'Taller restablece', ownerName: 'Persona', email: 'restablece-durante@example.invalid' });
      assert.equal(await link(google, resetting, {
        subject: 'sub-restablece-durante', email: 'x@example.invalid',
        during: async () => {
          await new Browser(api).post('/auth/password/forgot', { email: 'restablece-durante@example.invalid' });
          const token = tokenFrom(api.outbox.at(-1));
          assert.equal((await new Browser(api).post('/auth/password/reset', { token, password: 'contraseña nueva durante google' })).status, 200);
        },
      }), 'http://app.test/login?google=invalid');

      assert.equal(await prisma.googleIdentity.count({ where: { subject: { in: ['sub-relogin', 'sub-cierra-durante', 'sub-restablece-durante'] } } }), 0,
        'ninguno de los tres casos guarda el vínculo');
    });

    await t.test('una cuenta de Google se vincula a un solo usuario y un usuario a una sola cuenta', async () => {
      const { browser: other } = await registerOwner(api, { workshopName: 'Taller ajeno', ownerName: 'Persona', email: 'ajena@example.invalid' });
      assert.equal(await link(google, other, { subject: 'google-sub-duena', email: 'x@example.invalid' }), 'http://app.test/?google=conflict');
      assert.equal(await link(google, owner, { subject: 'otra-cuenta-de-la-duena', email: 'x@example.invalid' }), 'http://app.test/?google=conflict',
        'primero hay que desvincular la anterior');
      assert.equal(await link(google, owner, { subject: 'google-sub-duena', email: 'x@example.invalid' }), 'http://app.test/?google=linked', 'volver a vincular la misma es inocuo');
    });

    await t.test('desvincular impide volver a entrar con esa cuenta de Google', async () => {
      assert.equal((await owner.delete('/auth/google/link')).status, 204);
      assert.equal((await owner.get('/auth/me')).body.googleLinked, false);
      assert.equal(await login(google, new Browser(api), { subject: 'google-sub-duena', email: 'x@example.invalid' }), 'http://app.test/login?google=not-linked');
      assert.equal((await owner.delete('/auth/google/link')).status, 404);
      assert.equal(await link(google, owner, { subject: 'google-sub-duena', email: 'x@example.invalid' }), 'http://app.test/?google=linked');
    });

    await t.test('se rechaza un state que no es de este navegador, un nonce ajeno y un intento vencido', async () => {
      const victim = new Browser(api);
      const authorization = await start(new Browser(api));
      google.profiles.set('codigo-csrf', { subject: 'google-sub-duena', email: 'x@example.invalid', emailVerified: true, nonce: authorization.searchParams.get('nonce') });
      assert.equal(await finish(victim, { state: authorization.searchParams.get('state'), code: 'codigo-csrf' }), 'http://app.test/login?google=invalid');
      assert.equal((await victim.get('/auth/me')).status, 401);
      assert.equal(await login(google, new Browser(api), { subject: 'google-sub-duena', email: 'x@example.invalid' }, { nonce: 'n'.repeat(43) }),
        'http://app.test/login?google=invalid', 'nonce distinto');
      const late = new Browser(api);
      const url = await start(late);
      const now = Date.now();
      await prisma.googleLoginAttempt.updateMany({ where: { usedAt: null }, data: { createdAt: new Date(now - 20 * 60000), expiresAt: new Date(now - 60000) } });
      google.profiles.set('codigo-tarde', { subject: 'google-sub-duena', email: 'x@example.invalid', emailVerified: true, nonce: url.searchParams.get('nonce') });
      assert.equal(await finish(late, { state: url.searchParams.get('state'), code: 'codigo-tarde' }), 'http://app.test/login?google=invalid', 'vencido');
    });

    await t.test('email sin verificar, cancelación o error de Google no inician sesión', async () => {
      const unverified = new Browser(api);
      assert.equal(await login(google, unverified, { subject: 'google-sub-duena', email: 'x@example.invalid', emailVerified: false }), 'http://app.test/login?google=unverified');
      assert.equal((await unverified.get('/auth/me')).status, 401);
      const cancelled = new Browser(api);
      const url = await start(cancelled);
      assert.equal(await finish(cancelled, { state: url.searchParams.get('state'), error: 'access_denied' }), 'http://app.test/login?google=cancelled');
      const failing = new Browser(api);
      const failingUrl = await start(failing);
      assert.equal(await finish(failing, { state: failingUrl.searchParams.get('state'), code: 'codigo-que-google-rechaza' }), 'http://app.test/login?google=error');
      assert.equal(await prisma.user.count({ where: { email: 'x@example.invalid' } }), 0, 'Google no crea cuentas');
    });

    await t.test('una cuenta vinculada y dada de baja no entra con Google', async () => {
      const mechanic = await inviteAndAccept(api, owner, { email: 'mecanico.google@example.invalid', role: 'MECHANIC', name: 'Mecánico' });
      assert.equal(await link(google, mechanic, { subject: 'sub-mecanico', email: 'x@example.invalid' }), 'http://app.test/?google=linked');
      const target = (await owner.get('/employees')).body.find(e => e.email === 'mecanico.google@example.invalid');
      assert.equal((await owner.patch(`/employees/${target.id}`, { status: 'INACTIVE' })).status, 200);
      const browser = new Browser(api);
      assert.equal(await login(google, browser, { subject: 'sub-mecanico', email: 'x@example.invalid' }), 'http://app.test/login?google=disabled');
      assert.equal((await browser.get('/auth/me')).status, 401);
    });

    await t.test('sin credenciales de Google el ingreso y la vinculación quedan deshabilitados', async () => {
      const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      const disabled = await startApi();
      try {
        assert.deepEqual((await new Browser(disabled).get('/auth/options')).body, { google: false });
        assert.equal((await new Browser(disabled).raw('GET', '/auth/google/start')).status, 404);
        const { browser } = await registerOwner(disabled, { workshopName: 'Taller sin Google', ownerName: 'Persona', email: 'singoogle@example.invalid' });
        assert.equal((await browser.raw('GET', '/auth/google/link/start')).status, 404);
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
