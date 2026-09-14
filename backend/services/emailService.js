const nodemailer = require('nodemailer');

/**
 * Creates or returns the Nodemailer SMTP transporter.
 * Supports standard SMTP_* env vars (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_SECURE)
 * as well as fallback EMAIL_* env vars for backwards compatibility.
 */
function getTransporter() {
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  const port = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT, 10) || 587;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const service = process.env.EMAIL_SERVICE;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (!user || !pass) {
    return null;
  }

  try {
    let transportOptions;
    if (service) {
      transportOptions = {
        service,
        auth: { user, pass },
      };
    } else if (host) {
      transportOptions = {
        host,
        port,
        secure,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      };
    } else if (user.includes('@gmail.com')) {
      transportOptions = {
        service: 'gmail',
        auth: { user, pass },
      };
    } else {
      transportOptions = {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user, pass },
      };
    }

    return nodemailer.createTransport(transportOptions);
  } catch (err) {
    console.error('❌ [SMTP TRANSPORTER ERROR] Failed to create nodemailer transport:', err.message);
    return null;
  }
}

/**
 * Verify SMTP connection and authentication credentials.
 * @returns {Promise<object>} { connected: boolean, configured: boolean, message: string, error?: string }
 */
async function verifySmtpConnection() {
  const transport = getTransporter();
  if (!transport) {
    return {
      connected: false,
      configured: false,
      message: 'SMTP is not configured in environment variables. Specify SMTP_USER and SMTP_PASSWORD.',
    };
  }

  try {
    await transport.verify();
    return {
      connected: true,
      configured: true,
      message: 'SMTP connection and authentication verified successfully.',
    };
  } catch (err) {
    console.error('❌ [SMTP VERIFICATION FAILED]:', err.message);
    return {
      connected: false,
      configured: true,
      error: err.message,
      message: classifySmtpError(err),
    };
  }
}

/**
 * Helper to classify SMTP error messages into user-friendly diagnostic text.
 */
function classifySmtpError(err) {
  const msg = err.message || '';
  if (msg.includes('EAUTH') || msg.includes('535') || msg.includes('Invalid login') || msg.includes('Username and Password not accepted')) {
    return 'SMTP authentication failed. Check SMTP_USER and SMTP_PASSWORD / App Password.';
  }
  if (msg.includes('ENOTFOUND') || msg.includes('EDNS')) {
    return 'Invalid SMTP host. Could not resolve SMTP_HOST domain.';
  }
  if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('Connection timeout')) {
    return 'SMTP connection timeout or refused. Verify SMTP_HOST and SMTP_PORT.';
  }
  if (msg.includes('DEPTH_ZERO_SELF_SIGNED_CERT') || msg.includes('TLS')) {
    return 'SMTP TLS error. Verify SMTP_SECURE settings.';
  }
  return `SMTP Error: ${msg}`;
}

/**
 * Send a professional Email Verification Code via SMTP.
 * @param {string} to - Recipient email
 * @param {string} otp - Plain-text 6-digit verification code
 * @param {string} name - Recipient display name
 * @returns {Promise<object>} { sent: boolean, isDev: boolean, devOtp?: string, messageId?: string, error?: string }
 */
async function sendOtpEmail(to, otp, name = 'there') {
  const transport = getTransporter();
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER || 'noreply@fusion-electronics.com';

  if (!transport) {
    // Isolated local development fallback when SMTP credentials are not configured
    console.log('\n' + '='.repeat(60));
    console.log('⚠️  [SMTP NOT CONFIGURED - LOCAL DEV MODE]');
    console.log(`📬  Recipient : ${to}`);
    console.log(`🔑  Verification Code: ${otp}`);
    console.log('ℹ️   Configure SMTP_USER & SMTP_PASSWORD in backend/.env to send real emails.');
    console.log('='.repeat(60) + '\n');

    return {
      sent: false,
      isDev: true,
      devOtp: otp,
      reason: 'SMTP not configured in environment variables.',
    };
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #111827; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Fusion Electronics</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 6px; font-weight: 500;">Email Verification Code</p>
      </div>

      <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; padding: 28px; text-align: center;">
        <p style="color: #374151; font-size: 16px; margin: 0 0 12px; font-weight: 600;">Hi ${name},</p>
        <p style="color: #4b5563; font-size: 14px; margin: 0 0 24px; line-height: 1.5;">
          Thank you for signing up with <strong>Fusion Electronics</strong>. Use the verification code below to verify your email address and complete your account setup:
        </p>

        <div style="background: #ffffff; border: 2px dashed #2563eb; border-radius: 12px; padding: 18px 24px; display: inline-block; min-width: 220px; box-shadow: 0 2px 8px rgba(37,99,235,0.08);">
          <span style="font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #2563eb; font-family: 'Courier New', Courier, monospace;">${otp}</span>
        </div>

        <p style="color: #dc2626; font-size: 13px; margin: 20px 0 0; font-weight: 600;">
          ⏱️ Valid for 10 minutes
        </p>
      </div>

      <div style="margin-top: 24px; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 20px;">
        <p style="color: #9ca3af; font-size: 12px; margin: 12px 0 0; line-height: 1.4;">
          If you did not request this verification code, please ignore this email or contact support if you have concerns.
        </p>
        <p style="color: #9ca3af; font-size: 11px; margin-top: 16px;">
          &copy; ${new Date().getFullYear()} Fusion Electronics. All rights reserved.
        </p>
      </div>
    </div>
  `;

  try {
    const info = await transport.sendMail({
      from,
      to,
      subject: `${otp} is your Fusion Electronics verification code`,
      html,
    });

    console.log(`\n✅ [SMTP EMAIL DELIVERED] Email verification code sent to ${to} (Message ID: ${info.messageId})\n`);
    return { sent: true, isDev: false, messageId: info.messageId };
  } catch (err) {
    const diagnostic = classifySmtpError(err);
    console.error(`\n❌ [SMTP DELIVERY FAILED] Could not send verification code to ${to}:`, err.message);
    console.error(`ℹ️  Diagnostic: ${diagnostic}\n`);

    return {
      sent: false,
      isDev: false,
      error: err.message,
      reason: diagnostic,
    };
  }
}

module.exports = {
  getTransporter,
  verifySmtpConnection,
  sendOtpEmail,
};
