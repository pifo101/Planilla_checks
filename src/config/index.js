const port = Number.parseInt(process.env.PORT, 10) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'development_only_secret';

if (isProduction && sessionSecret === 'development_only_secret') {
  throw new Error('SESSION_SECRET es obligatorio en produccion.');
}

module.exports = {
  port,
  sessionSecret,
  isProduction,
};
