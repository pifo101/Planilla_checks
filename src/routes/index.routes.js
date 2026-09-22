const express = require('express');
const { showDashboard } = require('../controllers/dashboard.controller');

const router = express.Router();

router.get('/', (req, res) => res.redirect('/dashboard'));
router.get('/dashboard', showDashboard);

module.exports = router;
