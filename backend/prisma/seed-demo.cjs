const { PrismaClient } = require('@prisma/client');
const { seedDemo } = require('./demo-data.cjs');

async function main() {
  if (!process.argv.includes('--demo')) throw new Error('Carga de demostración no solicitada');
  const prisma = new PrismaClient({ log: [] });
  try {
    await seedDemo(prisma);
    console.log('Datos ficticios de dos talleres disponibles. No se crearon credenciales de acceso.');
  } finally { await prisma.$disconnect(); }
}
main().catch(() => {
  console.error('No se pudo cargar la demostración. Revisar conexión, migraciones y posibles conflictos.');
  process.exitCode = 1;
});
