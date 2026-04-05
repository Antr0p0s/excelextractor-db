const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const questionSchema = new Schema({
    question: {
        nl: {
            type: String,
            required: true
        },
        en: {
            type: String,
            required: true
        }
    },
    type: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: false
    },
    createdBy: {
        type: String,
        required: true
    },
    createdById: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    defaultPoints: { //open question
        type: Number,
        required: false
    },
    correctAnswer: { //open question
        type: Array,
        required: true
    },
    options: { //multiple choice
        type: Array,
        required: false
    },
    media: {
        type: Object
    },
    answers: {
        type: Map,
        of: Object,
        default: {}
    }
});

module.exports = mongoose.model('Question', questionSchema);