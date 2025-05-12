import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import { Logger } from "@/Helper/Logger";
import { Config } from "@/config";
const { mailerSendApiKey, fromEmail, fromName } = Config.getInstance().mail;

interface EmailOptions {
  toEmail: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
}

class MailHelper {
  private static instance: MailHelper;
  private mailersend: MailerSend;
  private fromEmail: string;
  private fromName: string;

  private constructor( mailerSendApiKey: string, fromEmail: string, fromName: string ) {
    this.mailersend = new MailerSend({ apiKey: mailerSendApiKey });
    this.fromEmail = fromEmail;
    this.fromName = fromName;
  }


  public static getInstance(): MailHelper {
    if (!MailHelper.instance) {
      MailHelper.instance = new MailHelper(
        Config.getInstance().mail.mailerSendApiKey,
        Config.getInstance().mail.fromEmail,
        Config.getInstance().mail.fromName,
      );
    }
    return MailHelper.instance;
  }

  private async sendEmail({ toEmail, toName, subject, html, text }: EmailOptions): Promise<void> {
    const recipients = [new Recipient(toEmail, toName || 'User')];
    const emailParams = new EmailParams()
      .setFrom(new Sender(this.fromEmail, this.fromName))
      .setTo(recipients)
      .setSubject(subject)
      .setHtml(html)
      .setText(text);

    try {
      await this.mailersend.email.send(emailParams);
      Logger.info('Email sent successfully', { toEmail, subject });
    } catch (error: any) {
      Logger.error('Failed to send email', { toEmail, subject, error: error.message });
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async sendVerificationEmail(email: string, name: string | undefined, activationCode: string): Promise<void> {
    const subject = 'Your Activation Code';
    const html = `<p>Your activation code is: <strong>${activationCode}</strong></p><p>Please enter this code to activate your account. It expires in 15 minutes.</p>`;
    const text = `Your activation code is: ${activationCode}\nPlease enter this code to activate your account. It expires in 15 minutes.`;

    await this.sendEmail({
      toEmail: email,
      toName: name,
      subject,
      html,
      text,
    });
  }

  async sendPasswordResetEmail(email: string, name: string | undefined, resetCode: string): Promise<void> {
    const subject = 'Your Password Reset Code';
    const html = `<p>Your password reset code is: <strong>${resetCode}</strong></p><p>Please enter this code to reset your password. It expires in 1 hour.</p>`;
    const text = `Your password reset code is: ${resetCode}\nPlease enter this code to reset your password. It expires in 1 hour.`;

    await this.sendEmail({
      toEmail: email,
      toName: name,
      subject,
      html,
      text,
    });
  }
}

export { MailHelper };
