const Question = require('../../model/Question');
const { S3Client } = require('@aws-sdk/client-s3');
const { DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const ROLES_LIST = require('../../config/roles_list')
const mongoose = require('mongoose')

const s3 = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.SC_SECRET_KEY,
    },
    // forcePathStyle is often required for non-AWS providers (like MinIO)
    forcePathStyle: true,
});


const getAllQuestions = async (req, res) => {
    try {
        const questions = await Question.find().exec();
        if (!questions || questions.length === 0) {
            return res.status(204).json({ 'message': 'No questions found' });
        }

        const isAuthorized = req.roles.includes(ROLES_LIST.Admin) || req.roles.includes(ROLES_LIST.Committee);

        if (isAuthorized) {
            // Staff sees everything
            return res.json(questions);
        } else {
            // Non-staff: Strip answers and point values
            const sanitizedQuestions = questions.map(q => {
                const obj = q.toObject();
                delete obj.correctAnswer;
                if (obj.options && obj.options.length > 0) {
                    obj.options = obj.options.map(opt => ({
                        text: opt.text,
                    }));
                }
                delete obj.defaultPoints;
                return obj;
            });

            return res.json(sanitizedQuestions);
        }
    } catch (err) {
        res.status(500).json({ "message": err.message });
    }
}

const deleteQuestion = async (req, res) => {
    const { id } = req.params

    try {
        const question = await Question.findOne({ _id: id }).exec();

        if (!question) {
            return res.status(204).json({ 'message': `Question ID ${id} not found` });
        }

        // 1. If the question has media, delete it from S3 first
        if (question.media?.fileKey) {
            try {
                const deleteCommand = new DeleteObjectCommand({
                    Bucket: process.env.S3_BUCKET_NAME,
                    Key: question.media.fileKey,
                });

                await s3.send(deleteCommand);
                console.log(`S3 File Deleted: ${question.media.fileKey}`);
            } catch (s3Err) {
                // We log the error but continue deleting the question 
                // so the DB doesn't get out of sync with S3
                console.error("S3 Deletion Error:", s3Err);
            }
        }

        // 2. Delete the question from MongoDB
        const result = await question.deleteOne();

        res.json(result);
    } catch (err) {
        console.error("Delete Question Error:", err);
        res.status(500).json({ "message": err.message });
    }
}

const getCategories = async (req, res) => {
    try {
        // 1. Get all unique categories currently saved in the DB
        const dynamicCategories = await Question.distinct('category');

        dynamicCategories.sort();

        res.json(dynamicCategories);
    } catch (err) {
        console.error(err);
        res.status(500).json({ 'message': 'Could not fetch categories' });
    }
}

const createNewQuestion = async (req, res) => {
    try {
        // 1. Parse text fields
        const { category, type, defaultPoints, correctAnswer, description } = req.body;

        // Parse options (stringified by the useAxiosUpload hook)
        let options = [];
        if (req.body.options) {
            try {
                options = JSON.parse(req.body.options);
            } catch (pErr) {
                console.error("Option parsing error:", pErr);
            }
        }
        let question = {}
        if (req.body.question) {
            try {
                question = JSON.parse(req.body.question);
            } catch (pErr) {
                console.error("Question parsing error:", pErr);
            }
        }



        if (!question.en || !question.nl || !category || !type || !req.user || !req.id) {
            return res.status(400).json({ 'message': 'Missing required fields' });
        }

        // 2. Handle Mapped File Data from Multer-S3
        // Since we use .fields(), req.files is now an object: { showFile: [file], showAudio: [file]... }
        const media = {};

        const fileFields = ['showFile', 'showAudio', 'answerFile', 'answerAudio'];

        fileFields.forEach(field => {
            if (req.files && req.files[field] && req.files[field][0]) {
                const file = req.files[field][0];
                media[field] = {
                    url: file.location, // S3 Public/Private URL
                    key: file.key,      // S3 path (useful for deletion)
                    mimetype: file.mimetype
                };
            }
        });

        // 3. Build the document
        let questionObject = {
            question,
            category,
            description,
            createdAt: new Date(),
            createdBy: req.user,
            createdById: req.id,
            type,
            answers: {}, // For team submissions
            media: media // Now contains all 4 potential files
        };

        if (type === 'open') {
            questionObject.defaultPoints = Number(defaultPoints) || 0;
            questionObject.correctAnswer = [correctAnswer];
        } else if (type === 'multiple') {
            if (!options || options.length === 0) {
                return res.status(400).json({ 'message': 'Multiple choice requires options' });
            }
            questionObject.options = options;
            // logic check: ensure we handle multiple correct answers if points > 10
            questionObject.correctAnswer = options.filter(opt => opt.points >= 1);
        }

        // 4. Save to MongoDB
        const result = await Question.create(questionObject);
        res.status(201).json(result);

    } catch (err) {
        console.error("Backend Error:", err);
        res.status(500).json({ 'message': err.message });
    }
};

const editQuestion = async (req, res) => {
    // 1. Destructure from req.body
    let { _id, question, category, type, options, defaultPoints, correctAnswer } = req.body;

    if (!_id) return res.status(400).json({ "message": 'Question ID required' });

    try {
        // 2. PARSE DATA: Multer sends everything as strings
        // parse options if it's a string (it usually is with Multer)
        let parsedOptions = options;
        if (typeof options === 'string') {
            try {
                parsedOptions = JSON.parse(options);
            } catch (e) {
                console.error("Options parsing failed", e);
            }
        }

        const foundQuestion = await Question.findById(_id).exec();
        if (!foundQuestion) {
            return res.status(404).json({ 'message': `Question ID ${_id} not found` });
        }

        if (foundQuestion.createdById !== req.id && !isAdmin) {
            return res.status(403).json({ message: "You're not allowed to edit this question" })
        }


        // 3. Update fields
        foundQuestion.question = question;
        foundQuestion.category = category;
        foundQuestion.type = type;

        const isAdmin = req.roles.includes(ROLES_LIST.Admin)


        if (type === 'open') {
            foundQuestion.defaultPoints = Number(defaultPoints); // Force to Number
            foundQuestion.correctAnswer = correctAnswer;
            foundQuestion.options = undefined;
        } else if (type === 'multiple') {
            // Use the parsed array and ensure internal points are Numbers
            foundQuestion.options = parsedOptions.map(opt => ({
                text: opt.text,
                points: Number(opt.points)
            }));
            foundQuestion.correctAnswer = undefined;
        }

        // 4. Handle File 
        const uploadedFile = req.file || (req.files && req.files[0]); // Check both for safety

        if (uploadedFile) {
            foundQuestion.media = {
                fileUrl: uploadedFile.location,
                fileKey: uploadedFile.key,
                fileName: uploadedFile.originalname
            };
        }

        const result = await foundQuestion.save();
        res.json(result);

    } catch (err) {
        console.error("Edit Error:", err);
        res.status(500).json({ "message": err.message });
    }
}

const getSingleQuestion = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ID
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: "Invalid question ID" });
        }

        const question = await Question.findById(id);

        if (!question) {
            return res.status(404).json({ message: "Question not found" });
        }

        res.status(200).json(question);
    } catch (err) {
        console.error("getSingleQuestion error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

const getFile = async (req, res) => {
    const { questionId, type } = req.params;

    if (!mongoose.Types.ObjectId.isValid(questionId)) {
        return // this is a bad link and should be ignored/handled elsewhere
    }

    try {
        const question = await Question.findById(questionId).exec();

        if (!question || !question.media || !question.media[type] || !question.media[type].key) {
            return res.status(404).json({ "message": "No media found for this ID" });
        }

        // Create the command to get the specific object using its Key
        const command = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: question.media[type].key, // Use the key, not the full URL
        });

        // Generate a URL that expires in 60 minutes (3600 seconds)        
        const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

        // Redirect the browser to the temporary, authorized URL
        res.redirect(presignedUrl);

    } catch (err) {
        console.error("Presigned URL Error:", err);
        res.status(500).json({ "message": "Could not authorize file access" });
    }
}

module.exports = {
    getCategories,
    deleteQuestion,
    createNewQuestion,
    getAllQuestions,
    editQuestion,
    getSingleQuestion,
    getFile
}