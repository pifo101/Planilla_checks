const bcrypt = require('bcrypt');
const agencyRepository = require('../repositories/agency.repository');
const userRepository = require('../repositories/user.repository');

const SALT_ROUNDS = 12;
const ROLES = Object.freeze(['ADMIN', 'ASISTENTE', 'CONTABILIDAD']);
const INSTITUTIONAL_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@adicla\.org\.gt$/i;

class AccountError extends Error {
  constructor(message, code = 'ACCOUNT_VALIDATION', status = 400) {
    super(message);
    this.name = 'AccountError';
    this.code = code;
    this.status = status;
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  const localPart = email.split('@')[0] || '';
  if (email.length > 254 || !INSTITUTIONAL_EMAIL.test(email)
      || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    throw new AccountError('Ingresa un correo institucional @adicla.org.gt valido.', 'INVALID_EMAIL');
  }
  return email;
}

function normalizeName(value) {
  const nombre = String(value || '').trim();
  if (!nombre || nombre.length > 150) {
    throw new AccountError('Ingresa un nombre de hasta 150 caracteres.', 'INVALID_NAME');
  }
  return nombre;
}

function normalizeAccess(payload) {
  const rol = String(payload.rol || '').trim().toUpperCase();
  if (!ROLES.includes(rol)) throw new AccountError('Selecciona un rol valido.', 'INVALID_ROLE');

  const rawAgencyId = String(payload.agenciaId || '').trim();
  const agenciaId = rawAgencyId ? Number(rawAgencyId) : null;
  if (rol === 'ASISTENTE' && (!Number.isSafeInteger(agenciaId) || agenciaId <= 0)) {
    throw new AccountError('Selecciona una agencia activa para el asistente.', 'AGENCY_REQUIRED');
  }

  const rawActive = String(payload.activo).toLowerCase();
  if (payload.activo !== true && payload.activo !== false
      && rawActive !== 'true' && rawActive !== 'false') {
    throw new AccountError('Selecciona un estado valido.', 'INVALID_STATUS');
  }
  const activo = payload.activo === true || rawActive === 'true';
  return { rol, agenciaId: rol === 'ASISTENTE' ? agenciaId : null, activo };
}

async function validateAgency(agenciaId) {
  if (agenciaId == null) return;
  const agency = await agencyRepository.findById(agenciaId);
  if (!agency || !agency.activo) {
    throw new AccountError('La agencia seleccionada no existe o esta inactiva.', 'INVALID_AGENCY');
  }
}

function isDuplicateEmail(error) {
  const number = error?.number || error?.originalError?.info?.number;
  return number === 2601 || number === 2627;
}

async function createAccount(payload, access) {
  const nombre = normalizeName(payload.nombre);
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || '');
  if (password.length < 12) {
    throw new AccountError('La contrasena debe tener al menos 12 caracteres.', 'INVALID_PASSWORD');
  }
  if (password !== String(payload.confirmPassword || '')) {
    throw new AccountError('Las contrasenas no coinciden.', 'PASSWORD_MISMATCH');
  }

  await validateAgency(access.agenciaId);
  if (await userRepository.findByEmail(email)) {
    throw new AccountError('Ya existe una cuenta con este correo.', 'DUPLICATE_EMAIL');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  try {
    return await userRepository.create({ nombre, email, passwordHash, ...access });
  } catch (error) {
    if (isDuplicateEmail(error)) {
      throw new AccountError('Ya existe una cuenta con este correo.', 'DUPLICATE_EMAIL');
    }
    throw error;
  }
}

async function registerPublicAccount(payload) {
  const access = normalizeAccess({
    rol: 'ASISTENTE',
    agenciaId: payload.agenciaId,
    activo: false,
  });
  return createAccount(payload, access);
}

module.exports = {
  AccountError,
  ROLES,
  SALT_ROUNDS,
  createAccount,
  isDuplicateEmail,
  normalizeAccess,
  normalizeEmail,
  registerPublicAccount,
  validateAgency,
};
