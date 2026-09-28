const express = require('express');
const { showDashboard } = require('../controllers/dashboard.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  if (req.session.user.rol === 'ASISTENTE') return res.redirect('/asistente/nueva-planilla');
  if (req.session.user.rol === 'CONTABILIDAD') return res.redirect('/contabilidad/planillas');
  return res.redirect('/dashboard');
});
router.get('/dashboard', requireAuth, requireRole('ADMIN'), showDashboard);

module.exports = router;
