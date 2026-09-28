// DEMO / MOCK: these records are view data only and are not persisted.
const users = [
  { name: 'Ana Morales', email: 'ana@example.test', role: 'ADMIN', agency: 'Oficina central', status: 'ACTIVO', lastAccess: 'Hoy, 08:45' },
  { name: 'Juan Perez', email: 'juan@example.test', role: 'ASISTENTE', agency: 'Solola', status: 'ACTIVO', lastAccess: 'Hoy, 08:30' },
  { name: 'Andrea Lopez', email: 'andrea@example.test', role: 'ASISTENTE', agency: 'Panajachel', status: 'ACTIVO', lastAccess: 'Ayer, 16:12' },
  { name: 'Maria Perez', email: 'maria@example.test', role: 'CONTABILIDAD', agency: 'Oficina central', status: 'ACTIVO', lastAccess: 'Hoy, 09:02' },
  { name: 'Carlos Lopez', email: 'carlos@example.test', role: 'ASISTENTE', agency: 'Solola', status: 'INACTIVO', lastAccess: '20/09/2026' },
  { name: 'Luisa Gomez', email: 'luisa@example.test', role: 'CONTABILIDAD', agency: 'Oficina central', status: 'ACTIVO', lastAccess: 'Ayer, 15:50' },
  { name: 'Pedro Mendez', email: 'pedro@example.test', role: 'ASISTENTE', agency: 'Santiago Atitlan', status: 'ACTIVO', lastAccess: '26/09/2026' },
];

const agencies = [
  { code: 'SOL', name: 'Solola', users: 3, status: 'ACTIVA' },
  { code: 'PAN', name: 'Panajachel', users: 2, status: 'ACTIVA' },
  { code: 'SAT', name: 'Santiago Atitlan', users: 1, status: 'ACTIVA' },
  { code: 'SCL', name: 'San Lucas Toliman', users: 0, status: 'INACTIVA' },
];

const roleLabels = {
  ADMIN: 'Administrador',
  ASISTENTE: 'Asistente de Agencia',
  CONTABILIDAD: 'Contabilidad',
};

function listUsers(req, res) {
  res.render('admin/users', {
    pageTitle: 'Administracion de usuarios',
    users,
    agencies: agencies.filter((agency) => agency.status === 'ACTIVA'),
    roleLabels,
    summary: {
      total: users.length,
      active: users.filter((user) => user.status === 'ACTIVO').length,
      inactive: users.filter((user) => user.status === 'INACTIVO').length,
      assistants: users.filter((user) => user.role === 'ASISTENTE').length,
    },
  });
}

function showNewUser(req, res) {
  res.render('admin/new-user', {
    pageTitle: 'Crear cuenta',
    agencies: agencies.filter((agency) => agency.status === 'ACTIVA'),
  });
}

function listAgencies(req, res) {
  res.render('admin/agencies', {
    pageTitle: 'Agencias',
    agencies,
    summary: {
      total: agencies.length,
      active: agencies.filter((agency) => agency.status === 'ACTIVA').length,
      associatedUsers: agencies.reduce((sum, agency) => sum + agency.users, 0),
    },
  });
}

module.exports = {
  listAgencies,
  listUsers,
  showNewUser,
};
