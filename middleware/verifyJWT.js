const jwt = require('jsonwebtoken');
require('dotenv').config();

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query?.token) {
        token = req.query.token
    } else {
        if (process.env.NODE_ENV === 'dev') console.log('blocking in verifyJWT 1')
        return res.sendStatus(401);
    }

    jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET,
        (err, decoded) => {
            if (err && process.env.NODE_ENV === 'dev') console.log('blocking in verifyJWT 2')
            if (err) return res.sendStatus(403); //invalid token
            req.user = decoded.UserInfo.username;
            req.roles = decoded.UserInfo.roles;
            req.id = decoded.UserInfo.id
            next();
        }
    );
}

module.exports = verifyJWT