function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.redirect('/login');
    }

    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('500', {
        pageTitle: 'Acceso denegado',
        errorMessage: 'No tienes permisos para acceder a este modulo.',
      });
    }

    return next();
  };
}

module.exports = {
  allowRoles,
};
