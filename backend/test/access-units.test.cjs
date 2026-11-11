const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, hasPermission, permissionsFor } = require('../dist/modules/auth/permissions');
const { LoginAttemptsService, MAX_FAILED_LOGINS, FAILED_LOGIN_WINDOW_MS } = require('../dist/modules/auth/login-attempts.service');
const { PasswordService } = require('../dist/modules/auth/password.service');
const { loadConfig } = require('../dist/config/app-config');
const { hashToken, newToken, TOKEN_PATTERN, normalizeEmail } = require('../dist/common/tokens');
const { OriginMiddleware } = require('../dist/common/origin.middleware');
const { smtpTransportOptions } = require('../dist/mail/mail.service');

test('matriz de permisos: solo el dueño gestiona empleados y el mecánico no toca precios ni cobros', () => {
  for (const permission of ['employees.read', 'employees.invite', 'employees.changeRole', 'employees.deactivate']) {
    assert.deepEqual([...PERMISSIONS[permission]], ['OWNER'], permission);
  }
  for (const permission of ['pricing.manage', 'payments.register', 'estimates.manage', 'customers.write']) {
    assert.equal(hasPermission('MECHANIC', permission), false, permission);
  }
  assert.equal(hasPermission('MECHANIC', 'workOrders.diagnose'), true);
  assert.equal(hasPermission('RECEPTION', 'employees.invite'), false);
  assert.ok(permissionsFor('OWNER').length === Object.keys(PERMISSIONS).length);
});

test('intentos fallidos: bloquea al quinto por email y se libera al vencer la ventana', () => {
  const attempts = new LoginAttemptsService();
  const now = 1_000_000;
  for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) attempts.recordFailure('a@example.invalid', now);
  assert.equal(attempts.isBlocked('a@example.invalid', now), false);
  attempts.recordFailure('a@example.invalid', now);
  assert.equal(attempts.isBlocked('a@example.invalid', now), true);
  assert.equal(attempts.isBlocked('b@example.invalid', now), false, 'otro email no se ve afectado');
  assert.equal(attempts.isBlocked('a@example.invalid', now + FAILED_LOGIN_WINDOW_MS), false);
  attempts.recordFailure('c@example.invalid', now);
  attempts.reset('c@example.invalid');
  assert.equal(attempts.isBlocked('c@example.invalid', now), false);
});

test('configuración: valores locales por defecto, Secure con https y errores sin datos', () => {
  const local = loadConfig({});
  assert.equal(local.appOrigin, 'http://localhost:5173');
  assert.equal(local.cookieSecure, false);
  assert.equal(local.authRateLimit, 10);
  assert.equal(local.trustProxyHops, 1);
  assert.equal(loadConfig({ TRUST_PROXY_HOPS: '0' }).trustProxyHops, 0);
  assert.throws(() => loadConfig({ TRUST_PROXY_HOPS: '-1' }), /TRUST_PROXY_HOPS/);
  assert.equal(loadConfig({ APP_URL: 'https://taller.example/' }).cookieSecure, true);
  assert.equal(loadConfig({ APP_URL: 'https://taller.example/' }).appUrl, 'https://taller.example');
  assert.equal(loadConfig({ APP_URL: 'https://taller.example', COOKIE_SECURE: 'false' }).cookieSecure, false);
  assert.throws(() => loadConfig({ APP_URL: 'javascript:alert(1)' }), /APP_URL/);
  assert.throws(() => loadConfig({ SMTP_PORT: 'x' }), /SMTP_PORT/);
});

test('SMTP: Mailpit sin credenciales en local y proveedor real con autenticación y TLS', () => {
  const local = smtpTransportOptions(loadConfig({}));
  assert.equal(local.host, 'mailpit');
  assert.equal(local.port, 1025);
  assert.equal(local.secure, false);
  assert.equal(local.auth, undefined);

  const starttls = smtpTransportOptions(loadConfig({ SMTP_HOST: 'smtp.example', SMTP_PORT: '587', SMTP_USER: 'usuario', SMTP_PASSWORD: 'secreto-de-prueba' }));
  assert.deepEqual(starttls.auth, { user: 'usuario', pass: 'secreto-de-prueba' });
  assert.equal(starttls.secure, false);
  assert.equal(starttls.requireTLS, true, 'no envía credenciales sin cifrar');

  const implicit = smtpTransportOptions(loadConfig({ SMTP_HOST: 'smtp.example', SMTP_PORT: '465', SMTP_USER: 'usuario', SMTP_PASSWORD: 'secreto-de-prueba' }));
  assert.equal(implicit.secure, true);

  assert.throws(() => loadConfig({ SMTP_USER: 'usuario' }), error => /SMTP_USER y SMTP_PASSWORD/.test(error.message));
  assert.throws(() => loadConfig({ SMTP_PASSWORD: 'secreto-de-prueba' }), error => !error.message.includes('secreto-de-prueba'));
});

test('tokens: 43 caracteres base64url, hash SHA-256 hexadecimal y emails normalizados', () => {
  const token = newToken();
  assert.match(token, TOKEN_PATTERN);
  assert.notEqual(newToken(), token);
  assert.match(hashToken(token), /^[0-9a-f]{64}$/);
  assert.equal(normalizeEmail('  Dueno@Example.Invalid '), 'dueno@example.invalid');
});

test('origen: rechaza cambios desde otro sitio y exige Origin si hay cookie de sesión', () => {
  const middleware = new OriginMiddleware(loadConfig({ APP_URL: 'http://localhost:5173' }));
  const run = (method, headers = {}, cookies = {}) => {
    let passed = false;
    middleware.use({ method, headers, cookies }, {}, () => { passed = true; });
    return passed;
  };
  assert.equal(run('GET', { origin: 'https://otro.example' }), true);
  assert.equal(run('POST', { origin: 'http://localhost:5173' }, { taller_sesion: 'x' }), true);
  assert.equal(run('POST', {}), true, 'clientes sin navegador ni sesión');
  assert.throws(() => run('POST', { origin: 'https://otro.example' }), error => error.getStatus() === 403);
  assert.throws(() => run('DELETE', {}, { taller_sesion: 'x' }), error => error.getStatus() === 403);
});

test('contraseñas: Argon2id con parámetros OWASP y verificación', async () => {
  const passwords = new PasswordService();
  const hash = await passwords.hash('una contraseña larga');
  assert.match(hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.equal(await passwords.verify('una contraseña larga', hash), true);
  assert.equal(await passwords.verify('otra contraseña larga', hash), false);
  assert.equal(await passwords.verify('x', 'no-es-un-hash'), false);
  assert.equal(await passwords.verifyDummy('cualquiera'), false);
});
