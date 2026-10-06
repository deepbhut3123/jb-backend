export const PERMISSION_MODULES = [
  { key: 'dashboard', label: 'Dashboard', actions: ['menu', 'view'] },
  { key: 'leads', label: 'Leads', actions: ['menu', 'view', 'viewAll', 'create', 'edit', 'delete'] },
  { key: 'quotations', label: 'Quotations', actions: ['menu', 'view', 'viewAll', 'create', 'edit', 'delete'] },
  { key: 'products', label: 'Products', actions: ['menu', 'view', 'create', 'edit', 'delete'] },
  { key: 'categories', label: 'Categories', actions: ['menu', 'view', 'create', 'edit', 'delete'] },
  { key: 'customers', label: 'Customers', actions: ['menu', 'view', 'viewAll', 'create', 'edit', 'delete'] },
  { key: 'users', label: 'User management', actions: ['menu', 'view', 'create', 'edit', 'delete'] },
  { key: 'settings', label: 'Pricing settings', actions: ['menu', 'view', 'edit'] },
  { key: 'whatsapp', label: 'WhatsApp', actions: ['menu', 'view', 'edit'] },
];

export const ALL_PERMISSIONS = PERMISSION_MODULES.flatMap(({ key, actions }) => actions.map((action) => `${key}.${action}`));

export const DEFAULT_USER_PERMISSIONS = [
  'dashboard.menu', 'dashboard.view',
  'leads.menu', 'leads.view', 'leads.create', 'leads.edit', 'leads.delete',
  'quotations.menu', 'quotations.view', 'quotations.create', 'quotations.edit', 'quotations.delete',
  'customers.menu', 'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
];

export const isAdministrator = (user) => [1, 3].includes(Number(user?.role));

export function sanitizePermissions(permissions) {
  const selected = [...new Set(Array.isArray(permissions) ? permissions : [])].filter((permission) => ALL_PERMISSIONS.includes(permission));
  return selected.filter((permission) => permission.endsWith('.view') || selected.includes(`${permission.split('.')[0]}.view`));
}

export function withLegacyMenuPermissions(permissions) {
  const selected = [...new Set(permissions || [])];
  if (selected.some((permission) => permission.endsWith('.menu'))) return selected;
  return [...selected, ...selected.filter((permission) => permission.endsWith('.view')).map((permission) => permission.replace(/\.view$/, '.menu'))];
}

export function effectivePermissions(user) {
  if (isAdministrator(user)) return [...ALL_PERMISSIONS];
  if (user?.roleProfile && user.roleProfile.isActive === false) return [];
  if (user?.roleProfile?.permissions) return withLegacyMenuPermissions(user.roleProfile.permissions.filter((permission) => ALL_PERMISSIONS.includes(permission)));
  return [...DEFAULT_USER_PERMISSIONS];
}
