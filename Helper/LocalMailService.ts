import nodemailer, { Transporter } from 'nodemailer';
import { config } from 'dotenv';
import { Config } from '@/config';
import { Logger } from '@/Helper/Logger';

// Load environment variables
config();

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

class LocalMailService {
  private transporter: Transporter | null = null;
  private static instance: LocalMailService;
  private fromEmail: string;
  private fromName: string;

  private constructor() {
    try {
      this.fromEmail = Config.getInstance().smtp.fromEmail;
      this.fromName = Config.getInstance().smtp.fromName;
      Logger.info('LocalMailService initialized successfully');
    } catch (error: any) {
      Logger.error('Failed to initialize LocalMailService', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to initialize LocalMailService');
    }
  }

  public static getInstance(): LocalMailService {
    if (!LocalMailService.instance) {
      LocalMailService.instance = new LocalMailService();
      Logger.info('New LocalMailService instance created', {
        fromEmail: Config.getInstance().mail.fromEmail,
        fromName: Config.getInstance().mail.fromName
      });
    }
    return LocalMailService.instance;
  }

  // Initialize the Nodemailer transporter with local SMTP settings
  private async initializeTransporter(): Promise<void> {
    Logger.info('Initializing Local SMTP transporter');
    try {
      // Get SMTP settings from environment variables
      const host = Config.getInstance().smtp.host;
      const port = Config.getInstance().smtp.port;
      const secure = Config.getInstance().smtp.secure;
      const user = Config.getInstance().smtp.user;
      const pass = Config.getInstance().smtp.password;

      if (!host || !user || !pass) {
        throw new Error('Missing required SMTP configuration');
      }

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });

      // Verify SMTP connection configuration
      await this.transporter.verify();
      Logger.info('Local SMTP transporter initialized and verified successfully', {
        host,
        port,
        secure
      });
    } catch (error: any) {
      Logger.error('Failed to initialize Local SMTP transporter', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to initialize transporter: ${error.message}`);
    }
  }

  // Send an email
  public async sendEmail(options: EmailOptions): Promise<void> {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: options.text || '',
        html: options.html || '',
      };

      const result = await this.transporter!.sendMail(mailOptions);
      Logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
        response: result.response,
        messageId: result.messageId
      });
    } catch (error: any) {
      Logger.error('Failed to send email', {
        to: options.to,
        subject: options.subject,
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  // Send a verification email
  public async sendVerificationEmail(to: string, verificationCode: string): Promise<void> {
    try {
      const subject = 'Verify Your Email';
      const text = `Please verify your email by using the code: ${verificationCode}`;
      const html = `<p>Please verify your email by using the code: <strong>${verificationCode}</strong></p>`;

      await this.sendEmail({
        to,
        subject,
        text,
        html,
      });

      Logger.info('Verification email sent successfully', {
        to,
        verificationCode
      });
    } catch (error: any) {
      Logger.error('Failed to send verification email', {
        to,
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to send verification email: ${error.message}`);
    }
  }

  public async sendPasswordResetEmail(email: string, name: string | undefined, resetCode: string): Promise<void> {
    try {
      const subject = 'Your Password Reset Code';
      const html = `<p>Your password reset code is: <strong>${resetCode}</strong></p><p>Please enter this code to reset your password. It expires in 1 hour.</p>`;
      const text = `Your password reset code is: ${resetCode}\nPlease enter this code to reset your password. It expires in 1 hour.`;

      await this.sendEmail({
        to: email,
        subject,
        text,
        html,
      });

      Logger.info('Password reset email sent successfully', {
        to: email,
        name: name || 'Unknown'
      });
    } catch (error: any) {
      Logger.error('Failed to send password reset email', {
        to: email,
        name: name || 'Unknown',
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
  }
}

export default LocalMailService;
