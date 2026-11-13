import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { APP_CONFIG, AppConfig } from '../../config/app-config';

/** Claves generadas por la API: carpetas y nombres sin «..», barras invertidas ni rutas absolutas. */
const KEY_PATTERN = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.(png|jpg|webp)$/;

/**
 * Almacenamiento privado en disco (volumen Docker en local). Los archivos nunca se publican
 * como estáticos: cada módulo los entrega por la API después de validar sesión y taller.
 * Respaldar este directorio junto con la base de datos.
 */
@Injectable()
export class FileStorageService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private path(key: string) {
    if (!KEY_PATTERN.test(key)) throw new Error('Clave de archivo inválida');
    const root = resolve(this.config.filesDir);
    const full = resolve(root, key);
    if (!full.startsWith(root + sep)) throw new Error('Clave de archivo inválida');
    return full;
  }

  /** Escritura atómica: primero un temporal y después rename, para no dejar archivos a medias. */
  async save(key: string, content: Buffer) {
    const full = this.path(key);
    await mkdir(dirname(full), { recursive: true });
    const temporary = `${full}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, full);
  }

  read(key: string) {
    return readFile(this.path(key));
  }

  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }
}
