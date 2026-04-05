const express = require('express');
const router = express.Router();
const logoutController = require('../controllers/main/logoutController');

router.get('/', logoutController.handleLogout);

module.exports = router;