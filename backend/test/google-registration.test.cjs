const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  GoogleAuthService,
  GOOGLE_REGISTRATION_TTL_MS,
} = require('../dist/modules/auth/google-auth.service');
const { hashToken } = require('../dist/common/tokens');

test('registro con Google usa el instante recibido por el callback para creación y vencimiento', async () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const state = 's'.repeat(43);
  let saved;
  const prisma = {
    googleLoginAttempt: {
      findUnique: async () => ({
        id: 'intento',
        registration: true,
        nonce: 'nonce',
        codeVerifier: 'verificador',
      }),
      updateMany: async () => ({ count: 1 }),
    },
    googleIdentity: { findUnique: async () => null },
    user: { findUnique: async () => null },
    googleRegistration: {
      create: async ({ data }) => {
        saved = data;
      },
    },
  };
  const google = {
    exchange: async () => ({
      nonce: 'nonce',
      subject: 'sub-ficticio',
      email: ' Duena@Gmail.com ',
      emailVerified: true,
    }),
  };
  const result = await new GoogleAuthService(prisma, google, {}).callback(
    { state, code: 'codigo' },
    state,
    undefined,
    now,
  );
  assert.equal(result.mode, 'register');
  assert.equal(saved.tokenHash, hashToken(result.token));
  assert.equal(saved.email, 'duena@gmail.com');
  assert.deepEqual(saved.createdAt, now);
  assert.equal(
    saved.expiresAt.getTime(),
    now.getTime() + GOOGLE_REGISTRATION_TTL_MS,
  );
});
