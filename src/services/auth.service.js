const bcrypt = require('bcrypt');
const userRepository = require('../repositories/user.repository');

async function authenticate(email, password) {
  const user = await userRepository.findByEmail(email.toLowerCase());

  if (!user || !user.activo || (user.rol === 'ASISTENTE' && !user.agenciaActivo)) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  return passwordMatches ? user : null;
}

module.exports = {
  authenticate,
};
