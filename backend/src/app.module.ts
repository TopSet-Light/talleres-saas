import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { OriginMiddleware } from './common/origin.middleware';
import { createValidationPipe } from './common/validation';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { AuthController } from './modules/auth/auth.controller';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeesController } from './modules/users/employees.controller';
import { InvitationsController } from './modules/users/invitations.controller';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule,
    // Se aplica solo en las rutas públicas de acceso mediante ThrottlerGuard.
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: 60_000, limit: config.authRateLimit }],
        errorMessage: 'Demasiados intentos. Esperá un minuto y volvé a intentar.',
      }),
    }),
    HealthModule,
    AuthModule,
    UsersModule,
  ],
  providers: [{ provide: APP_PIPE, useFactory: createValidationPipe }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cookieParser(), OriginMiddleware).forRoutes(AuthController, EmployeesController, InvitationsController);
  }
}
