import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Logger, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { SESSION_COOKIE, sessionCookieOptions } from '../../common/session-cookie';
import { Access, CurrentAccess } from './access';
import { AccessGuard } from './access.guard';
import { AuthService, toMe } from './auth.service';
import { CompleteRegistrationDto, EmailField, LoginDto, RegisterDto, ResetPasswordDto, TokenDto } from './dto';
import { PasswordResetService } from './password-reset.service';
import { GoogleAuthService, GoogleLoginError, GOOGLE_ATTEMPT_TTL_MS } from './google-auth.service';

import { SessionService } from './session.service';

const GOOGLE_STATE_COOKIE = 'taller_google_state';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly googleAuth: GoogleAuthService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly passwordReset: PasswordResetService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('register')
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  async register(@Body() dto: RegisterDto) {
    await this.auth.register(dto);
    return { message: 'Si el email puede registrarse, te enviamos un enlace para elegir tu contraseña y terminar el registro.' };
  }

  @Post('registration/preview')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  previewRegistration(@Body() dto: TokenDto) {
    return this.auth.previewRegistration(dto.token);
  }

  @Post('registration/complete')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  async completeRegistration(@Body() dto: CompleteRegistrationDto) {
    await this.auth.completeRegistration(dto);
    return { message: 'Registro completo. Ya podés iniciar sesión.' };
  }

  // AUTH-05. Misma respuesta para emails registrados y desconocidos.
  @Post('password/forgot')
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  async forgotPassword(@Body() dto: EmailField) {
    await this.passwordReset.request(dto.email);
    return { message: 'Si el email tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva.' };
  }

  @Post('password/reset/preview')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  previewPasswordReset(@Body() dto: TokenDto) {
    return this.passwordReset.preview(dto.token);
  }

  @Post('password/reset')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordReset.reset(dto.token, dto.password);
    return { message: 'Contraseña actualizada. Se cerraron tus sesiones abiertas: iniciá sesión de nuevo.' };
  }

  /** Opciones públicas para la pantalla de ingreso. */
  @Get('options')
  options() {
    return { google: this.googleAuth.isEnabled() };
  }

  // Ingreso con Google: navegación completa del navegador (no fetch). El state queda atado a
  // este navegador por una cookie httpOnly que solo viaja a las rutas de Google.
  @Get('google/start')
  @UseGuards(ThrottlerGuard)
  async googleStart(@Res() res: Response) {
    this.redirectToGoogle(res, await this.googleAuth.start());
  }

  // Vincular Google exige una sesión iniciada con contraseña (revisión de TS-20).
  @Get('google/link/start')
  @UseGuards(AccessGuard, ThrottlerGuard)
  async googleLinkStart(@CurrentAccess() access: Access, @Res() res: Response) {
    this.redirectToGoogle(res, await this.googleAuth.start(new Date(), access.userId));
  }

  @Delete('google/link')
  @HttpCode(204)
  @UseGuards(AccessGuard)
  async googleUnlink(@CurrentAccess() access: Access) {
    await this.googleAuth.unlink(access.userId);
  }

  private redirectToGoogle(res: Response, { state, url }: { state: string; url: string }) {
    res.cookie(GOOGLE_STATE_COOKIE, state, {
      httpOnly: true, sameSite: 'lax', secure: this.config.cookieSecure, path: '/api/auth/google', maxAge: GOOGLE_ATTEMPT_TTL_MS,
    });
    res.redirect(302, url);
  }

  @Get('google/callback')
  @UseGuards(ThrottlerGuard)
  async googleCallback(@Query() query: Record<string, unknown>, @Req() req: Request, @Res() res: Response) {
    res.clearCookie(GOOGLE_STATE_COOKIE, { httpOnly: true, sameSite: 'lax', secure: this.config.cookieSecure, path: '/api/auth/google' });
    res.set('Cache-Control', 'no-store');
    try {
      const result = await this.googleAuth.callback(query, req.cookies?.[GOOGLE_STATE_COOKIE], req.cookies?.[SESSION_COOKIE]);
      if (result.mode === 'link') {
        res.redirect(302, `${this.config.appUrl}/?google=linked`);
        return;
      }
      res.cookie(SESSION_COOKIE, result.session.token, sessionCookieOptions(this.config, result.session.expiresAt));
      res.redirect(302, `${this.config.appUrl}/`);
    } catch (error) {
      if (!(error instanceof GoogleLoginError)) this.logger.warn('Falló un ingreso con Google.');
      const reason = error instanceof GoogleLoginError ? error.reason : 'error';
      const path = error instanceof GoogleLoginError && error.destination === 'home' ? '/' : '/login';
      res.redirect(302, `${this.config.appUrl}${path}?google=${reason}`);
    }
  }

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, expiresAt, me } = await this.auth.login(dto);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(this.config, expiresAt));
    return me;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(this.config));
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AccessGuard)
  async me(@CurrentAccess() access: Access) {
    return { ...toMe(access), googleLinked: await this.googleAuth.isLinked(access.userId) };
  }
}
