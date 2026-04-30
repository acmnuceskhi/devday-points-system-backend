const nodemailer = require("nodemailer");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const { env } = require("../config/env");

// --- Gmail SMTP round-robin pool ---
let pool = null;
let idx = 0;

function buildTransporterPool() {
    const accounts = env.SMTP_ACCOUNTS;

    if (accounts && accounts.length > 0) {
        return accounts
            .filter((a) => a.user && a.pass)
            .map((a) => ({
                fromEmail: a.fromEmail || a.user,
                transporter: nodemailer.createTransport({
                    host: env.SMTP_HOST,
                    port: env.SMTP_PORT,
                    secure: env.SMTP_SECURE,
                    auth: { user: a.user, pass: a.pass },
                }),
            }));
    }

    if (!env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM_EMAIL) {
        return [];
    }

    return [
        {
            fromEmail: env.SMTP_FROM_EMAIL,
            transporter: nodemailer.createTransport({
                host: env.SMTP_HOST,
                port: env.SMTP_PORT,
                secure: env.SMTP_SECURE,
                auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
            }),
        },
    ];
}

function getNextSender() {
    if (!pool) pool = buildTransporterPool();
    if (pool.length === 0) return null;
    const sender = pool[idx % pool.length];
    idx++;
    return sender;
}

// --- AWS SES fallback ---
let sesClient = null;

function getSesClient() {
    if (sesClient) return sesClient;
    if (!env.AWS_REGION || !env.SES_FROM_EMAIL) return null;
    sesClient = new SESClient({ region: env.AWS_REGION });
    return sesClient;
}

async function sendViaSes({ toEmail, subject, text, html }) {
    const ses = getSesClient();
    if (!ses) return false;
    await ses.send(
        new SendEmailCommand({
            Source: `${env.SMTP_FROM_NAME} <${env.SES_FROM_EMAIL}>`,
            Destination: { ToAddresses: [toEmail] },
            Message: {
                Subject: { Data: subject },
                Body: {
                    Text: { Data: text },
                    Html: { Data: html },
                },
            },
        })
    );
    return true;
}

// --- Public API ---
async function sendSignupOtpEmail({ toEmail, fullName, signupLink, expiresInMinutes }) {
    const safeName = String(fullName || "Participant").trim() || "Participant";
    const safeEmail = String(toEmail || "").trim();

    const subject = "DevDay 2026 Signup Verification";
    const text = [
        `Hello ${safeName},`,
        "",
        "Use the link below to complete your participant signup:",
        signupLink,
        "",
        `This link expires in ${expiresInMinutes} minutes.`,
        "If you did not request this, you can ignore this message.",
        "",
        "DevDay 2026",
    ].join("\n");
    const html = `
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
    `;

    // Try Gmail round-robin first
    const sender = getNextSender();
    if (sender) {
        try {
            await sender.transporter.sendMail({
                from: `${env.SMTP_FROM_NAME} <${sender.fromEmail}>`,
                to: safeEmail,
                subject,
                text,
                html,
            });
            return { delivered: true };
        } catch {
            // SMTP failed — fall through to SES
        }
    }

    // SES fallback
    try {
        const sent = await sendViaSes({ toEmail: safeEmail, subject, text, html });
        if (sent) return { delivered: true };
    } catch {
        // SES also failed
    }

    return { delivered: false, reason: "ALL_SENDERS_FAILED" };
}

module.exports = { sendSignupOtpEmail };
