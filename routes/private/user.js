const express = require('express');
const router = express.Router();
const userController = require('../../controllers/main/userController');
const ROLES_LIST = require('../../config/roles_list');
const verifyRoles = require('../../middleware/verifyRoles');

router.route('/pass')
    .put(verifyRoles(
        ROLES_LIST.User,
        ROLES_LIST.quizUser,
        ROLES_LIST.Admin
    ), userController.changePassword)

module.exports = router;