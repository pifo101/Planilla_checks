function requireAuth(req, res, next) {
  if (req.session?.user) {
    return next();
  }

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Debes iniciar sesion.' },
    });
  }

  return res.redirect('/login');
}

module.exports = {
  requireAuth,
};
