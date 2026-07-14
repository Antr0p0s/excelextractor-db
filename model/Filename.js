const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FilenameSchema = new Schema({
    originalName: {
        type: String,
        required: true
    },
    displayName: {
        type: String,
        required: true
    }
});

module.exports = mongoose.model('Filename', FilenameSchema);