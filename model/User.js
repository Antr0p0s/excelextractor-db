const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    username: {
        type: String,
        required: true
    },
    displayName: {
        type: String,
        required: true
    },
    roles: {
        User: Number,
        QuizUser: Number,
        Admin: Number
    },
    password: {
        type: String,
        required: true
    },
    createMoment: {
        type: Number,
        required: true
    },
    refreshToken: [String]
});

module.exports = mongoose.model('User', userSchema);