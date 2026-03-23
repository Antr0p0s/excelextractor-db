const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const setSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    ownerId: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true 
    },
    requirements: {
        type: [Object],
        required: true
    }
});

module.exports = mongoose.model('Set', setSchema);