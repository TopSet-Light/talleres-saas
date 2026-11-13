import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { DocumentKind, DocumentNumbering, WorkshopSettings } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { Access } from '../auth/access';
import { FileStorageService } from '../files/file-storage.service';
import { UpdateWorkshopSettingsDto } from './dto';
import { initializeWorkshopSettings } from './numbering.service';
import { detectLogoFormat } from './validation';

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const NO_LOGO = { statusCode: 404, code: 'NOT_FOUND', message: 'El taller no tiene logo.' };

function toResponse(name: string, settings: WorkshopSettings, numbering: DocumentNumbering[]) {
  const of = (kind: DocumentKind) => {
    const row = numbering.find(n => n.kind === kind)!;
    return { prefix: row.prefix, next: row.next };
  };
  return {
    workshopName: name,
    taxId: settings.taxId,
    address: settings.address,
    locality: settings.locality,
    contactPhone: settings.contactPhone,
    contactEmail: settings.contactEmail,
    documentFooter: settings.documentFooter,
    quoteValidityDays: settings.quoteValidityDays,
    defaultTerms: settings.defaultTerms,
    numbering: { workOrder: of('WORK_ORDER'), estimate: of('ESTIMATE') },
    // La ruta del archivo nunca sale de la API: solo metadatos y la URL autenticada.
    logo: settings.logoKey
      ? { contentType: settings.logoContentType, size: settings.logoSize, updatedAt: settings.logoUpdatedAt, url: '/api/workshop-settings/logo' }
      : null,
    updatedAt: settings.updatedAt,
  };
}

/**
 * AUTH-07 / CFG. Un solo módulo para datos comerciales, logo y numeración. El taller sale
 * siempre de la sesión: no hay ids de taller en las rutas ni en los cuerpos.
 */
@Injectable()
export class WorkshopSettingsService {
  private readonly logger = new Logger(WorkshopSettingsService.name);

  constructor(private readonly prisma: PrismaService, private readonly files: FileStorageService) {}

  async get(access: Access) {
    return this.prisma.$transaction(async tx => {
      // Defensa: un taller sin filas (por ejemplo, creado antes de la migración) las recibe acá.
      await initializeWorkshopSettings(tx, access.workshopId);
      const workshop = await tx.workshop.findUniqueOrThrow({
        where: { id: access.workshopId }, include: { settings: true, numbering: true },
      });
      return toResponse(workshop.name, workshop.settings!, workshop.numbering);
    });
  }

  async update(access: Access, dto: UpdateWorkshopSettingsDto) {
    return this.prisma.$transaction(async tx => {
      await initializeWorkshopSettings(tx, access.workshopId);
      // Bloquea la numeración del taller: compite con las altas que asignan números.
      const current = await tx.$queryRaw<{ tipo: DocumentKind; proximo: number }[]>`
        SELECT tipo, proximo FROM numeracion_taller WHERE taller_id = ${access.workshopId}::uuid FOR UPDATE`;
      const fields: Record<string, string> = {};
      for (const [kind, key] of [['WORK_ORDER', 'workOrder'], ['ESTIMATE', 'estimate']] as const) {
        const used = current.find(row => row.tipo === kind)!.proximo;
        // No se puede volver atrás: se repetirían números ya asignados.
        if (dto.numbering[key].next < used) fields[`numbering.${key}.next`] = `El próximo número no puede ser menor que ${used}.`;
      }
      if (Object.keys(fields).length) {
        throw new BadRequestException({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'Revisá los datos ingresados.', fields });
      }
      const workshop = await tx.workshop.update({ where: { id: access.workshopId }, data: { name: dto.workshopName } });
      const settings = await tx.workshopSettings.update({
        where: { workshopId: access.workshopId },
        data: {
          taxId: dto.taxId ?? null, address: dto.address ?? null, locality: dto.locality ?? null,
          contactPhone: dto.contactPhone ?? null, contactEmail: dto.contactEmail ?? null,
          documentFooter: dto.documentFooter ?? null, quoteValidityDays: dto.quoteValidityDays, defaultTerms: dto.defaultTerms ?? null,
        },
      });
      for (const [kind, key] of [['WORK_ORDER', 'workOrder'], ['ESTIMATE', 'estimate']] as const) {
        await tx.documentNumbering.update({
          where: { workshopId_kind: { workshopId: access.workshopId, kind } },
          data: { prefix: dto.numbering[key].prefix, next: dto.numbering[key].next },
        });
      }
      const numbering = await tx.documentNumbering.findMany({ where: { workshopId: access.workshopId } });
      return toResponse(workshop.name, settings, numbering);
    });
  }

  /** Reemplaza el logo. Se guarda primero el archivo nuevo y se borra el anterior solo si la base confirmó. */
  async replaceLogo(access: Access, content: Buffer | undefined) {
    if (!content || content.length === 0) {
      throw new BadRequestException({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'Elegí un archivo de logo.', fields: { logo: 'Elegí un archivo de logo.' } });
    }
    const format = detectLogoFormat(content);
    if (!format || content.length > LOGO_MAX_BYTES) {
      throw new BadRequestException({
        statusCode: 400, code: 'VALIDATION_ERROR', message: 'Revisá el logo.', fields: { logo: 'Elegí un PNG, JPEG o WebP de hasta 2 MB.' },
      });
    }
    const key = `workshops/${access.workshopId}/logo-${randomUUID()}.${format.extension}`;
    await this.files.save(key, content);
    let previous: string | null = null;
    try {
      await this.prisma.$transaction(async tx => {
        await initializeWorkshopSettings(tx, access.workshopId);
        previous = (await tx.workshopSettings.findUniqueOrThrow({ where: { workshopId: access.workshopId } })).logoKey;
        await tx.workshopSettings.update({
          where: { workshopId: access.workshopId },
          data: { logoKey: key, logoContentType: format.contentType, logoSize: content.length, logoUpdatedAt: new Date() },
        });
      });
    } catch (error) {
      await this.files.remove(key);
      throw error;
    }
    if (previous) await this.removeQuietly(previous);
    return this.get(access);
  }

  async deleteLogo(access: Access) {
    const settings = await this.prisma.workshopSettings.findUnique({ where: { workshopId: access.workshopId } });
    if (!settings?.logoKey) throw new NotFoundException(NO_LOGO);
    await this.prisma.workshopSettings.update({
      where: { workshopId: access.workshopId },
      data: { logoKey: null, logoContentType: null, logoSize: null, logoUpdatedAt: null },
    });
    await this.removeQuietly(settings.logoKey);
  }

  /** Cualquier integrante del taller puede ver el logo (se usa en documentos); nadie de otro taller. */
  async readLogo(access: Access) {
    const settings = await this.prisma.workshopSettings.findUnique({ where: { workshopId: access.workshopId } });
    if (!settings?.logoKey || !settings.logoContentType) throw new NotFoundException(NO_LOGO);
    try {
      return { content: await this.files.read(settings.logoKey), contentType: settings.logoContentType };
    } catch {
      this.logger.warn('No se encontró el archivo del logo registrado.');
      throw new NotFoundException(NO_LOGO);
    }
  }

  private async removeQuietly(key: string) {
    try { await this.files.remove(key); } catch { this.logger.warn('No se pudo borrar un logo reemplazado.'); }
  }
}
