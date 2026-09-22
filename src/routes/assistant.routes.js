const express = require('express');
const {
  showNewPlanilla,
  listSentPlanillas,
  showSentPlanilla,
} = require('../controllers/assistant.controller');

const router = express.Router();

router.get('/nueva-planilla', showNewPlanilla);
router.get('/planillas', listSentPlanillas);
router.get('/planillas/:id', showSentPlanilla);

module.exports = router;
