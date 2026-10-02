const crypto = require('node:crypto');

function provideCsrfToken(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function requireCsrf(req, res, next) {
  const expected = req.session.csrfToken;
  const received = req.get('x-csrf-token') || req.body?._csrf;
  const valid = typeof expected === 'string' && typeof received === 'string'
    && expected.length === received.length
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  if (valid) return next();

  if (req.is('application/json')) {
    return res.status(403).json({
      success: false,
      error: { code: 'INVALID_CSRF_TOKEN', message: 'La solicitud no pudo ser verificada.' },
    });
  }
  return res.status(403).render('500', {
    pageTitle: 'Solicitud no valida',
    errorMessage: 'La solicitud no pudo ser verificada. Recarga la pagina e intenta nuevamente.',
    errorCode: 403,
  });
}

module.exports = { provideCsrfToken, requireCsrf };
