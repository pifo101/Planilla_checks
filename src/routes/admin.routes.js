const express = require('express');
const { listAgencies, listUsers } = require('../controllers/admin.controller');

const router = express.Router();

router.get('/agencias', listAgencies);
router.get('/usuarios', listUsers);

module.exports = router;
