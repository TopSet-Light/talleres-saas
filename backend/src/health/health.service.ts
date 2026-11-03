import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class HealthService {
  private pending?: Promise<unknown>;
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Compartir la consulta en curso evita acumular consultas si la red se cuelga.
      if (!this.pending) {
        this.pending = this.prisma.$queryRaw`SELECT 1`.finally(() => { this.pending = undefined; });
      }
      await Promise.race([
        this.pending,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 3000); }),
      ]);
      return { status: 'ok', database: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', database: 'unavailable' });
    } finally { if (timer) clearTimeout(timer); }
  }
}
