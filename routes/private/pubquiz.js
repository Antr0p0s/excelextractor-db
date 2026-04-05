const express = require('express');
const router = express.Router();
const pubquizController = require('../../controllers/pubquiz/pubquizController');
const quizQuestionController = require('../../controllers/pubquiz/quizQuestionController');
const ROLES_LIST = require('../../config/roles_list');
const verifyRoles = require('../../middleware/verifyRoles');
const multer = require('multer');

const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');

// Configure the S3 Client
const s3 = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.SC_SECRET_KEY,
    },
    forcePathStyle: true,
});

const storage = multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    acl: 'private',
    metadata: (req, file, cb) => {
        cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `pubquiz/${uniqueSuffix}-${file.originalname}`);
    }
});

const allowedMimes = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/mpeg",
    "image/svg+xml",
    "video/quicktime",
    "application/pdf",
    "audio/mpeg"
]

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 500, // 500MB
    },
    fileFilter: (req, file, cb) => {
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            console.log('Rejected Mimetype:', file.mimetype);
            // Providing a more descriptive error helps the frontend
            cb(new Error(`File type ${file.mimetype} is not supported.`), false);
        }
    }
});

const questionUploadFields = upload.fields([
    { name: 'showFile', maxCount: 1 },
    { name: 'showAudio', maxCount: 1 },
    { name: 'answerFile', maxCount: 1 },
    { name: 'answerAudio', maxCount: 1 }
]);

// question route => used to manipulate questions
router.route('/question')
    .get(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), quizQuestionController.getAllQuestions)
    .post(
        verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin),
        questionUploadFields,
        quizQuestionController.createNewQuestion
    )

router.route('/question/:id')
    .get(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), quizQuestionController.getSingleQuestion)
    .delete(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), quizQuestionController.deleteQuestion)

router.route('/categories')
    .get(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), quizQuestionController.getCategories)

router.route('/quiz/start')
    .get(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), pubquizController.startQuiz)

router.route('/quiz/stream')
    .get(verifyRoles(ROLES_LIST.User, ROLES_LIST.QuizUser, ROLES_LIST.Admin), pubquizController.streamQuiz)

router.route('/quiz/answer')
    .post(verifyRoles(ROLES_LIST.QuizUser), pubquizController.submitAnswer)

router.route('/quiz/judge-answer')
    .post(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), pubquizController.judgeAnswer)

router.route('/activate-question')
    .post(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), pubquizController.setActiveQuestion)
    .put(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), pubquizController.showAnswer)

router.route('/activate-leaderboard')
    .post(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), pubquizController.showLeaderboard)

router.route('/lock-question')
    .post(verifyRoles(ROLES_LIST.User, ROLES_LIST.Admin), pubquizController.lockQuestion)

router.route('/get-file/:questionId/:type')
    .get(verifyRoles(ROLES_LIST.User, ROLES_LIST.QuizUser, ROLES_LIST.Admin), quizQuestionController.getFile)






module.exports = router;