const nodemailer = require("nodemailer");
const { env } = require("../config/env");

let transporter = null;

function getTransporter() {
    if (transporter) {
        return transporter;
    }

    if (!env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM_EMAIL) {
        return null;
    }

    transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
        },
        family: 4,            // Railway containers lack IPv6 routing; force IPv4
        connectionTimeout: 15000,
    });

    return transporter;
}

async function sendSignupOtpEmail({ toEmail, fullName, signupLink, expiresInMinutes }) {
    const mailTransporter = getTransporter();
    if (!mailTransporter) {
        return {
            delivered: false,
            reason: "SMTP_NOT_CONFIGURED",
        };
    }

    const safeName = String(fullName || "Participant").trim() || "Participant";
    const safeEmail = String(toEmail || "").trim();

    try {
        await mailTransporter.sendMail({
            from: `${env.SMTP_FROM_NAME} <${env.SMTP_FROM_EMAIL}>`,
            to: safeEmail,
            subject: "DevDay 2026 Signup Verification",
            text: [
                `Hello ${safeName},`,
                "",
                "Use the link below to complete your participant signup:",
                signupLink,
                "",
                `This link expires in ${expiresInMinutes} minutes.`,
                "If you did not request this, you can ignore this message.",
                "",
                "DevDay 2026",
            ].join("\n"),
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; line-height: 1.6;">
                <h2 style="margin-bottom: 8px;">DevDay 2026 Signup Verification</h2>
                <p>Hello <strong>${safeName}</strong>,</p>
                <p>Use the button below to complete your participant signup.</p>
                <p style="margin: 24px 0;">
                    <a href="${signupLink}" style="background:#d71d22;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">
                        Verify Signup
                    </a>
                </p>
                <p>This link expires in <strong>${expiresInMinutes} minutes</strong>.</p>
                <p>If you did not request this, you can ignore this message.</p>
                <p style="margin-top: 24px; color: #555;">DevDay 2026</p>
            </div>
        `,
        });
    } catch (error) {
        console.error(`[mailer] sendMail failed: ${error.message}`);
        return { delivered: false, reason: "SMTP_ERROR" };
    }

    return {
        delivered: true,
    };
}

module.exports = {
    sendSignupOtpEmail,
};
