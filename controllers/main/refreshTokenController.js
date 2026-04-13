const User = require('../../model/User');
const jwt = require('jsonwebtoken');

const handleRefreshToken = async (req, res) => {
    const cookies = req.cookies;
    if (!cookies?.jwt && process.env.NODE_ENV === 'dev') console.log('refresh token block: no cookies')
    if (!cookies?.jwt) return res.sendStatus(401);

    const refreshToken = cookies.jwt;

    // Look for the user in both collections
    const foundUser = await User.findOne({ refreshToken: refreshToken }).exec();

    // Token reuse or invalid session
    if (!foundUser || !foundUser.refreshToken.includes(refreshToken)) {
        if (process.env.NODE_ENV === 'dev') console.log('refresh block moment 1')
        return res.sendStatus(403);
    }
    const newRefreshTokenArray = foundUser.refreshToken.filter(rt => rt !== refreshToken);

    // Verify token
    jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET,
        async (err, decoded) => {
            if (err) {
                // If expired, remove specifically this token from the array
                await foundUser.constructor.findOneAndUpdate(
                    { _id: foundUser._id },
                    { $set: { refreshToken: newRefreshTokenArray } }
                );
                return res.sendStatus(403);
            }

            if (foundUser.username !== decoded.username) return res.sendStatus(403);

            // Token is valid - Generate New Tokens
            const roles = Object.values(foundUser.roles).filter(Boolean);

            const displayName = foundUser.displayName ?? decoded.username

            const accessToken = jwt.sign(
                { "UserInfo": { "username": decoded.username, "displayName": displayName, "roles": roles, "id": foundUser._id } },
                process.env.ACCESS_TOKEN_SECRET,
                { expiresIn: '60m' }
            );

            const newRefreshToken = jwt.sign(
                { "username": foundUser.username },
                process.env.REFRESH_TOKEN_SECRET,
                { expiresIn: '1d' }
            );

            // ATOMIC UPDATE: This prevents the VersionError (Optimistic Concurrency Control)
            await foundUser.constructor.findOneAndUpdate(
                { _id: foundUser._id },
                { $set: { refreshToken: [...newRefreshTokenArray, newRefreshToken] } }
            );

            const COOKIE_OPTIONS = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
                maxAge: 24 * 60 * 60 * 1000
            };

            res.cookie('jwt', newRefreshToken, COOKIE_OPTIONS);

            res.json({
                roles,
                username: foundUser.username,
                displayName: displayName,
                id: foundUser._id,
                lang: foundUser.lang,
                accessToken
            });
        }
    );
}

module.exports = { handleRefreshToken };