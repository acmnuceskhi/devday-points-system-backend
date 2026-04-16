async function sendSignupOtpEmail({ toEmail, fullName, signupLink, expiresInMinutes }) {
    return { delivered: false, reason: "SMTP_NOT_CONFIGURED" };
}

module.exports = {
    sendSignupOtpEmail,
};
