const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isValidCuit, detectLogoFormat } = require('../dist/modules/workshop-settings/validation');
const { formatDocumentNumber } = require('../dist/modules/workshop-settings/numbering.service');
const { FileStorageService } = require('../dist/modules/files/file-storage.service');
const { loadConfig } = require('../dist/config/app-config');

test('CUIT: valida el dígito verificador', () => {
  assert.equal(isValidCuit('20123456786'), true);
  assert.equal(isValidCuit('20123456785'), false, 'dígito verificador incorrecto');
  assert.equal(isValidCuit('2012345678'), false, 'menos de 11 dígitos');
  assert.equal(isValidCuit('20-12345678-6'), false, 'la API guarda solo dígitos');
});

test('logo: el formato se detecta por la firma del archivo y SVG se rechaza', () => {
  assert.equal(detectLogoFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])).contentType, 'image/png');
  assert.equal(detectLogoFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).contentType, 'image/jpeg');
  assert.equal(detectLogoFormat(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'ascii')).contentType, 'image/webp');
  assert.equal(detectLogoFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')), null);
  assert.equal(detectLogoFormat(Buffer.from('no es una imagen')), null);
});

test('numeración: prefijo y al menos cuatro dígitos', () => {
  assert.equal(formatDocumentNumber('OT-', 42), 'OT-0042');
  assert.equal(formatDocumentNumber('PRE-', 12345), 'PRE-12345');
  assert.equal(formatDocumentNumber('', 7), '0007');
});

test('almacenamiento: guarda, lee y borra dentro de su carpeta y rechaza rutas maliciosas', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'talleres-files-'));
  try {
    const storage = new FileStorageService(loadConfig({ FILES_DIR: dir }));
    await storage.save('workshops/abc/logo-1.png', Buffer.from('contenido'));
    assert.equal((await storage.read('workshops/abc/logo-1.png')).toString(), 'contenido');
    await storage.remove('workshops/abc/logo-1.png');
    assert.equal(existsSync(path.join(dir, 'workshops/abc/logo-1.png')), false);
    for (const key of ['../fuera.png', 'workshops/../../fuera.png', '/etc/passwd.png', 'workshops\\x.png', 'logo.svg', 'logo.PNG']) {
      await assert.rejects(storage.save(key, Buffer.from('x')), /Clave de archivo inválida/, key);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
