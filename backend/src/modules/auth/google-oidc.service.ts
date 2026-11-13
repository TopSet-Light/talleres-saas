import { Inject, Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { APP_CONFIG, AppConfig } from '../../config/app-config';

export interface GoogleProfile { subject: string; email: string; emailVerified: boolean; nonce?: string }

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Comunicación con Google (OpenID Connect). Aislada en este servicio para que las pruebas
 * reemplacen solo el intercambio de red; la lógica de vinculación y sesión vive en
 * GoogleAuthService.
 */
@Injectable()
export class GoogleOidcService {
  private verifier?: OAuth2Client;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  isEnabled() {
    return Boolean(this.config.googleClientId && this.config.googleClientSecret);
  }

  redirectUri() {
    return `${this.config.appUrl}/api/auth/google/callback`;
  }

  /** Pide solo identidad y email. PKCE (S256), state y nonce son obligatorios. */
  authorizationUrl(params: { state: string; nonce: string; codeChallenge: string }) {
    const query = new URLSearchParams({
      client_id: this.config.googleClientId!,
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'openid email',
      state: params.state,
      nonce: params.nonce,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `${AUTHORIZATION_ENDPOINT}?${query}`;
  }

  /**
   * Cambia el código por tokens y verifica el ID token: firma de Google, audiencia (nuestro
   * client_id), emisor y vencimiento. El nonce se compara en GoogleAuthService.
   */
  async exchange(params: { code: string; codeVerifier: string }): Promise<GoogleProfile> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: params.code,
        client_id: this.config.googleClientId!,
        client_secret: this.config.googleClientSecret!,
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
        code_verifier: params.codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Google rechazó el código de autorización');
    const { id_token: idToken } = await response.json() as { id_token?: string };
    if (!idToken) throw new Error('Google no devolvió un ID token');
    this.verifier ??= new OAuth2Client({ clientId: this.config.googleClientId });
    const ticket = await this.verifier.verifyIdToken({ idToken, audience: this.config.googleClientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new Error('ID token sin identidad');
    return { subject: payload.sub, email: payload.email, emailVerified: payload.email_verified === true, nonce: payload.nonce };
  }
}
