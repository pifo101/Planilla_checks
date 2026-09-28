const bcrypt = require('bcrypt');
const userRepository = require('../repositories/user.repository');

async function authenticate(email, password) {
  const user = await userRepository.findByEmail(email.toLowerCase());

  const invalidAgency = user?.agenciaId != null && !user.agenciaActivo;
  const missingAssistantAgency = user?.rol === 'ASISTENTE' && user.agenciaId == null;
  if (!user || !user.activo || invalidAgency || missingAssistantAgency) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  return passwordMatches ? user : null;
}

module.exports = {
  authenticate,
};
