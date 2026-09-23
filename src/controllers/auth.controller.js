const authService = require('../services/auth.service');

function showLogin(req, res) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.render('auth/login', {
    pageTitle: 'Iniciar sesion',
    layout: false,
  });
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

async function login(req, res, next) {
  const email = String(req.body.email || '').trim().toLowerCase();

  if (!email || !req.body.password) {
    return res.status(400).render('auth/login', {
      pageTitle: 'Iniciar sesion',
      layout: false,
      error: 'Ingresa tu correo y contrasena.',
      email,
    });
  }

  try {
    const user = await authService.authenticate(email, req.body.password);

    if (!user) {
      return res.status(401).render('auth/login', {
        pageTitle: 'Iniciar sesion',
        layout: false,
        error: 'Correo o contrasena incorrectos.',
        email,
      });
    }

    await regenerateSession(req);
    req.session.user = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      agenciaId: user.agenciaId,
      agenciaNombre: user.agenciaNombre,
    };
    await saveSession(req);

    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
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
