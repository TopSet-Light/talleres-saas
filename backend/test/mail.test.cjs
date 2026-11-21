const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:net');
const { loadConfig } = require('../dist/config/app-config');
const { MailService, RESEND_TIMEOUT_MS } = require('../dist/mail/mail.service');

const resendEnv = {
  MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_secreto_ficticio',
  MAIL_FROM: 'TopSet <no-responder@notificaciones.example.com>', APP_URL: 'https://taller.example.com',
};
const message = {
  to: 'persona@example.invalid', subject: 'Invitación a Taller Ficticio',
  text: 'Abrí https://taller.example.com/invitacion#token=token-ficticio',
};

test('correo: Mailpit por defecto, selección explícita y configuración segura de Resend', () => {
  assert.equal(loadConfig({}).mailTransport, 'smtp');
  // Una clave presente no activa envíos reales accidentalmente.
  assert.equal(loadConfig({ RESEND_API_KEY: resendEnv.RESEND_API_KEY }).mailTransport, 'smtp');
  assert.throws(() => loadConfig({ MAIL_TRANSPORT: 'otro' }), /MAIL_TRANSPORT/);
  for (const name of ['RESEND_API_KEY', 'MAIL_FROM', 'APP_URL']) {
    assert.throws(() => loadConfig({ ...resendEnv, [name]: '' }), error =>
      error.message.includes(name) && !error.message.includes(resendEnv.RESEND_API_KEY));
  }
  for (const sender of ['inválido', 'TopSet <mal>', 'a@example.com\r\nBcc: b@example.com']) {
    assert.throws(() => loadConfig({ ...resendEnv, MAIL_FROM: sender }), /MAIL_FROM/);
  }
  assert.equal(loadConfig(resendEnv).resendApiKey, resendEnv.RESEND_API_KEY);
  assert.equal(loadConfig({ ...resendEnv, MAIL_FROM: 'envios@example.com' }).mailFrom, 'envios@example.com');
  // En local se permiten enlaces locales para probar con una casilla controlada.
  assert.equal(loadConfig({ ...resendEnv, APP_URL: 'http://localhost:5173' }).cookieSecure, false);
});

test('producción: rechaza enlaces HTTP, cookies inseguras y SMTP local/incompleto', () => {
  const production = { ...resendEnv, NODE_ENV: 'production' };
  assert.equal(loadConfig(production).cookieSecure, true);
  assert.throws(() => loadConfig({ ...production, APP_URL: 'http://taller.example.com' }), /HTTPS/);
  assert.throws(() => loadConfig({ ...production, COOKIE_SECURE: 'false' }), /COOKIE_SECURE/);
  assert.throws(() => loadConfig({ ...production, MAIL_TRANSPORT: 'smtp' }), /SMTP/);
  const smtp = { ...production, MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.resend.com', SMTP_PORT: '465', SMTP_USER: 'resend', SMTP_PASSWORD: 'clave-ficticia' };
  assert.equal(loadConfig(smtp).smtpSecure, true);
  assert.throws(() => loadConfig({ ...smtp, SMTP_HOST: 'mailpit' }), /proveedor real/);
});

test('Resend: envía el contrato HTTPS, conserva los enlaces y acota el tiempo de espera', async t => {
  const timeout = t.mock.method(AbortSignal, 'timeout');
  const request = t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'email-ficticio' }));
  const mail = new MailService(loadConfig(resendEnv));
  assert.equal(await mail.send(message), true);
  assert.equal(request.mock.callCount(), 1);
  const [url, options] = request.mock.calls[0].arguments;
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, `Bearer ${resendEnv.RESEND_API_KEY}`);
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(options.body), { from: resendEnv.MAIL_FROM, to: [message.to], subject: message.subject, text: message.text });
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(timeout.mock.calls[0].arguments[0], RESEND_TIMEOUT_MS);
});

test('Resend: rechazos, límites, fallas de red, timeout y respuestas inválidas devuelven false sin filtrar datos', async t => {
  const mail = new MailService(loadConfig(resendEnv));
  const warnings = t.mock.method(mail.logger, 'warn', () => {});
  const request = t.mock.method(globalThis, 'fetch');
  const cases = [
    ...[401, 403, 422, 429, 500].map(status => async () => Response.json({ message: message.text }, { status })),
    async () => { throw new Error(`${resendEnv.RESEND_API_KEY} ${message.to} ${message.text}`); },
    async () => { throw new DOMException('timeout', 'TimeoutError'); },
    async () => Response.json({ error: message.text }),
    async () => Response.json({ id: '' }),
    async () => new Response('respuesta no JSON'),
  ];
  for (const response of cases) {
    request.mock.mockImplementation(response);
    assert.equal(await mail.send(message), false);
  }
  assert.equal(request.mock.callCount(), cases.length, 'no reintenta ni cambia a SMTP ante una falla');
  assert.equal(warnings.mock.callCount(), cases.length);
  for (const call of warnings.mock.calls) {
    assert.deepEqual(call.arguments, ['No se pudo enviar el email transaccional.']);
  }
});

test('SMTP: el transporte local sigue entregando el mensaje y reporta rechazos', async t => {
  let reject = false;
  let received = '';
  const sockets = new Set();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('220 localhost SMTP\r\n');
    let buffer = '';
    let data = false;
    socket.on('data', chunk => {
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data && line !== '.') { received += `${line}\r\n`; continue; }
        if (data) { data = false; socket.write(reject ? '550 rechazado\r\n' : '250 aceptado\r\n'); }
        else if (line.startsWith('EHLO')) socket.write('250 localhost\r\n');
        else if (line === 'DATA') { data = true; socket.write('354 enviar contenido\r\n'); }
        else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const mail = new MailService(loadConfig({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.address().port) }));
  t.mock.method(mail.logger, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', () => { throw new Error('SMTP no debe llamar a Resend'); });
  assert.equal(await mail.send({ ...message, text: 'Mensaje SMTP ficticio' }), true);
  assert.match(received, /Mensaje SMTP ficticio/);
  assert.match(received, /To: persona@example.invalid/);
  reject = true;
  assert.equal(await mail.send(message), false);
});
