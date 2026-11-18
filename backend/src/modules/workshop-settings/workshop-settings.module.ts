import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { NumberingService } from './numbering.service';
import { WorkshopSettingsController } from './workshop-settings.controller';
import { WorkshopSettingsService } from './workshop-settings.service';

@Module({
  imports: [DatabaseModule, AuthModule, FilesModule],
  controllers: [WorkshopSettingsController],
  providers: [WorkshopSettingsService, NumberingService],
  // Los futuros módulos de órdenes y presupuestos asignan números con NumberingService.
  exports: [NumberingService],
})
export class WorkshopSettingsModule {}
