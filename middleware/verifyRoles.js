const verifyRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req?.roles && process.env.NODE_ENV === 'dev') console.log('Blocking in verifyRoles 1');
        if (!req?.roles) return res.sendStatus(401);
        const rolesArray = [...allowedRoles];
        const result = req.roles.map(role => rolesArray.includes(role)).find(val => val === true);
        if (!result && process.env.NODE_ENV === 'dev') console.log('Blocking in verifyRoles 2');
        if (!result) return res.sendStatus(401);
        next();
    }
}

module.exports = verifyRoles