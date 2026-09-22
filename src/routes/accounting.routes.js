const express = require('express');
const {
  listReceivedPlanillas,
  showReceivedPlanilla,
} = require('../controllers/accounting.controller');

const router = express.Router();

router.get('/planillas', listReceivedPlanillas);
router.get('/planillas/:id', showReceivedPlanilla);

module.exports = router;
