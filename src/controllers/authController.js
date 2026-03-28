const {
    loginParticipant,
    loginAdmin,
    requestParticipantSignup,
    verifyParticipantSignup,
} = require("../services/authService");

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

async function signupRequest(req, res) {
    const result = await requestParticipantSignup(req.body.email, req.body.fullName, req.ip);
    res.status(200).json(result);
}

async function signupVerify(req, res) {
    const result = await verifyParticipantSignup(req.body.email, req.body.token, req.body.password);
    res.status(200).json(result);
}

module.exports = { login, adminLogin, signupRequest, signupVerify };
