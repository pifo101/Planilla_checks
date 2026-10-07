const express = require('express');
const {
  showLogin, showRegistration, login, logout, register,
} = require('../controllers/auth.controller');
const { provideCsrfToken, requireCsrf } = require('../middleware/csrf.middleware');

const router = express.Router();

router.get('/login', showLogin);
router.post('/login', login);
router.get('/crear-cuenta', provideCsrfToken, showRegistration);
router.post('/crear-cuenta', provideCsrfToken, requireCsrf, register);
router.post('/logout', requireCsrf, logout);

module.exports = router;
