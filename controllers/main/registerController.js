const User = require('../../model/User');
const bcrypt = require('bcrypt');
const logEvents = require('../../middleware/logEvents').logEvents;

const handleNewUser = async (req, res) => {
    // req.body is now available because middleware runs first
    logEvents(req, { hasPassword: true, user: req.body.displayName });

    const { displayName, password, type } = req.body;

    if (!displayName || !password || !type) {
        return res
            .status(400)
            .json({ message: 'Username and password are required.' });
    }

    const username = displayName.toLowerCase()

    const duplicate = await User.findOne({ username: username }).exec();
    if (duplicate) return res
        .status(409)
        .json({ message: 'Username already in use.' });

    try {
        //encrypt the password
        const hashedPwd = await bcrypt.hash(password, 10);

        const roles = getRoles(type)

        //create and store the new user
        const result = await User.create({
            "username": username,
            "displayName": displayName,
            "password": hashedPwd,
            "createMoment": new Date().getTime(),
            "roles": roles
        });

        res.status(201).json(result._id);
    } catch (err) {
        res.status(500).json({ 'message': err.message });
    }
}

const getRoles = (type) => {
    if (type === 'excel') return { ExcelUser: 2001 }
    if (type === 'quiz') return { QuizUser: 2002 }
}

module.exports = { handleNewUser };