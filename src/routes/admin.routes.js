const express = require('express');
const { listUsers } = require('../controllers/admin.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/usuarios', listUsers);

module.exports = router;
