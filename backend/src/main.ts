import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule));
  app.enableShutdownHooks();
  await app.listen(3000, '0.0.0.0');
}
void bootstrap();
