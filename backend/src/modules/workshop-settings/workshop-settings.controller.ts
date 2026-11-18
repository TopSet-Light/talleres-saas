import {
  ArgumentsHost, Body, Catch, Controller, Delete, ExceptionFilter, Get, Header, HttpCode, HttpException, Put, Res,
  UploadedFile, UseFilters, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Access, CurrentAccess, RequirePermission } from '../auth/access';
import { AccessGuard } from '../auth/access.guard';
import { UpdateWorkshopSettingsDto } from './dto';
import { LOGO_MAX_BYTES, WorkshopSettingsService } from './workshop-settings.service';

/** Multer responde 413 en inglés cuando el archivo supera el límite: se traduce al formato de la API. */
@Catch(HttpException)
class LogoUploadFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception.getStatus() === 413) {
      response.status(413).json({
        statusCode: 413, code: 'FILE_TOO_LARGE', message: 'El logo puede pesar hasta 2 MB.', fields: { logo: 'Elegí un PNG, JPEG o WebP de hasta 2 MB.' },
      });
      return;
    }
    response.status(exception.getStatus()).json(exception.getResponse());
  }
}

@Controller('workshop-settings')
@UseGuards(AccessGuard)
export class WorkshopSettingsController {
  constructor(private readonly settings: WorkshopSettingsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermission('settings.read')
  get(@CurrentAccess() access: Access) {
    return this.settings.get(access);
  }

  @Put()
  @Header('Cache-Control', 'no-store')
  @RequirePermission('settings.manage')
  update(@CurrentAccess() access: Access, @Body() dto: UpdateWorkshopSettingsDto) {
    return this.settings.update(access, dto);
  }

  // multipart/form-data con el campo «logo». Se procesa en memoria con límite de tamaño y un solo archivo.
  @Put('logo')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('settings.manage')
  @UseFilters(LogoUploadFilter)
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: LOGO_MAX_BYTES, files: 1, fields: 0 } }))
  replaceLogo(@CurrentAccess() access: Access, @UploadedFile() file?: Express.Multer.File) {
    return this.settings.replaceLogo(access, file?.buffer);
  }

  @Delete('logo')
  @HttpCode(204)
  @RequirePermission('settings.manage')
  async deleteLogo(@CurrentAccess() access: Access) {
    await this.settings.deleteLogo(access);
  }

  // Sin permiso específico: cualquier integrante activo del taller de la sesión.
  @Get('logo')
  async readLogo(@CurrentAccess() access: Access, @Res() res: Response) {
    const logo = await this.settings.readLogo(access);
    res.set({
      'Content-Type': logo.contentType,
      'Content-Length': String(logo.content.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Content-Disposition': 'inline',
    });
    res.end(logo.content);
  }
}
