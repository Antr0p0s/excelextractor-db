const express = require('express');
const router = express.Router();
const setsController = require('../../controllers/excel/setsController');
const ROLES_LIST = require('../../config/roles_list');
const verifyRoles = require('../../middleware/verifyRoles');

router.route('/')
    .get(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), setsController.getPersonalSets)
    .delete(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), setsController.deleteSet)

router.route('/new')
    .post(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), setsController.createNewSet)

    
router.route('/:id')
    .put(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), setsController.updateSet)

module.exports = router;