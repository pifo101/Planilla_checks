const express = require('express');
const { listAgencies, listUsers, showNewUser } = require('../controllers/admin.controller');

const router = express.Router();

router.get('/agencias', listAgencies);
router.get('/usuarios/nuevo', showNewUser);
router.get('/usuarios', listUsers);

module.exports = router;
