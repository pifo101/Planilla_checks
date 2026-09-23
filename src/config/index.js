const port = Number.parseInt(process.env.PORT, 10) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'development_only_secret';
const configuredWebServiceTimeout = Number.parseInt(process.env.WEBSERVICE_TIMEOUT_MS, 10);
const webServiceTimeoutMs = configuredWebServiceTimeout > 0 ? configuredWebServiceTimeout : 8000;

if (isProduction && sessionSecret === 'development_only_secret') {
  throw new Error('SESSION_SECRET es obligatorio en produccion.');
}

module.exports = {
  port,
  sessionSecret,
  isProduction,
  webServiceBaseUrl: process.env.WEBSERVICE_BASE_URL || '',
  webServiceTimeoutMs,
};
