const port = Number.parseInt(process.env.PORT, 10) || 3000;

module.exports = {
  port,
  sessionSecret: process.env.SESSION_SECRET || 'development_only_secret',
  isProduction: process.env.NODE_ENV === 'production',
};
