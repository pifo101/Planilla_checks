function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.redirect('/login');
    }

    if (!roles.includes(req.session.user.rol)) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tienes permisos para realizar esta consulta.' },
        });
      }

      return res.status(403).render('500', {
        pageTitle: 'Acceso denegado',
        errorMessage: 'No tienes permisos para acceder a este modulo.',
      });
    }

    return next();
  };
}

module.exports = {
  requireRole,
};
