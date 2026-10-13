const port = Number.parseInt(process.env.PORT, 10) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'development_only_secret';
const configuredWebServiceTimeout = Number.parseInt(process.env.WEBSERVICE_TIMEOUT_MS, 10);
const webServiceTimeoutMs = configuredWebServiceTimeout > 0 ? configuredWebServiceTimeout : 8000;
const configuredInstitutionalPortalUrl = String(process.env.INSTITUTIONAL_PORTAL_URL || '').trim();
const productionSecretPlaceholders = new Set([
  '',
  'change_this_secret',
  'development_only_secret',
  'replace_with_a_long_random_secret',
]);

if (isProduction && productionSecretPlaceholders.has(String(process.env.SESSION_SECRET || '').trim())) {
  throw new Error('SESSION_SECRET debe configurarse con un valor no placeholder en produccion.');
}

function parseInstitutionalPortalUrl(value) {
  if (!value) return null;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('INSTITUTIONAL_PORTAL_URL debe ser una URL absoluta HTTP(S) valida.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('INSTITUTIONAL_PORTAL_URL debe ser una URL absoluta HTTP(S) sin credenciales.');
  }
  return url.toString();
}

module.exports = {
  port,
  sessionSecret,
  isProduction,
  institutionalPortalUrl: parseInstitutionalPortalUrl(configuredInstitutionalPortalUrl),
  webServiceBaseUrl: process.env.WEBSERVICE_BASE_URL || '',
  webServiceTimeoutMs,
};
