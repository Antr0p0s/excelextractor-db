const express = require('express');
const router = express.Router();
const stageController = require('../../controllers/stage/stageController');
const ROLES_LIST = require('../../config/roles_list');
const verifyRoles = require('../../middleware/verifyRoles');

router.route('/filenames')
    .get(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), stageController.getFileNames)

router.route('/filemetadata')
    .post(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), stageController.getFileMetaData)
    .put(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), stageController.putMetaData)
    .delete(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), stageController.deleteMetaData)

router.route('/file')
    .post(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), stageController.getFile)

router.route('/filetxt')
    .post(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), stageController.getPythonFileAsTxt)

router.route('/changefilename')
    .put(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), stageController.changeFileName)

router.route('/nextchunk')
    .post(verifyRoles(ROLES_LIST.Admin), stageController.skipChunk)

router.route('/upload/initiate')
    .post(verifyRoles(ROLES_LIST.Admin), stageController.initiate)

router.route('/upload/presign')
    .post(verifyRoles(ROLES_LIST.Admin), stageController.presign)

router.route('/upload/complete')
    .post(verifyRoles(ROLES_LIST.Admin), stageController.complete)

router.route('/upload/compile')
    .post(verifyRoles(ROLES_LIST.Admin), stageController.compile)

router.route('/stream')
    .get(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), stageController.streamMeasurement)

module.exports = router;