const express = require('express');
const { getDistribution } = require('../controllers/disbursement.controller');
const { checkAvailability } = require('../controllers/availability.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

router.use(requireAuth, requireRole('ASISTENTE', 'ADMIN'));
router.get('/solicitudes/:numeroSolicitud/distribucion', getDistribution);
router.get('/solicitudes/:numeroSolicitud/disponibilidad', checkAvailability);

module.exports = router;
