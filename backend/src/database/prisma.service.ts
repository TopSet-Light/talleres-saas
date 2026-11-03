import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  // Conexión perezosa: la API también arranca si la base no está disponible.
  async onModuleDestroy() { await this.$disconnect(); }
}
