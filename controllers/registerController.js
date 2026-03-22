const User = require('../model/User');
const bcrypt = require('bcrypt');
const logEvents = require('../middleware/logEvents').logEvents;

const handleNewUser = async (req, res) => {
    // req.body is now available because middleware runs first
    logEvents(req, { hasPassword: true, user: req.body.displayName });

    const { displayName, password } = req.body;

    if (!displayName || !password) {
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

        //create and store the new user
        const result = await User.create({
            "username": username,
            "displayName": displayName,
            "password": hashedPwd,
            "createMoment": new Date().getTime(),
            "roles": { User: 2001 }
        });

        res.status(201).json(result._id);
    } catch (err) {
        res.status(500).json({ 'message': err.message });
    }
}

module.exports = { handleNewUser };