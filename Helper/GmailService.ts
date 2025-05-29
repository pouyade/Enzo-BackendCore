import nodemailer, { Transporter } from 'nodemailer';
import { google, Auth } from 'googleapis';
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

class GmailService {
  private oauth2Client: Auth.OAuth2Client;
  private transporter: Transporter | null = null;
  private static instance: GmailService;
  private readonly user: string;

  private constructor() {
    try {
      // Initialize OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        Config.getInstance().gmail.clientId,
        Config.getInstance().gmail.clientSecret,
        Config.getInstance().gmail.redirectUrl,
      );
      

      this.user = Config.getInstance().gmail.user;
      // Set refresh token
      this.oauth2Client.setCredentials({
        refresh_token: Config.getInstance().gmail.refreshToken,
      });

      Logger.info('GmailService initialized successfully');
    } catch (error: any) {
      Logger.error('Failed to initialize GmailService', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to initialize GmailService');
    }
  }

  public static getInstance(): GmailService {
    if (!GmailService.instance) {
      GmailService.instance = new GmailService();
      Logger.info('New GmailService instance created', {
        clientId: Config.getInstance().gmail.clientId,
        redirectUrl: Config.getInstance().gmail.redirectUrl,
        user: Config.getInstance().gmail.user
      });
    }
    return GmailService.instance;
  }

  // Initialize the Nodemailer transporter with OAuth2
  private async initializeTransporter(): Promise<void> {
    Logger.info('Initializing Gmail transporter');
    try {
      const { token } = await this.oauth2Client.getAccessToken();
      if (!token) {
        throw new Error('Failed to obtain access token');
      }
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: this.user,
          clientId: Config.getInstance().gmail.clientId,
          clientSecret: Config.getInstance().gmail.clientSecret,
          refreshToken: Config.getInstance().gmail.refreshToken,
          accessToken: token,
        },
      });

      Logger.info('Gmail transporter initialized successfully');
    } catch (error: any) {
      Logger.error('Failed to initialize Gmail transporter', {
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
        from: this.user,
        to: options.to,
        subject: options.subject,
        text: options.text || '',
        html: options.html || '',
      };

      const result = await this.transporter!.sendMail(mailOptions);
      Logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
        response: result.response
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

export default GmailService;