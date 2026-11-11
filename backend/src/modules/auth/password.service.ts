import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

// Parámetros mínimos recomendados por OWASP para Argon2id.
const PARAMS = { parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 } as const;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

@Injectable()
export class PasswordService {
  private dummy?: Promise<string>;

  hash(password: string) {
    return argon2id({ ...PARAMS, password, salt: randomBytes(16), outputType: 'encoded' });
  }

  async verify(password: string, hash: string) {
    try { return await argon2Verify({ password, hash }); } catch { return false; }
  }

  /** Iguala el tiempo de respuesta cuando el email no existe. */
  async verifyDummy(password: string) {
    this.dummy ??= this.hash(randomBytes(24).toString('hex'));
    await this.verify(password, await this.dummy);
    return false;
  }
}
