const User = require('../../model/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const handleLogin = async (req, res) => {
    const cookies = req.cookies;
    const { username: user, password: pwd } = req.body;

    if (!user || !pwd) return res.status(400).json({ 'message': 'Username and password are required.' });

    // 1. Find the user in either collection
    const foundUser = await User.findOne({ username: user.toLowerCase() }).exec();
    const foundPass = foundUser?.password;

    if (!foundUser || !foundPass && process.env.NODE_ENV === 'dev') console.log('blocking in authController');
    if (!foundUser || !foundPass) return res.sendStatus(401);

    // 2. Evaluate password 
    const match = await bcrypt.compare(pwd, foundPass);

    if (match) {
        const roles = Object.values(foundUser.roles).filter(Boolean);
        const username = foundUser.username;
        const displayName = foundUser.displayName ?? foundUser.username
        const lang = foundUser.lang;

        // Create JWTs
        const accessToken = jwt.sign(
            { "UserInfo": { "username": username.toLowerCase(), "displayName": displayName, "roles": roles, "id": foundUser._id.toString() } },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: '15m' }
        );
        const newRefreshToken = jwt.sign(
            { "username": username, "displayName": displayName },
            process.env.REFRESH_TOKEN_SECRET,
            { expiresIn: '1d' }
        );

        // 3. Handle Refresh Token Array safely
        let currentRTs = Array.isArray(foundUser.refreshToken) ? foundUser.refreshToken : [];

        // If there's an existing cookie, we remove it from the array so we don't duplicate it
        // or keep an old, invalid version of it.
        let newRefreshTokenArray = cookies?.jwt
            ? currentRTs.filter(rt => rt !== cookies.jwt)
            : currentRTs;

        const COOKIE_OPTIONS = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
            maxAge: 24 * 60 * 60 * 1000
        };

        // If there was a cookie but it wasn't in our DB, that's suspicious, 
        // but we only wipe the array if we are CERTAIN it's a reuse case.
        // For now, let's keep other devices safe:
        if (cookies?.jwt) {
            res.clearCookie('jwt', COOKIE_OPTIONS);
        }

        // 4. Update the user document
        // We PUSH the new token rather than just setting a filtered array
        // to be extra safe, but spreading into a $set works too.
        const result = await User.findByIdAndUpdate(
            foundUser._id,
            { $set: { refreshToken: [...newRefreshTokenArray, newRefreshToken] } },
            { new: true }
        );

        res.cookie('jwt', newRefreshToken, COOKIE_OPTIONS);

        res.json({ roles, username, displayName, accessToken, id: result._id });
    } else {
        res.sendStatus(401);
    }
}

module.exports = { handleLogin };