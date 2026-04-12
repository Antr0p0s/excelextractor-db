const Question = require('../../model/Question');
const { S3Client } = require('@aws-sdk/client-s3');
const { DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const ROLES_LIST = require('../../config/roles_list')

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

const generateQuizId = () => {
    return 'devmodequizid'
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const quizzes = {}

const startQuiz = async (req, res) => {
    const hostId = req.id;

    // ✅ Create quiz if it doesn't exist
    if (!quizzes[hostId]) {
        const quizId = generateQuizId();

        quizzes[hostId] = {
            quizId,
            hostData: {
                id: req.id,
                name: req.user
            },
            data: {
                currentQuestion: null,
                answers: {}
            },
            connections: {
                displays: [],
                staff: [],
                player: []
            }
        };
    }

    const quiz = quizzes[hostId];

    // ✅ Setup SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.flushHeaders();

    // ✅ Send initial data (VERY IMPORTANT)
    res.write(
        `data: ${JSON.stringify({
            type: "INIT",
            quizId: quiz.quizId,
        })}\n\n`
    );

    // ✅ Store this display connection
    const displayConnection = res;
    quiz.connections.displays.push(displayConnection);

    // ✅ Handle disconnect
    req.on("close", () => {
        quiz.connections.displays = quiz.connections.displays.filter((d) => d !== displayConnection);
    });
};

const sendStats = (quiz) => {
    const payload = {
        type: "STATS_UPDATE",
        stats: {
            displays: quiz.connections.displays.length,
            staff: quiz.connections.staff.length,
            player: quiz.connections.player.length,
        },
    };

    [...quiz.connections.displays,
    ...quiz.connections.staff].forEach((res) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    });
};

const streamQuiz = (req, res) => {
    try {
        const { quizId, type } = req.query;

        const connectionType = type || 'player';

        const quiz =
            connectionType === 'player'
                ? Object.values(quizzes).find(q => q.quizId === quizId)
                : quizzes[req.id];

        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        // ✅ SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        // ✅ Store connection
        quiz.connections[connectionType].push(res);

        // ✅ Send initial data
        res.write(
            `data: ${JSON.stringify({
                type: "INIT",
                quizId: quiz.quizId,
                stats: {
                    displays: quiz.connections.displays.length,
                    staff: quiz.connections.staff.length,
                    player: quiz.connections.player.length,
                },
            })}\n\n`
        );

        sendStats(quiz);

        if (quiz?.data?.currentQuestion) {
            const question = quiz.data.currentQuestion

            const payload = type === 'player'
                ? {
                    type: "QUESTION_UPDATE",
                    question: {
                        _id: question._id,
                        category: question.category,
                        type: question.type,
                        question: question.question.en || question.question,
                        options: question.options || [],
                        currentlyLocked: question.currentlyLocked || false,
                        description: question.description || "",
                        media: {
                            showFile: question.media.showFile,
                            showAudio: question.media.showAudio
                        }
                    }
                }
                : {
                    type: "QUESTION_UPDATE",
                    question: {
                        _id: question._id,
                        category: question.category,
                        type: question.type,
                        question: question.question.en || question.question,
                        options: question.options || [],
                        correctAnswer: question.correctAnswer || [],
                        currentlyLocked: question.currentlyLocked || false,
                        description: question.description || "",
                        currentAnswers: question.data.answers[question._id],
                        media: question.media || {}
                    }
                }
            res.write(`data: ${JSON.stringify(payload)}\n\n`)
        }

        // ✅ Handle disconnect
        req.on("close", () => {
            quiz.connections[connectionType] =
                quiz.connections[connectionType].filter((c) => c !== res);

            sendStats(quiz);
        });

    } catch (err) {
        console.error("SSE error:", err);
        return res.sendStatus(403); // Only send headers once
    }
};

const lockQuestion = async (req, res) => {
    try {
        const hostId = req.id;

        // Make sure quiz exists
        const quiz = quizzes[hostId];
        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        // Make sure there’s an active question
        if (!quiz.data.currentQuestion) {
            return res.status(400).json({ message: "No active question to lock answer for" });
        }

        quiz.data.currentQuestion.currentlyLocked = true

        // ✅ Notify all displays that the answer can now be lockn
        const payload = {
            type: "LOCK_ANSWER",
            questionId: quiz.data.currentQuestion._id
        };

        // Send to displays
        quiz.connections.displays.forEach((res) => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        });

        // Optionally, also send to staff connections
        quiz.connections.staff.forEach((res) => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        });

        quiz.connections.player.forEach((res) => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        });

        res.status(200).json({ message: "Answer revealed to all displays" });
    } catch (err) {
        console.error("Error in showAnswer:", err);
        res.status(500).json({ message: "Server error" });
    }
};

const pauseAudio = async (req, res) => {
    try {
        const hostId = req.id;

        // Make sure quiz exists
        const quiz = quizzes[hostId];
        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        // ✅ Notify all displays that the answer can now be lockn
        const payload = {
            type: "PAUSE_AUDIO"
        };

        // Send to displays
        quiz.connections.displays.forEach((res) => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        });


        res.status(200).json({ message: "Audio paused" });
    } catch (err) {
        console.error("Error in showAnswer:", err);
        res.status(500).json({ message: "Server error" });
    }
};

const showAnswer = async (req, res) => {
    try {
        const hostId = req.id;

        // Make sure quiz exists
        const quiz = quizzes[hostId];
        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        // Make sure there’s an active question
        if (!quiz.data.currentQuestion) {
            return res.status(400).json({ message: "No active question to show answer for" });
        }

        // ✅ Notify all displays that the answer can now be shown
        const payload = {
            type: "SHOW_ANSWER",
            questionId: quiz.data.currentQuestion._id
        };

        // Send to displays
        quiz.connections.displays.forEach((res) => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        });

        // Optionally, also send to staff connections
        quiz.connections.staff.forEach((res) => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        });

        res.status(200).json({ message: "Answer revealed to all displays" });
    } catch (err) {
        console.error("Error in showAnswer:", err);
        res.status(500).json({ message: "Server error" });
    }
};

const buildLeaderboard = (quiz) => {
    const leaderboardMap = {};

    // Loop over all questions
    Object.values(quiz.data.answers).forEach((answersArray) => {
        answersArray.forEach((answer) => {
            if (!answer.judged) return; // only count judged answers

            const { teamId, teamName, pointsGranted } = answer;

            if (!leaderboardMap[teamId]) {
                leaderboardMap[teamId] = {
                    teamId,
                    teamName,
                    totalPoints: 0
                };
            }

            leaderboardMap[teamId].totalPoints += Number(pointsGranted) || 0;
        });
    });

    // Convert to array + sort descending
    const array = Object.values(leaderboardMap).sort(
        (a, b) => b.totalPoints - a.totalPoints
    );
    return [...array]
};

const setActiveQuestion = async (req, res) => {
    try {
        const hostId = req.id;
        const { questionId } = req.body;

        if (!quizzes[hostId]) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        const quiz = quizzes[hostId];

        // Fetch question from DB
        const question = await Question.findById(questionId).lean();
        if (!question) {
            return res.status(404).json({ message: "Question not found" });
        }

        question.currentlyLocked = false

        // Set as current question
        quiz.data.currentQuestion = question;
        quiz.data.answers[question._id] = []

        // Prepare payload for SSE
        const payload = {
            type: "QUESTION_UPDATE",
            question: {
                _id: question._id,
                category: question.category,
                type: question.type,
                question: question.question.en || question.question,
                options: question.options || [],
                correctAnswer: question.correctAnswer || [],
                defaultPoints: question.defaultPoints,
                description: question.description || "",
                currentAnswers: quiz.data.answers[question._id],
                currentlyLocked: question.currentlyLocked || false,
                media: question.media || {}
            }
        };

        // Broadcast to displays and staff
        [...quiz.connections.displays, ...quiz.connections.staff].forEach((res) => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        });

        const playerPayload = {
            type: "QUESTION_UPDATE",
            question: {
                _id: question._id,
                category: question.category,
                type: question.type,
                question: question.question.en || question.question,
                options: question.options || [],
                description: question.description || "",
                currentlyLocked: question.currentlyLocked || false,
                media: {
                    showFile: question.media?.showFile,
                    showAudio: question.media?.showAudio
                }
            }
        }

        quiz.connections.player.forEach((res) => {
            res.write(`data: ${JSON.stringify(playerPayload)}\n\n`);
        });

        return res.status(200).json({ message: "Question activated", questionId });

    } catch (err) {
        console.error("setActiveQuestion error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const submitAnswer = async (req, res) => {
    try {
        const { quizId, questionId, answer } = req.body
        const quiz = Object.values(quizzes).find(q => q.quizId === quizId)

        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        const currentAnswers = quiz.data.answers[questionId]
        if (currentAnswers.some(ca => ca.teamId === req.id)) {
            if (quiz.data.currentQuestion.type === 'bidding') {
                if (currentAnswers.some(a => a.answer === answer)) return
            } else return res.status(409).json({ 'message': "You already submitted an answer" })
        }

        const answerData = {
            teamId: req.id,
            teamName: req.user,
            answer,
            judged: false,
            pointsGranted: 0
        }

        if (quiz.data.currentQuestion.type === 'multiple') {
            const correctAnswers = quiz.data.currentQuestion.correctAnswer || [];
            const matched = correctAnswers.find(opt =>
                opt.text === answerData.answer
            );

            answerData.recommendedPoints = matched ? matched.points : 0;
        } else if (quiz.data.currentQuestion.type === 'open') {
            answerData.correctAnswer = quiz.data.currentQuestion.correctAnswer[0]
            answerData.recommendedPoints = quiz.data.currentQuestion.defaultPoints
        }

        quiz.data.answers[questionId].push(answerData)

        const payload = {
            type: "ANSWER_UPDATE",
            answers: quiz.data.answers[questionId],
        };

        if (quiz.data.currentQuestion.type === 'bidding') {
            const answers = quiz.data.answers[questionId];

            const numericAnswers = answers.map(a => ({
                ...a,
                numericBid: Number(a.answer) || 0
            }));

            // Determine rule: highest or lowest wins
            const rule = quiz.data.currentQuestion.correctAnswer?.[0];
            const highestWins = rule === 'highest';

            // Compute highest bid for display
            const highestBid = Math.max(...numericAnswers.map(a => a.numericBid));

            const highestBidPayload = {
                type: "ANSWER_UPDATE",
                highestBid,
            };

            // Send ONLY highest bid to displays + players
            [...quiz.connections.displays, ...quiz.connections.player].forEach((res) => {
                res.write(`data: ${JSON.stringify(highestBidPayload)}\n\n`);
            });

            // Sort for staff
            const sortedAnswers = numericAnswers.sort((a, b) => {
                return highestWins
                    ? b.numericBid - a.numericBid   // highest first
                    : a.numericBid - b.numericBid;  // lowest first
            });

            const staffPayload = {
                type: "ANSWER_UPDATE",
                answers: sortedAnswers,
                rule: highestWins ? "highest" : "lowest"
            };

            // Send sorted answers to staff
            quiz.connections.staff.forEach((res) => {
                res.write(`data: ${JSON.stringify(staffPayload)}\n\n`);
            });
        } else {
            [...quiz.connections.displays, ...quiz.connections.staff].forEach((res) => {
                res.write(`data: ${JSON.stringify(payload)}\n\n`);
            });
        }

        return res.status(200).json({ message: "Answer submitted" });
    } catch (error) {
        console.log(error)
    }
}

const judgeAnswer = async (req, res) => {
    try {
        const { questionId, teamId, pointsGranted } = req.body;
        const quiz = quizzes[req.id];

        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        const answers = quiz.data.answers[questionId];

        if (!answers) {
            return res.status(404).json({ message: "No answers for this question" });
        }

        // 🔍 Find the answer
        const answer = answers.find(a => a.teamId === teamId);

        if (!answer) {
            return res.status(404).json({ message: "Answer not found" });
        }

        // ✅ Update answer
        answer.judged = true;
        answer.pointsGranted = Number(pointsGranted) || 0

        if (quiz.data.currentQuestion.type === 'bidding') {
            const answers = quiz.data.answers[questionId];

            const numericAnswers = answers.map(a => ({
                ...a,
                numericBid: Number(a.answer) || 0
            }));
            // Determine rule: highest or lowest wins
            const rule = quiz.data.currentQuestion.correctAnswer?.[0];
            const highestWins = rule === 'highest';

            // Compute highest bid for display
            const highestBid = Math.max(...numericAnswers.map(a => a.numericBid));

            const highestBidPayload = {
                type: "ANSWER_UPDATE",
                highestBid,
            };

            // Send ONLY highest bid to displays + players
            [...quiz.connections.displays, ...quiz.connections.player].forEach((res) => {
                res.write(`data: ${JSON.stringify(highestBidPayload)}\n\n`);
            });

            // Sort for staff
            const sortedAnswers = numericAnswers.sort((a, b) => {
                return highestWins
                    ? b.numericBid - a.numericBid   // highest first
                    : a.numericBid - b.numericBid;  // lowest first
            });

            const staffPayload = {
                type: "ANSWER_UPDATE",
                answers: sortedAnswers,
                rule: highestWins ? "highest" : "lowest"
            };

            // Send sorted answers to staff
            quiz.connections.staff.forEach((res) => {
                res.write(`data: ${JSON.stringify(staffPayload)}\n\n`);
            });
        } else {
            const payload = {
                type: "ANSWER_UPDATE",
                answers: quiz.data.answers[questionId],
            };

            [...quiz.connections.displays, ...quiz.connections.staff].forEach((conn) => {
                conn.write(`data: ${JSON.stringify(payload)}\n\n`);
            });
        }


        const leaderboard = buildLeaderboard(quiz);

        const leaderPayload = {
            type: "LEADERBOARD_UPDATE",
            leaderboard
        };

        quiz.connections.staff
            .forEach((conn) => {
                conn.write(`data: ${JSON.stringify(leaderPayload)}\n\n`);
            });

        return res.status(200).json({
            message: "Answer judged",
            answer
        });

    } catch (error) {
        console.error("judgeAnswer error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

const showLeaderboard = async (req, res) => {
    try {
        const quiz = quizzes[req.id];

        if (!quiz) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        const leaderboard = buildLeaderboard(quiz);

        const payload = {
            type: "LEADERBOARD_UPDATE",
            leaderboard
        };

        quiz.connections.displays.forEach((conn) => {
            conn.write(`data: ${JSON.stringify(payload)}\n\n`);
        });
    } catch (error) {
        console.log(error)
    }
}

module.exports = {
    startQuiz,
    streamQuiz,
    setActiveQuestion,
    showAnswer,
    lockQuestion,
    submitAnswer,
    judgeAnswer,
    showLeaderboard,
    pauseAudio
}

