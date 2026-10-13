const express = require('express');
const {
  showNewPlanilla,
  listSentPlanillas,
  showSentPlanilla,
} = require('../controllers/assistant.controller');
const { downloadAssistantPlanilla } = require('../controllers/planilla-pdf.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

router.use(requireAuth, requireRole('ASISTENTE'));

router.get('/nueva-planilla', showNewPlanilla);
router.get('/planillas', listSentPlanillas);
router.get('/planillas/:id/pdf', downloadAssistantPlanilla);
router.get('/planillas/:id', showSentPlanilla);

module.exports = router;
