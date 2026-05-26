const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AnnotationSchema = new mongoose.Schema({
    filePath: {
        type: String,
        required: true,
        unique: true, // Ensures one document per file, keeping all its markers centralized
        index: true   // Speeds up lookups on deep file paths
    },
    annotations: [
        {
            id: { type: String, required: true },
            type: { type: String, required: true }, // e.g., 'critical_temp'
            x: { type: Number, required: true },    // Time coordinate (s)
            y: { type: Number, required: true },    // Value coordinate (°C / mbar)
            axis_unit: { type: String, required: true },
            timestamp: { type: Number, default: () => Date.now() }
        }
    ]
}, { 
    timestamps: true // Automatically tracks createdAt and updatedAt lifecycle milestones
});

module.exports = mongoose.model('Annotation', AnnotationSchema);