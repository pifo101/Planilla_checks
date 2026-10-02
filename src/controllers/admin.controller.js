const adminService = require('../services/admin.service');
const agencyRepository = require('../repositories/agency.repository');
const userRepository = require('../repositories/user.repository');

const roleLabels = {
  ADMIN: 'Administrador',
  ASISTENTE: 'Asistente de Agencia',
  CONTABILIDAD: 'Contabilidad',
};

async function usersViewData(req, extra = {}) {
  const [users, agencies] = await Promise.all([
    userRepository.findAll(),
    agencyRepository.findActive(),
  ]);
  const agencyFilters = [...new Set(users.map((user) => user.agenciaNombre).filter(Boolean))].sort();

  return {
    pageTitle: 'Administracion de usuarios',
    users,
    agencies,
    agencyFilters,
    roles: adminService.ROLES,
    roleLabels,
    message: req.query.created
      ? 'Usuario creado correctamente.'
      : req.query.updated ? 'Usuario actualizado correctamente.' : null,
    summary: {
      total: users.length,
      active: users.filter((user) => user.activo).length,
      blocked: users.filter((user) => !user.activo).length,
      assistants: users.filter((user) => user.rol === 'ASISTENTE').length,
    },
    ...extra,
  };
}

async function listUsers(req, res, next) {
  try {
    return res.render('admin/users', await usersViewData(req));
  } catch (error) {
    return next(error);
  }
}

async function showNewUser(req, res, next) {
  try {
    return res.render('admin/new-user', {
      pageTitle: 'Crear usuario',
      agencies: await agencyRepository.findActive(),
      roles: adminService.ROLES,
      roleLabels,
      values: {},
    });
  } catch (error) {
    return next(error);
  }
}

async function createUser(req, res, next) {
  const values = {
    nombre: String(req.body.nombre || '').trim(),
    email: String(req.body.email || '').trim().toLowerCase(),
    rol: String(req.body.rol || '').trim().toUpperCase(),
    agenciaId: String(req.body.agenciaId || '').trim(),
  };

  try {
    await adminService.createUser(req.body, req.session.user);
    return res.redirect('/admin/usuarios?created=1');
  } catch (error) {
    if (!(error instanceof adminService.AdminError)) return next(error);
    try {
      return res.status(error.status).render('admin/new-user', {
        pageTitle: 'Crear usuario',
        agencies: await agencyRepository.findActive(),
        roles: adminService.ROLES,
        roleLabels,
        values,
        error: error.message,
      });
    } catch (renderError) {
      return next(renderError);
    }
  }
}

async function updateUser(req, res, next) {
  try {
    await adminService.updateUser(req.params.id, req.body, req.session.user);
    return res.redirect('/admin/usuarios?updated=1');
  } catch (error) {
    if (!(error instanceof adminService.AdminError)) return next(error);
    try {
      return res.status(error.status).render('admin/users', await usersViewData(req, {
        error: error.message,
      }));
    } catch (renderError) {
      return next(renderError);
    }
  }
}

async function listAgencies(req, res, next) {
  try {
    const agencies = await agencyRepository.findAll();
    return res.render('admin/agencies', {
      pageTitle: 'Agencias',
      agencies,
      summary: {
        total: agencies.length,
        active: agencies.filter((agency) => agency.activo).length,
        associatedUsers: agencies.reduce((sum, agency) => sum + Number(agency.usuarios), 0),
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createUser,
  listAgencies,
  listUsers,
  showNewUser,
  updateUser,
  usersViewData,
};
