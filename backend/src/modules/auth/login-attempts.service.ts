import { Injectable } from '@nestjs/common';

export const MAX_FAILED_LOGINS = 5;
export const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED = 10_000;

/**
 * Intentos fallidos por email. El MVP corre en una sola instancia, por eso el
 * contador vive en memoria y se reinicia con la API (decisión 0001-acceso).
 */
@Injectable()
export class LoginAttemptsService {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  isBlocked(email: string, now = Date.now()) {
    const entry = this.failures.get(email);
    if (!entry) return false;
    if (entry.resetAt <= now) { this.failures.delete(email); return false; }
    return entry.count >= MAX_FAILED_LOGINS;
  }

  recordFailure(email: string, now = Date.now()) {
    if (this.failures.size >= MAX_TRACKED) this.prune(now);
    const entry = this.failures.get(email);
    if (!entry || entry.resetAt <= now) this.failures.set(email, { count: 1, resetAt: now + FAILED_LOGIN_WINDOW_MS });
    else entry.count++;
  }

  reset(email: string) { this.failures.delete(email); }

  private prune(now: number) {
    for (const [email, entry] of this.failures) if (entry.resetAt <= now) this.failures.delete(email);
    // Si todos siguen vigentes, descartar los más antiguos para acotar memoria.
    for (const email of this.failures.keys()) {
      if (this.failures.size < MAX_TRACKED) break;
      this.failures.delete(email);
    }
  }
}
