const { loginParticipant } = require("../services/authService");

async function login(req, res) {
    const { email, password } = req.body;
    const result = await loginParticipant(email, password);

    res.json(result);
}

module.exports = { login };
