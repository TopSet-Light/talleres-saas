// Datos exclusivamente ficticios. No habilitan login ni contienen credenciales.
const ids = {
  workshopA: '07000000-0000-4000-8000-000000000001',
  workshopB: '07000000-0000-4000-8000-000000000002',
  ownerA: '07000000-0000-4000-8000-000000000011',
  receptionA: '07000000-0000-4000-8000-000000000012',
  mechanicA: '07000000-0000-4000-8000-000000000013',
  ownerB: '07000000-0000-4000-8000-000000000014',
  customerA: '07000000-0000-4000-8000-000000000021',
  customerB: '07000000-0000-4000-8000-000000000022',
  vehicleA: '07000000-0000-4000-8000-000000000031',
  vehicleB: '07000000-0000-4000-8000-000000000032',
};

async function seedDemo(prisma) {
  await prisma.$transaction(async tx => {
    // Repetible y no destructivo: no restablece registros existentes.
    for (const [id, name] of [[ids.workshopA, 'Taller ficticio A'], [ids.workshopB, 'Taller ficticio B']]) {
      await tx.workshop.upsert({ where: { id }, update: {}, create: { id, name } });
    }
    const accounts = [
      [ids.ownerA, ids.workshopA, 'OWNER', 'dueno-a@example.invalid'],
      [ids.receptionA, ids.workshopA, 'RECEPTION', 'recepcion-a@example.invalid'],
      [ids.mechanicA, ids.workshopA, 'MECHANIC', 'mecanico-a@example.invalid'],
      [ids.ownerB, ids.workshopB, 'OWNER', 'dueno-b@example.invalid'],
    ];
    for (const [id, workshopId, role, email] of accounts) {
      await tx.user.upsert({ where: { id }, update: {}, create: { id, email, name: `Usuario ficticio ${role}` } });
      await tx.membership.upsert({ where: { userId: id }, update: {}, create: { userId: id, workshopId, role } });
    }
    for (const [id, workshopId] of [[ids.customerA, ids.workshopA], [ids.customerB, ids.workshopB]]) {
      await tx.customer.upsert({ where: { id }, update: {}, create: { id, workshopId, phone: 'CONTACTO-FICTICIO', name: 'Cliente de demostración' } });
    }
    for (const [id, workshopId, customerId] of [
      [ids.vehicleA, ids.workshopA, ids.customerA], [ids.vehicleB, ids.workshopB, ids.customerB],
    ]) {
      await tx.vehicle.upsert({ where: { id }, update: {}, create: { id, workshopId, customerId, plate: 'DEMO070' } });
    }
  });
}
module.exports = { ids, seedDemo };
