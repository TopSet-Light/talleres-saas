import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { MailModule } from '../../mail/mail.module';
import { AccessGuard } from './access.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginAttemptsService } from './login-attempts.service';
import { GoogleAuthService } from './google-auth.service';
import { GoogleOidcService } from './google-oidc.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  imports: [DatabaseModule, MailModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService, GoogleAuthService, GoogleOidcService, SessionService, PasswordService, LoginAttemptsService, AccessGuard],
  // Otros módulos protegen sus rutas con AccessGuard y reutilizan sesiones y contraseñas.
  exports: [SessionService, PasswordService, AccessGuard],
})
export class AuthModule {}
