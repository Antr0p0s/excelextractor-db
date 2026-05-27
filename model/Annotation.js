const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AnnotationSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    filePath: { type: String, required: true },
    x: { type: Number, required: true },    
    y: { type: Number, required: true },    
    traceKey: { type: String, required: true },    
    axis_unit: { type: String, required: true },
    timestamp: { type: Number, default: () => Date.now() }
});

module.exports = mongoose.model('Annotation', AnnotationSchema);