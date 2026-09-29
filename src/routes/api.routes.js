const express = require('express');
const { getDistribution } = require('../controllers/disbursement.controller');
const { checkAvailability } = require('../controllers/availability.controller');
const { submitPlanilla } = require('../controllers/planilla.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

router.use(requireAuth);
router.get('/solicitudes/:numeroSolicitud/distribucion', requireRole('ASISTENTE', 'ADMIN'), getDistribution);
router.get('/solicitudes/:numeroSolicitud/disponibilidad', requireRole('ASISTENTE', 'ADMIN'), checkAvailability);
router.post('/planillas', requireRole('ASISTENTE'), submitPlanilla);

module.exports = router;
