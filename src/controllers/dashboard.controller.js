const adminService = require('../services/admin.service');

async function showDashboard(req, res) {
  try {
    const summary = await adminService.getAdminDashboardSummary(req.session.user);
    res.set('Cache-Control', 'no-store');
    return res.render('dashboard/index', {
      pageTitle: 'Dashboard administrativo',
      summary,
    });
  } catch (error) {
    console.error('Error al consultar el dashboard administrativo:', error.message);
    return res.status(500).render('500', {
      pageTitle: 'Error del servidor',
      errorMessage: 'No fue posible consultar el resumen administrativo en este momento.',
    });
  }
}

module.exports = {
  showDashboard,
};
