import { Injectable } from '@nestjs/common';
import type { DocumentKind, Prisma } from '@prisma/client';

export const DEFAULT_PREFIXES: Record<DocumentKind, string> = { WORK_ORDER: 'OT-', ESTIMATE: 'PRE-' };

/** Número visible: prefijo y al menos 4 dígitos, por ejemplo «OT-0042». */
export function formatDocumentNumber(prefix: string, value: number) {
  return `${prefix}${String(value).padStart(4, '0')}`;
}

/**
 * Correlativos por taller y tipo. Los módulos de órdenes y presupuestos lo usan dentro de la
 * misma transacción que crea el documento: el UPDATE incrementa y devuelve el valor en una
 * sola operación, así dos altas simultáneas nunca reciben el mismo número, y si la
 * transacción se revierte el número no se consume.
 */
@Injectable()
export class NumberingService {
  async allocate(tx: Prisma.TransactionClient, workshopId: string, kind: DocumentKind) {
    const updated = await tx.documentNumbering.update({
      where: { workshopId_kind: { workshopId, kind } },
      data: { next: { increment: 1 } },
    });
    const value = updated.next - 1;
    return { value, number: formatDocumentNumber(updated.prefix, value) };
  }
}

/**
 * Configuración y numeración iniciales de un taller, dentro de la transacción de su alta.
 * Es una función y no un servicio para que el módulo de acceso la use sin depender del
 * módulo de configuración (que a su vez usa la guardia de acceso). Es idempotente.
 */
export async function initializeWorkshopSettings(
  tx: Prisma.TransactionClient,
  workshopId: string,
  initial: { contactPhone?: string | null; locality?: string | null; address?: string | null } = {},
) {
  await tx.workshopSettings.upsert({
    where: { workshopId },
    create: { workshopId, contactPhone: initial.contactPhone ?? null, locality: initial.locality ?? null, address: initial.address ?? null },
    update: {},
  });
  await tx.documentNumbering.createMany({
    data: (Object.keys(DEFAULT_PREFIXES) as DocumentKind[]).map(kind => ({ workshopId, kind, prefix: DEFAULT_PREFIXES[kind] })),
    skipDuplicates: true,
  });
}
