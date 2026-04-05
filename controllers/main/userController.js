const User = require('../../model/User');
const bcrypt = require('bcrypt')

const changePassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const reqId = req.id

    const user = await User.findById(req.id);
    if (!user) return res.sendStatus(404);

    const sameUser = reqId === user._id
    if (sameUser) return res.sendStatus(401).json({ message: "You can't edit other users passwords" })

    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) return res.status(401).json({ message: "Wrong password" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password updated" });
};

module.exports = {
    changePassword
}