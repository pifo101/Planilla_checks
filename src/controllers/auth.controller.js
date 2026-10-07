const authService = require('../services/auth.service');
const accountService = require('../services/account.service');
const agencyRepository = require('../repositories/agency.repository');
const { homeForRole } = require('../utils/navigation');

function showLogin(req, res) {
  if (req.session.user) {
    return res.redirect(homeForRole(req.session.user.rol));
  }

  return res.render('auth/login', {
    pageTitle: 'Iniciar sesion',
    layout: false,
    message: req.query.created
      ? 'Cuenta creada correctamente. Un administrador debe activarla antes de que puedas iniciar sesion.'
      : null,
  });
}

async function showRegistration(req, res, next) {
  if (req.session.user) return res.redirect(homeForRole(req.session.user.rol));

  try {
    return res.render('auth/register', {
      pageTitle: 'Crear cuenta',
      layout: false,
      agencies: await agencyRepository.findActive(),
      values: {},
    });
  } catch (error) {
    return next(error);
  }
}

async function register(req, res, next) {
  if (req.session.user) return res.redirect(homeForRole(req.session.user.rol));

  const values = {
    nombre: String(req.body.nombre || '').trim(),
    email: String(req.body.email || '').trim().toLowerCase(),
    agenciaId: String(req.body.agenciaId || '').trim(),
  };

  try {
    await accountService.registerPublicAccount(req.body);
    return res.redirect('/login?created=1');
  } catch (error) {
    if (!(error instanceof accountService.AccountError)) return next(error);
    try {
      return res.status(error.status).render('auth/register', {
        pageTitle: 'Crear cuenta',
        layout: false,
        agencies: await agencyRepository.findActive(),
        values,
        error: error.message,
      });
    } catch (renderError) {
      return next(renderError);
    }
  }
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

    return res.redirect(homeForRole(user.rol));
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
  showRegistration,
  login,
  logout,
  register,
};
