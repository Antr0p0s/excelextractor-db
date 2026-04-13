const express = require('express');
const router = express.Router();
const stageController = require('../../controllers/stage/stageController');

// 🔐 Middleware here
const verifyStageAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    if (token !== process.env.STAGE_AUTH_KEY) {
        return res.status(403).json({ message: 'Forbidden: Invalid token' });
    }

    next();
};

router.route('/')
    .post(verifyStageAuth, stageController.postFrame);

module.exports = router;