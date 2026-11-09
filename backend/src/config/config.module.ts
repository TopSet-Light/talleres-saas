import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from './app-config';

// La configuración se valida una vez al iniciar la API.
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
