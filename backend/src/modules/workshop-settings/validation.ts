/** Dígito verificador del CUIT/CUIL argentino (módulo 11). */
export function isValidCuit(value: string) {
  if (!/^\d{11}$/.test(value)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(value[index]), 0);
  const remainder = 11 - (sum % 11);
  const check = remainder === 11 ? 0 : remainder;
  return check !== 10 && check === Number(value[10]);
}

export type LogoFormat = { contentType: 'image/png' | 'image/jpeg' | 'image/webp'; extension: 'png' | 'jpg' | 'webp' };

/**
 * Formato por el contenido (firma del archivo), no por el nombre ni el tipo que declara el
 * navegador. SVG no se acepta: puede contener scripts.
 */
export function detectLogoFormat(content: Buffer): LogoFormat | null {
  if (content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (content.length >= 12 && content.toString('ascii', 0, 4) === 'RIFF' && content.toString('ascii', 8, 12) === 'WEBP') {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  return null;
}
