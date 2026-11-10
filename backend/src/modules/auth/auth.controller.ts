import { Body, Controller, Get, Header, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { SESSION_COOKIE, sessionCookieOptions } from '../../common/session-cookie';
import { Access, CurrentAccess } from './access';
import { AccessGuard } from './access.guard';
import { AuthService, toMe } from './auth.service';
import { CompleteRegistrationDto, LoginDto, RegisterDto, TokenDto } from './dto';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
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
  me(@CurrentAccess() access: Access) {
    return toMe(access);
  }
}
