const express = require('express');
const { listUsers } = require('../controllers/admin.controller');

const router = express.Router();

router.get('/usuarios', listUsers);

module.exports = router;
