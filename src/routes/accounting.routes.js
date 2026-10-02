const express = require('express');
const {
  decideTransfer,
  listReceivedPlanillas,
  listTransferHistory,
  showReceivedPlanilla,
} = require('../controllers/accounting.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { provideCsrfToken, requireCsrf } = require('../middleware/csrf.middleware');

const router = express.Router();

router.use(requireAuth, requireRole('CONTABILIDAD'));
router.use(provideCsrfToken);

router.get('/planillas', listReceivedPlanillas);
router.get('/historial', listTransferHistory);
router.post('/planillas/:id/traslado', requireCsrf, decideTransfer);
router.get('/planillas/:id', showReceivedPlanilla);

module.exports = router;
