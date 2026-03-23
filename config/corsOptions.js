const allowedOrigins = require('./allowedOrigins');

const corsOptions = {
    origin: (origin, callback) => {
        // !origin allows tools like Postman or mobile apps to hit the API
        if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
            callback(null, true)
        } else {
            console.log(`Cors blocking ${origin}`)
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // <--- CRITICAL: This allows the browser to send the JWT cookie
    optionsSuccessStatus: 200
}

module.exports = corsOptions;