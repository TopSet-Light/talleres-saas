import type { Role } from '@prisma/client';

/**
 * Matriz de permisos de docs/decisiones/0001-acceso.md. Los roles no son
 * editables por el usuario: cambiar la matriz es un cambio de código revisado.
 * TS-19 aplica los permisos de empleados; los demás quedan definidos para los
 * módulos de negocio que los usen.
 */
export const PERMISSIONS = {
  'employees.read': ['OWNER'],
  'employees.invite': ['OWNER'],
  'employees.changeRole': ['OWNER'],
  'employees.deactivate': ['OWNER'],
  // AUTH-07 / CFG: datos comerciales, logo y numeración.
  'settings.read': ['OWNER'],
  'settings.manage': ['OWNER'],
  'customers.read': ['OWNER', 'RECEPTION', 'MECHANIC'],
  'customers.write': ['OWNER', 'RECEPTION'],
  'workOrders.open': ['OWNER', 'RECEPTION'],
  'workOrders.diagnose': ['OWNER', 'RECEPTION', 'MECHANIC'],
  'inventory.consume': ['OWNER', 'RECEPTION', 'MECHANIC'],
  'pricing.manage': ['OWNER', 'RECEPTION'],
  'estimates.manage': ['OWNER', 'RECEPTION'],
  'payments.register': ['OWNER', 'RECEPTION'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission) {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter(permission => hasPermission(role, permission));
}
