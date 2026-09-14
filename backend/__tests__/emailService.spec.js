const nodemailer = require('nodemailer');
const { getTransporter, verifySmtpConnection, sendOtpEmail } = require('../services/emailService');

jest.mock('nodemailer');

describe('emailService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_PORT;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.EMAIL_SERVICE;
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getTransporter()', () => {
    it('returns null when no SMTP credentials exist in environment', () => {
      const transporter = getTransporter();
      expect(transporter).toBeNull();
    });

    it('creates nodemailer transport when SMTP env vars are provided', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASSWORD = 'secretpassword';

      const mockTransport = { verify: jest.fn(), sendMail: jest.fn() };
      nodemailer.createTransport.mockReturnValue(mockTransport);

      const transporter = getTransporter();
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: { user: 'test@example.com', pass: 'secretpassword' },
        })
      );
      expect(transporter).toBe(mockTransport);
    });

    it('supports fallback EMAIL_* environment variables', () => {
      process.env.EMAIL_HOST = 'smtp.legacy.com';
      process.env.EMAIL_PORT = '465';
      process.env.EMAIL_USER = 'legacy@example.com';
      process.env.EMAIL_PASS = 'legacypass';

      const mockTransport = { verify: jest.fn(), sendMail: jest.fn() };
      nodemailer.createTransport.mockReturnValue(mockTransport);

      const transporter = getTransporter();
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.legacy.com',
          port: 465,
          secure: true,
          auth: { user: 'legacy@example.com', pass: 'legacypass' },
        })
      );
      expect(transporter).toBe(mockTransport);
    });
  });

  describe('verifySmtpConnection()', () => {
    it('returns configured: false when credentials are missing', async () => {
      const status = await verifySmtpConnection();
      expect(status.connected).toBe(false);
      expect(status.configured).toBe(false);
    });

    it('returns connected: true when transporter verify succeeds', async () => {
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASSWORD = 'pass';

      const mockTransport = { verify: jest.fn().mockResolvedValue(true) };
      nodemailer.createTransport.mockReturnValue(mockTransport);

      const status = await verifySmtpConnection();
      expect(status.connected).toBe(true);
      expect(status.configured).toBe(true);
      expect(status.message).toContain('verified successfully');
    });

    it('classifies auth failure when verify rejects with 535', async () => {
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASSWORD = 'wrongpass';

      const mockTransport = { verify: jest.fn().mockRejectedValue(new Error('Invalid login 535')) };
      nodemailer.createTransport.mockReturnValue(mockTransport);

      const status = await verifySmtpConnection();
      expect(status.connected).toBe(false);
      expect(status.configured).toBe(true);
      expect(status.message).toContain('SMTP authentication failed');
    });
  });

  describe('sendOtpEmail()', () => {
    it('sends email with correct subject and HTML content via Nodemailer', async () => {
      process.env.SMTP_USER = 'sender@example.com';
      process.env.SMTP_PASSWORD = 'pass';
      process.env.SMTP_FROM = 'Fusion Electronics <sender@example.com>';

      const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'msg-12345' });
      nodemailer.createTransport.mockReturnValue({ sendMail: sendMailMock });

      const result = await sendOtpEmail('user@test.com', '654321', 'John Doe');

      expect(result.sent).toBe(true);
      expect(result.messageId).toBe('msg-12345');
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Fusion Electronics <sender@example.com>',
          to: 'user@test.com',
          subject: '654321 is your Fusion Electronics verification code',
          html: expect.stringContaining('654321'),
        })
      );
      expect(sendMailMock.mock.calls[0][0].html).toContain('Email Verification Code');
      expect(sendMailMock.mock.calls[0][0].html).toContain('Valid for 10 minutes');
      expect(sendMailMock.mock.calls[0][0].html).not.toContain('Developer OTP');
    });

    it('handles SMTP delivery failure gracefully with classified reason', async () => {
      process.env.SMTP_USER = 'sender@example.com';
      process.env.SMTP_PASSWORD = 'pass';

      const sendMailMock = jest.fn().mockRejectedValue(new Error('ETIMEDOUT Connection timeout'));
      nodemailer.createTransport.mockReturnValue({ sendMail: sendMailMock });

      const result = await sendOtpEmail('user@test.com', '112233', 'Jane');

      expect(result.sent).toBe(false);
      expect(result.error).toBe('ETIMEDOUT Connection timeout');
      expect(result.reason).toContain('SMTP connection timeout');
    });
  });
});
