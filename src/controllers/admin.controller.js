const users = [
  { name: 'Ana Morales', email: 'ana@example.test', role: 'ADMIN', agency: 'Central', status: 'ACTIVO' },
  { name: 'Carlos Lopez', email: 'carlos@example.test', role: 'ASISTENTE', agency: 'Norte', status: 'ACTIVO' },
  { name: 'Maria Perez', email: 'maria@example.test', role: 'CONTABILIDAD', agency: 'No aplica', status: 'INACTIVO' },
];

function listUsers(req, res) {
  res.render('admin/users', {
    pageTitle: 'Usuarios',
    users,
  });
}

module.exports = {
  listUsers,
};
