const bcrypt = require('bcrypt');
const agencyRepository = require('../repositories/agency.repository');
const userRepository = require('../repositories/user.repository');

const SALT_ROUNDS = 12;
const ROLES = Object.freeze(['ADMIN', 'ASISTENTE', 'CONTABILIDAD']);
const INSTITUTIONAL_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@adicla\.org\.gt$/i;

class AdminError extends Error {
  constructor(message, code = 'ADMIN_VALIDATION', status = 400) {
    super(message);
    this.name = 'AdminError';
    this.code = code;
    this.status = status;
  }
}

function requireAdmin(actor) {
  if (!actor || actor.rol !== 'ADMIN') {
    throw new AdminError('No tienes permisos para administrar usuarios.', 'ADMIN_FORBIDDEN', 403);
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  const localPart = email.split('@')[0] || '';
  if (email.length > 254 || !INSTITUTIONAL_EMAIL.test(email)
      || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    throw new AdminError('Ingresa un correo institucional @adicla.org.gt valido.', 'INVALID_EMAIL');
  }
  return email;
}

function normalizeName(value) {
  const nombre = String(value || '').trim();
  if (!nombre || nombre.length > 150) {
    throw new AdminError('Ingresa un nombre de hasta 150 caracteres.', 'INVALID_NAME');
  }
  return nombre;
}

function normalizeAccess(payload) {
  const rol = String(payload.rol || '').trim().toUpperCase();
  if (!ROLES.includes(rol)) throw new AdminError('Selecciona un rol valido.', 'INVALID_ROLE');

  const rawAgencyId = String(payload.agenciaId || '').trim();
  const agenciaId = rawAgencyId ? Number(rawAgencyId) : null;
  if (rol === 'ASISTENTE' && (!Number.isSafeInteger(agenciaId) || agenciaId <= 0)) {
    throw new AdminError('Selecciona una agencia activa para el asistente.', 'AGENCY_REQUIRED');
  }

  const rawActive = String(payload.activo).toLowerCase();
  if (payload.activo !== true && payload.activo !== false
      && rawActive !== 'true' && rawActive !== 'false') {
    throw new AdminError('Selecciona un estado valido.', 'INVALID_STATUS');
  }
  const activo = payload.activo === true || rawActive === 'true';
  return { rol, agenciaId: rol === 'ASISTENTE' ? agenciaId : null, activo };
}

async function validateAgency(agenciaId) {
  if (agenciaId == null) return;
  const agency = await agencyRepository.findById(agenciaId);
  if (!agency || !agency.activo) {
    throw new AdminError('La agencia seleccionada no existe o esta inactiva.', 'INVALID_AGENCY');
  }
}

function isDuplicateEmail(error) {
  const number = error?.number || error?.originalError?.info?.number;
  return number === 2601 || number === 2627;
}

async function createUser(payload, actor) {
  requireAdmin(actor);
  const nombre = normalizeName(payload.nombre);
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || '');
  if (password.length < 12) {
    throw new AdminError('La contrasena debe tener al menos 12 caracteres.', 'INVALID_PASSWORD');
  }
  if (password !== String(payload.confirmPassword || '')) {
    throw new AdminError('Las contrasenas no coinciden.', 'PASSWORD_MISMATCH');
  }

  const access = normalizeAccess({ ...payload, activo: true });
  await validateAgency(access.agenciaId);
  if (await userRepository.findByEmail(email)) {
    throw new AdminError('Ya existe un usuario con ese correo.', 'DUPLICATE_EMAIL');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  try {
    return await userRepository.create({ nombre, email, passwordHash, ...access });
  } catch (error) {
    if (isDuplicateEmail(error)) {
      throw new AdminError('Ya existe un usuario con ese correo.', 'DUPLICATE_EMAIL');
    }
    throw error;
  }
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

module.exports = {
  AdminError,
  ROLES,
  SALT_ROUNDS,
  createUser,
  isDuplicateEmail,
  normalizeAccess,
  normalizeEmail,
  updateUser,
};
