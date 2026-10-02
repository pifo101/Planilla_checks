const express = require('express');
const {
  createUser,
  listAgencies,
  listUsers,
  showNewUser,
  updateUser,
} = require('../controllers/admin.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/agencias', listAgencies);
router.get('/usuarios/nuevo', showNewUser);
router.post('/usuarios', createUser);
router.post('/usuarios/:id', updateUser);
router.get('/usuarios', listUsers);

module.exports = router;
