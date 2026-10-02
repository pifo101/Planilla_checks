const userRepository = require('../repositories/user.repository');

function rejectAuthentication(req, res) {
  res.clearCookie('planilla.sid');
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Debes iniciar sesion.' },
    });
  }

  return res.redirect('/login');
}

function destroySession(req) {
  return new Promise((resolve) => {
    req.session.destroy((error) => resolve(error));
  });
}

async function requireAuth(req, res, next) {
  const sessionUser = req.session?.user;
  if (!sessionUser) return rejectAuthentication(req, res);

  try {
    const userId = Number(sessionUser.id);
    const user = Number.isSafeInteger(userId) && userId > 0
      ? await userRepository.findById(userId)
      : null;
    const invalidAgency = user?.agenciaId != null && !user.agenciaActivo;
    const missingAssistantAgency = user?.rol === 'ASISTENTE' && user.agenciaId == null;
    const unexpectedAgency = user?.rol !== 'ASISTENTE' && user?.agenciaId != null;

    if (!user || !user.activo || invalidAgency || missingAssistantAgency || unexpectedAgency) {
      req.session.user = null;
      const destroyError = await destroySession(req);
      if (destroyError) console.error('No fue posible destruir una sesion invalidada:', destroyError);
      return rejectAuthentication(req, res);
    }

    const currentUser = {
      id: Number(user.id),
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      agenciaId: user.agenciaId,
      agenciaNombre: user.agenciaNombre,
    };
    req.session.user = currentUser;
    res.locals.currentUser = currentUser;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requireAuth,
};
