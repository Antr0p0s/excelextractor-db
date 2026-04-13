const express = require('express');
const router = express.Router();
const stageController = require('../../controllers/stage/stageController');
const ROLES_LIST = require('../../config/roles_list');
const verifyRoles = require('../../middleware/verifyRoles');

router.route('/filenames')
    .get(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), stageController.getFileNames)

router.route('/file')
    .post(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), stageController.getFile)

router.route('/nextchunk')
    .post(verifyRoles(ROLES_LIST.Admin), stageController.skipChunk)

router.route('/stream')
    .get(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), stageController.streamMeasurement)

module.exports = router;