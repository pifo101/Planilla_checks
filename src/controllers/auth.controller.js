function showLogin(req, res) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.render('auth/login', {
    pageTitle: 'Iniciar sesion',
    layout: false,
  });
}

function login(req, res) {
  const username = String(req.body.username || '').trim();

  if (!username || !req.body.password) {
    return res.status(400).render('auth/login', {
      pageTitle: 'Iniciar sesion',
      layout: false,
      error: 'Ingresa tu usuario y contrasena.',
      username,
    });
  }

  // TODO: reemplazar por consulta SQL y bcrypt.compare().
  req.session.user = {
    name: 'Usuario de demostracion',
    username,
    role: 'ADMIN',
    agency: 'Agencia demo',
  };

  return res.redirect('/dashboard');
}

function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    res.clearCookie('planilla.sid');
    return res.redirect('/login');
  });
}

module.exports = {
  showLogin,
  login,
  logout,
};
