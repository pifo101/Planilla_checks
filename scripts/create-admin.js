require('dotenv').config();

const bcrypt = require('bcrypt');
const { closePool } = require('../src/config/database');
const userRepository = require('../src/repositories/user.repository');

const SALT_ROUNDS = 12;

async function main() {
  const nombre = String(process.env.ADMIN_NAME || '').trim();
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');

  if (!nombre || !email || !password) {
    throw new Error('Define ADMIN_NAME, ADMIN_EMAIL y ADMIN_PASSWORD en el entorno.');
  }

  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres.');
  }

  if (await userRepository.findByEmail(email)) {
    throw new Error(`Ya existe un usuario con el correo ${email}.`);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userRepository.create({
    nombre,
    email,
    passwordHash,
    rol: 'ADMIN',
  });

  console.log(`Administrador creado con id ${user.id} y correo ${user.email}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
