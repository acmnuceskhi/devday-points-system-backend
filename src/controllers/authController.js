const { loginParticipant, loginAdmin } = require("../services/authService");

async function login(req, res) {
    const { email, password } = req.body;
    const result = await loginParticipant(email, password);

    res.json(result);
}

async function adminLogin(req, res) {
    const { email, password } = req.body;
    const result = await loginAdmin(email, password);

    res.json(result);
}

module.exports = { login, adminLogin };
