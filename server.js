const buffer = require('buffer');
if (typeof buffer.SlowBuffer === 'undefined') {
    buffer.SlowBuffer = class {}; 
    buffer.SlowBuffer.prototype = {};
}

const express = require('express');
const app = express();
const path = require('path');
const cors = require('cors');
const corsOptions = require('./config/corsOptions');
const errorHandler = require('./middleware/errorHandler');
const verifyJWT = require('./middleware/verifyJWT');
const cookieParser = require('cookie-parser');
const credentials = require('./middleware/credentials');
const { logger } = require('./middleware/devLogger');
const mongoose = require('mongoose');
const connectBixDB = require('./config/dbConn');
const PORT = process.env.PORT || 3500;

// Connect to MongoDB
mongoose.set('strictQuery', false);
connectBixDB();
 
// Handle options credentials check - before CORS!
// and fetch cookies credentials requirement
app.use(credentials);

// Cross Origin Resource Sharing
app.use(cors(corsOptions));

// built-in middleware to handle urlencoded form data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// built-in middleware for json 
app.use(express.json());

//middleware for cookies
app.use(cookieParser());

app.use(logger)

//serve static files
app.use('/', express.static(path.join(__dirname, '/public')));



// public routes --------------------------------------------
app.use('/public/auth', require('./routes/public/auth'));
app.use('/public/register', require('./routes/public/register'));
app.use('/public/refresh', require('./routes/refresh'));
app.use('/public/logout', require('./routes/logout'));

// stage route
app.use('/skipauth/stage', require('./routes/private/stagestream'))

// private routes --------------------------------------------
app.use(verifyJWT);
app.use('/private/change-password', require('./routes/private/user'));
app.use('/private/sets', require('./routes/private/sets'));
app.use('/private/pubquiz', require('./routes/private/pubquiz'))
app.use('/private/stage', require('./routes/private/stage'))




app.all('*', (req, res) => {
    res.status(404);
    if (req.accepts('html')) {
        res.sendFile(path.join(__dirname, 'views', '404.html'));
    } else if (req.accepts('json')) {
        res.json({ "error": "404 Not Found" });
    } else {
        res.type('txt').send("404 Not Found");
    }
});

app.use(errorHandler);

mongoose.connection.once('open', () => {
    console.log('Connected to MongoDB');
    const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    server.timeout = 300000;
});