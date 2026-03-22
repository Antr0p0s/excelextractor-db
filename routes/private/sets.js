const express = require('express');
const router = express.Router();
const setsController = require('../../controllers/setsController');
const ROLES_LIST = require('../../config/roles_list');
const verifyRoles = require('../../middleware/verifyRoles');

router.route('/')
    .get(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), setsController.getPersonalSets)

router.route('/new')
    .post(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), setsController.createNewSet)

    
router.route('/:id')
    .put(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), setsController.updateSet)

module.exports = router;