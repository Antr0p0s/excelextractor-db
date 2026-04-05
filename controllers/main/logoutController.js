const User = require('../../model/User');
const logEvents = require('../../middleware/logEvents').logEvents;


const handleLogout = async (req, res) => {
    console.log('hmm')
    logEvents(req, { user: req.body.username });
    // On client, also delete the accessToken

    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(204); //No content
    const refreshToken = cookies.jwt;

    // Is refreshToken in db?
    const foundUser = await User.findOne({ refreshToken }).exec();
    console.log(foundUser)
    if (!foundUser) {
        res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: process.env.NODE_ENV === "production" });
        return res.sendStatus(204);
    }

    // Delete refreshToken in db
    foundUser.refreshToken = foundUser.refreshToken.filter(rt => rt !== refreshToken);;
    await foundUser.save();

    res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: process.env.NODE_ENV === "production" });
    res.sendStatus(204);
}

module.exports = { handleLogout }