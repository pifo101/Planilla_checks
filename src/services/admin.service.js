const agencyRepository = require('../repositories/agency.repository');
const userRepository = require('../repositories/user.repository');
const accountService = require('./account.service');

const {
  AccountError: AdminError,
  ROLES,
  SALT_ROUNDS,
  isDuplicateEmail,
  normalizeAccess,
  normalizeEmail,
  validateAgency,
} = accountService;

function requireAdmin(actor) {
  if (!actor || actor.rol !== 'ADMIN') {
    throw new AdminError('No tienes permisos para administrar usuarios.', 'ADMIN_FORBIDDEN', 403);
  }
}

async function createUser(payload, actor) {
  requireAdmin(actor);
  const access = normalizeAccess({ ...payload, activo: true });
  return accountService.createAccount(payload, access);
}

async function updateUser(idValue, payload, actor) {
  requireAdmin(actor);
  const id = Number(idValue);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AdminError('El usuario indicado no es valido.', 'INVALID_USER');
  }

  const access = normalizeAccess(payload);
  if (id === Number(actor.id) && !access.activo) {
    throw new AdminError('No puedes bloquear tu propio usuario.', 'SELF_BLOCK');
  }
  if (id === Number(actor.id) && access.rol !== 'ADMIN') {
    throw new AdminError('No puedes quitarte el rol de administrador.', 'SELF_DEMOTION');
  }

  await validateAgency(access.agenciaId);
  const user = await userRepository.updateAdministration(id, access);
  if (!user) throw new AdminError('El usuario no existe.', 'USER_NOT_FOUND', 404);
  return user;
}

function numericSummary(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, Number(row?.[field] || 0)]));
}

async function getAdminDashboardSummary(actor) {
  requireAdmin(actor);
  const [userSummary, agencyData] = await Promise.all([
    userRepository.findAdminDashboardSummary(),
    agencyRepository.findAdminDashboardSummary(),
  ]);

  return {
    users: numericSummary(userSummary, [
      'totalUsuarios',
      'usuariosActivos',
      'usuariosBloqueados',
      'administradores',
      'asistentes',
      'contabilidad',
      'asistentesConAgencia',
    ]),
    agencies: numericSummary(agencyData.summary, [
      'totalAgencias',
      'agenciasActivas',
      'agenciasInactivas',
    ]),
    assistantsByAgency: agencyData.assistantsByAgency.map((agency) => ({
      id: Number(agency.id),
      codigo: agency.codigo,
      nombre: agency.nombre,
      activo: Boolean(agency.activo),
      asistentes: Number(agency.asistentes || 0),
    })),
  };
}

module.exports = {
  AdminError,
  ROLES,
  SALT_ROUNDS,
  createUser,
  getAdminDashboardSummary,
  isDuplicateEmail,
  normalizeAccess,
  normalizeEmail,
  updateUser,
};
