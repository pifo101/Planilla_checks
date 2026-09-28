const express = require('express');
const {
  listReceivedPlanillas,
  showReceivedPlanilla,
} = require('../controllers/accounting.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

router.use(requireAuth, requireRole('CONTABILIDAD'));

router.get('/planillas', listReceivedPlanillas);
router.get('/planillas/:id', showReceivedPlanilla);

module.exports = router;
