import { Router } from 'express';
import { Config } from '@/config';
import { ISession, Session } from '@/models/Session';
import { IUser, User } from '@/models/User';
import { auth } from '@/middleware/auth';
import { MyRequestHandler } from '@/Helper/MyRequestHandler';
import { Logger } from '@/Helper/Logger';
import { NotificationService } from '@/Helper/NotificationService';
import bcrypt from 'bcrypt';
import { generateToken, getClientIP } from '@/Helper/AuthHelper';
import { generateSixDigitCode } from '@/Helper/AuthHelper';
import mongoose from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import { 
  loginLimiter, 
  verificationLimiter, 
  passwordResetLimiter,
  registerLimiter
} from '@/middleware/rateLimiter';
import {
  validateEmail,
  validatePassword,
  validateRegId,
  validateSessionId,
  validateActivationCode,
  requestSizeLimiter
} from '@/middleware/validation';
import { apiLimiter } from '@/middleware/rateLimiter';
import { avatarUpload } from '@/middleware/upload';
import { fileStorage } from '@/Helper/FileStorage';
import { BlockList } from 'net';
import { Block } from '@/models/Block';
import LocalMailService from '@/Helper/LocalMailService';

// Initialize Google OAuth client
const googleClient = new OAuth2Client(
  Config.getInstance().google.clientId
);

// Add Android client ID
const androidClientId = Config.getInstance().google.androidClientId;

interface LeanSession extends Omit<ISession, '_id'> {
  _id: mongoose.Types.ObjectId;
}

const authRouter = Router();
authRouter.use(apiLimiter);
authRouter.use(requestSizeLimiter);

authRouter.post('/register', 
  auth.optional,
  registerLimiter,
  MyRequestHandler(async (req, res) => {
    try {
      const { name, email, password, regId } = req.body;
      if(!validateEmail(email)){
        return res.status(400).json({ message: 'Invalid email format','msg_code':'invalid_email' });
      }
      if(!validatePassword(password)){
        return res.status(400).json({ message: 'Invalid password format','msg_code':'invalid_password' });
      }
      if(!validateRegId(regId)){
        return res.status(400).json({ message: 'Invalid registration ID','msg_code':'invalid_reg_id' });
      }
      if (!email || !password) {
        Logger.warn('Missing required fields', { email, passwordProvided: !!password });
        return res.status(400).json({ message: 'Email and password are required','msg_code':'missing_required_fields' });
      }
      if (typeof password !== 'string' || password.trim() === '') {
        Logger.warn('Invalid password format', { email });
        return res.status(400).json({ message: 'Password must be a non-empty string','msg_code':'invalid_password' });
      }

      const existingUser = await User.findOne({ email,isDeleted:false });
      if (existingUser) {
        if (!existingUser.isVerified) {
          Logger.info('User exists but not verified', { email });
          return res.status(200).json({ message: 'User exists, please verify your account', verify: true });
        }
        Logger.warn('Duplicate email registration attempt', { email });
        return res.status(400).json({ message: 'Email already registered','msg_code':'email_already_registered' });
      }


      const activationCode = generateSixDigitCode();
      const hashedPassword = await bcrypt.hash(password.trim(), 10);
      const user = new User({
        name,
        email,
        password: hashedPassword,
        activationCode,
        activationCodeExpires: new Date(Date.now() + 15 * 60 * 1000),
        activationCodeAttempts: 0,
        regId,
        subscription: {
          isActive: false
        }
      });
      await user.save();

      await LocalMailService.getInstance().sendVerificationEmail(email, activationCode);
      return res.status(200).json({ message: 'Activation code sent to email', verify: true });
    } catch (error: any) {
      if (error.code === 11000) {
        const existingUser = await User.findOne({ email: req.body.email,isDeleted:false });
        if (existingUser && !existingUser.isVerified) {
          Logger.info('User exists but not verified during duplicate check', { email: req.body.email });
          return res.status(200).json({ message: 'User exists, please verify your account', verify: true });
        }
        Logger.warn('Duplicate email registration error', { email: req.body.email });
        return res.status(400).json({ message: 'Email already registered','msg_code':'email_already_registered' });
      }
      Logger.error('Registration failed', { email: req.body.email, error: error.message });
      return res.status(500).json({ message: 'Registration failed','msg_code':'registration_failed' });
    }
  }));

authRouter.post('/verify-account', 
  auth.optional,
  verificationLimiter,
  MyRequestHandler(async (req, res) => {
    try {
      const { email, activationCode } = req.body;
      if(!validateEmail(email)){
        return res.status(400).json({ message: 'Invalid email format','msg_code':'invalid_email' });
      }
      if(!validateActivationCode(activationCode)){
        return res.status(400).json({ message: 'Invalid activation code format','msg_code':'invalid_activation_code' });
      }
      const user = await User.findOne({ email, activationCode,isDeleted:false });
      

      if (!user) {
        Logger.warn('Invalid activation attempt', { email });
        return res.status(400).json({ message: 'Invalid activation code','msg_code':'invalid_activation_code' });
      }

      if (user.activationCodeExpires && user.activationCodeExpires < Date.now()) {
        Logger.warn('Expired activation code', { email });
        return res.status(400).json({ message: 'Activation code has expired','msg_code':'activation_code_expired' });
      }

      if (user.activationCodeAttempts >= 5) {
        Logger.warn('Too many activation attempts', { email });
        user.activationCode = undefined;
        user.activationCodeExpires = undefined;
        user.activationCodeAttempts = 0;
        await user.save();
        return res.status(400).json({ message: 'Too many attempts, please request a new code','msg_code':'too_many_attempts' });
      }

      if (user.activationCode === activationCode) {
        user.isVerified = true;
        user.activationCode = undefined;
        user.activationCodeExpires = undefined;
        user.activationCodeAttempts = 0;
        await user.save();
        await NotificationService.getInstance().sendRegisterationNotification(user);
        Logger.info('Account verified', { email });
        return res.status(200).json({ message: 'Account verified successfully' });
      } else {
        user.activationCodeAttempts += 1;
        await user.save();
        Logger.warn('Incorrect activation code', { email, attempts: user.activationCodeAttempts });
        return res.status(400).json({ message: 'Invalid activation code','msg_code':'invalid_activation_code' });
      }
    } catch (error: any) {
      Logger.error('Account verification failed', { email: req.body.email, error: error.message });
      return res.status(500).json({ message: 'Verification failed','msg_code':'verification_failed' });
    }
  }));

authRouter.post('/resend-verification', 
  auth.optional,
  verificationLimiter,
  MyRequestHandler(async (req, res) => {
    try {
      const { email } = req.body;
      if(!validateEmail(email)){
        return res.status(400).json({ message: 'Invalid email format', 'msg_code': 'invalid_email' });
      }
      if (!email) {
        Logger.warn('Missing email for resend verification', { email });
        return res.status(400).json({ message: 'Email is required', 'msg_code': 'missing_email' });
      }

      const user = await User.findOne({ email ,isDeleted:false});
      if (!user) {
        Logger.warn('User not found for resend verification', { email });
        return res.status(404).json({ message: 'User not found', 'msg_code': 'user_not_found' });
      }
      if (user.isVerified) {
        Logger.info('User already verified', { email });
        return res.status(400).json({ message: 'User already verified', 'msg_code': 'user_already_verified' });
      }

      // Check if 60 seconds have passed since the last code was sent
      const lastCodeSentTime = user.activationCodeExpires ? 
        new Date(user.activationCodeExpires).getTime() - (Config.getInstance().register.activationCodeExpire * 60 * 1000) : 0;
      const timeElapsed = Date.now() - lastCodeSentTime;
      const cooldownTime = Config.getInstance().register.resendCooldown * 1000; // convert to milliseconds
      
      if (timeElapsed < cooldownTime) {
        const remainingTime = Math.ceil((cooldownTime - timeElapsed) / 1000);
        Logger.warn('Resend verification attempted too soon', { email, remainingTime });
        return res.status(429).json({ 
          message: `Please wait ${remainingTime} seconds before requesting a new code`,
          remainingSeconds: remainingTime,
          'msg_code': 'resend_cooldown',
          'remaining_time': remainingTime
        });
      }

      const activationCode = generateSixDigitCode();
      user.activationCode = activationCode;
      user.activationCodeExpires = Date.now() + (Config.getInstance().register.activationCodeExpire * 60 * 1000);
      user.activationCodeAttempts = 0;
      await user.save();

      await LocalMailService.getInstance().sendVerificationEmail(email, activationCode);
      return res.status(200).json({ message: 'New activation code sent to email', verify: true, 'msg_code': 'activation_code_sent' });
    } catch (error: any) {
      Logger.error('Resend verification failed', { email: req.body.email, error: error.message });
      return res.status(500).json({ message: 'Failed to resend verification code', 'msg_code': 'resend_verification_failed' });
    }
  }));
authRouter.post('/login-with-telegram', 
  auth.optional,
  MyRequestHandler(async (req, res) => {
    try {
      const { telegramId, email } = req.body;
      
      if (!telegramId) {
        return res.status(400).json({ message: 'Telegram ID is required', 'msg_code': 'telegram_id_required' });
      }

      if (!email) {
        return res.status(400).json({ message: 'Email is required', 'msg_code': 'email_required' });
      }

      if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Invalid email format', 'msg_code': 'invalid_email' });
      }

      // Find user by email
      const user = await User.findOne({ email, isDeleted: false });

      if (!user) {
        return res.status(404).json({ 
          message: 'User not found', 
          'msg_code': 'user_not_found' 
        });
      }

      // Check if this telegram ID is already linked to a different account
      const existingTelegramUser = await User.findOne({ 
        telegramId, 
        email: { $ne: email }, 
        isDeleted: false 
      });

      if (existingTelegramUser) {
        return res.status(400).json({ 
          message: 'This Telegram account is already linked to a different email', 
          'msg_code': 'telegram_linked_to_different_email' 
        });
      }

      // If user exists but telegramId is different
      if (user.telegramId && user.telegramId !== telegramId) {
        return res.status(400).json({ 
          message: 'Email is already linked to a different Telegram account', 
          'msg_code': 'email_linked_to_different_telegram' 
        });
      }

      // If already verified with this telegram ID, return token
      if (user.telegramId === telegramId && user.telegramVerified) {
        const sessionToken = generateToken(user._id.toString(), user.isAdmin);
        return res.status(200).json({ 
          message: 'Login successful', 
          'msg_code': 'login_successful', 
          token: sessionToken 
        });
      }

      // Generate and send verification code
      await user.generateTelegramVerificationCode();
      await LocalMailService.getInstance().sendVerificationEmail(
        email, 
        user.telegramVerificationCode as string
      );

      // Update telegram ID (will be verified when code is entered)
      user.telegramId = telegramId;
      await user.save();
        
      return res.status(200).json({ 
        message: 'Verification code sent to email', 
        'msg_code': 'verification_code_sent',
        verify: true 
      });

    } catch (error) {
      Logger.error('Telegram login failed', { error });
      return res.status(500).json({ 
        message: 'Login failed', 
        'msg_code': 'login_failed' 
      });
    }
  }));

// Add new endpoint for verifying telegram code
authRouter.post('/verify-telegram', 
  auth.optional,
  MyRequestHandler(async (req, res) => {
    try {
      const { email, telegramId, verificationCode } = req.body;

      if (!email || !telegramId || !verificationCode) {
        return res.status(400).json({ 
          message: 'Email, telegramId and verification code are required', 
          'msg_code': 'missing_required_fields' 
        });
      }

      const user = await User.findOne({ 
        email, 
        telegramId,
        isDeleted: false 
      });

      if (!user) {
        return res.status(404).json({ 
          message: 'User not found', 
          'msg_code': 'user_not_found' 
        });
      }

      // Verify the code
      if (!user.telegramVerificationCode || 
          !user.telegramVerificationCodeExpires || 
          user.telegramVerificationCodeExpires < Date.now() ||
          user.telegramVerificationCode !== verificationCode) {
        return res.status(400).json({ 
          message: 'Invalid or expired verification code', 
          'msg_code': 'invalid_verification_code' 
        });
      }

      // Mark telegram as verified and clear verification code
      user.telegramVerified = true;
      user.telegramVerificationCode = undefined;
      user.telegramVerificationCodeExpires = undefined;
      await user.save();

      // Generate session token
      const sessionToken = generateToken(user._id.toString(), user.isAdmin);

      // Send notification about new telegram link
      await NotificationService.getInstance().createNotification(
        user._id.toString(),
        'Telegram Account Linked',
        'Your Telegram account has been successfully linked to your WikiToefl account.',
        { 
          type: "update",
          details: {
            telegramId: telegramId
          }
        }
      );

      return res.status(200).json({ 
        message: 'Telegram account verified successfully', 
        'msg_code': 'telegram_verified',
        token: sessionToken 
      });
    } catch (error) {
      Logger.error('Telegram verification failed', { error });
      return res.status(500).json({ 
        message: 'Verification failed', 
        'msg_code': 'verification_failed' 
      });
    }
  }));

authRouter.post('/login', 
  auth.optional,
  loginLimiter,
  MyRequestHandler(async (req, res) => {
    try {
      const { email, password, deviceName } = req.body;
      if(!validateEmail(email)){
        return res.status(400).json({ message: 'Invalid email format','msg_code':'invalid_email' });
      }
      if(!validatePassword(password)){
        return res.status(400).json({ message: 'Invalid password format','msg_code':'invalid_password' });
      }
      Logger.info('Login attempt', { email });

      if (!deviceName) {
        Logger.warn('Login failed - device name not provided', { email });
        return res.status(400).json({ message: 'Device name is required' });
      }

      const user = await User.findOne({ email ,isDeleted:false}) as IUser | null;

      if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
        Logger.warn('Login failed - invalid credentials', { email });
        return res.status(400).json({ message: 'Invalid credentials' ,'msg_code':'invalid_credentials'});
      }

      if (!user.isVerified) {
        Logger.warn('Login failed - account not verified', { email });
        return res.status(400).json({ message: 'Account not verified' ,'msg_code':'account_not_verified'});
      }

      if (user.isBlocked) {
        Logger.warn('Login failed - account is banned', { email });
        return res.status(403).json({ message: 'Your account has been banned. Please contact support for assistance.' ,'msg_code':'account_banned'});
      }


      // Use atomic operation to manage sessions
      const sessionCount = await Session.countDocuments({ 
        userId: user._id,
        isTerminated: false 
      });

      if (sessionCount >= Config.getInstance().session.maxCount) {
        // Close oldest sessions atomically
        await Session.updateMany(
          { 
            userId: user._id,
            isTerminated: false 
          },
          { 
            $set: { isTerminated: true },
            $sort: { lastActive: 1 },
            $limit: sessionCount - Config.getInstance().session.maxCount + 1
          }
        );
      }

      // Generate token and create session
      const sessionToken = generateToken(user._id.toString(), user.isAdmin);
      const clientIP = getClientIP(req);
      
      const sessionData = {
        userId: user._id,
        token: sessionToken,
        expiresAt: Date.now() + Config.getInstance().session.maxLifeTime,
        userAgent: req.body.userAgent || 'unknown',
        ip: clientIP,
        deviceOs: req.body.deviceOs || 'unknown',
        osVersion: req.body.osVersion || 'unknown',
        deviceName: deviceName,
        deviceResolution: req.body.deviceResolution || 'unknown',
        deviceRegId: req.body.deviceRegId || null,
        appVersionName: req.body.appVersionName || 'unknown',
        appVersionCode: req.body.appVersionCode || 'unknown'
      };

      const session = new Session(sessionData);
      await session.save();
      Logger.info('Session saved successfully');

      // Send login notification
      await NotificationService.getInstance().createNotification(
        user._id.toString(),
        'New Login',
        `New login detected on ${deviceName} (${req.body.deviceOs || 'unknown'}) from ${clientIP}.`,
        { 
          type: "login",
          deviceInfo: {
            name: deviceName,
            os: req.body.deviceOs || 'unknown',
            ip: clientIP
          }
        }
      );

      Logger.info('User logged in successfully and notification sent', { email, userId: user._id });
      return res.json({ 
        token: sessionToken,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          isAdmin: user.isAdmin,
          isVerified: user.isVerified
        }
      });
    } catch (error: any) {
      Logger.error('Login failed', { 
        error: error.message, 
        stack: error.stack,
        name: error.name,
        validationErrors: error.errors ? Object.keys(error.errors).map(key => ({
          field: key,
          message: error.errors[key].message
        })) : undefined
      });
      return res.status(500).json({ message: 'Login failed' ,'msg_code':'login_failed'});
    }
  }));

authRouter.post('/update-regid', 
  auth.user,
  MyRequestHandler(async (req, res) => {
    try {
      const { regId } = req.body;
      if(!validateRegId(regId)){
        return res.status(400).json({ message: 'Invalid registration ID' ,'msg_code':'invalid_regid'});
      }
      const user = await User.findById(req.user!.id);

      if (!user) {
        Logger.warn('User not found for regId update', { userId: req.user!.id });
        return res.status(404).json({ message: 'User not found' ,'msg_code':'user_not_found'});
        
      }

      user.regId = regId;
      await user.save();

      Logger.info('regId updated', { userId: user._id, regId });
      return res.status(200).json({ message: 'regId updated successfully' ,'msg_code':'regid_updated'});
    } catch (error: any) {
      Logger.error('regId update failed', { userId: req.user!.id, error: error.message });
      return res.status(500).json({ message: 'Failed to update regId' ,'msg_code':'regid_update_failed'});
    }
  }));

authRouter.post('/forget-password', 
  auth.optional,
  passwordResetLimiter,
  MyRequestHandler(async (req, res) => {
    try {
      const { email } = req.body;
      if(!validateEmail(email)){
        return res.status(400).json({ message: 'Invalid email format' ,'msg_code':'invalid_email'});
      }
      const user = await User.findOne({ email,isDeleted:false });

      if (!user) {
        Logger.warn('Password reset attempt for non-existent user', { email });
        return res.status(400).json({ message: 'User not found' ,'msg_code':'user_not_found'});
      }

      const resetCode = generateSixDigitCode();
      user.resetPasswordToken = resetCode;
      user.resetPasswordExpires = Date.now() + 3600000;
      await user.save();

      await LocalMailService.getInstance().sendPasswordResetEmail(email, user.name, resetCode);
      Logger.info('Password reset email sent', { email });
      return res.status(200).json({ message: 'Password reset code sent to email' ,'msg_code':'password_reset_code_sent'});
    } catch (error: any) {
      Logger.error('Password reset request failed', { email: req.body.email, error: error.message });
      return res.status(500).json({ message: 'Reset request failed' ,'msg_code':'reset_request_failed'});
    }
  }));

authRouter.post('/reset-password',
  auth.optional,
  passwordResetLimiter,
  MyRequestHandler(async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if(!validatePassword(newPassword)){
        return res.status(400).json({ message: 'Invalid password' ,'msg_code':'invalid_password'});
      }
      const user = await User.findOne({
        isDeleted:false,
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user) {
        Logger.warn('Invalid password reset attempt', { token });
        return res.status(400).json({ message: 'Invalid or expired code' ,'msg_code':'invalid_or_expired_code'});
        
      }

      user.password = await bcrypt.hash(newPassword, 10);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      // Send password reset notification
      await NotificationService.getInstance().createNotification(
        user._id.toString(),
        'Password Reset',
        'Your password has been reset successfully. If you did not request this change, please contact support immediately.',
        { type: "alert" }
      );

      Logger.info('Password reset successful and notification sent', { userId: user._id });
      return res.status(200).json({ message: 'Password reset successfully' ,'msg_code':'password_reset_successful'});
    } catch (error: any) {
      Logger.error('Password reset failed', { error: error.message });
      return res.status(500).json({ message: 'Password reset failed' ,'msg_code':'password_reset_failed'});
    }
  }));

authRouter.post('/change-password', auth.user, MyRequestHandler(async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' ,'msg_code':'current_password_and_new_password_required'});
      
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' ,'msg_code':'user_not_found'});
      
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password as string);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' ,'msg_code':'current_password_is_incorrect'});
      
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // Invalidate all other sessions
    await Session.deleteMany({ userId: user._id, _id: { $ne: req.session?._id } });

    // Send password change notification
    await NotificationService.getInstance().createNotification(
      user._id.toString(),
      'Password Changed',
      'Your password has been changed successfully. All other sessions have been logged out.',
      { type: "update" }
    );

    Logger.info('Password changed successfully and notification sent', { userId });
    return res.status(200).json({ message: 'Password changed successfully' ,'msg_code':'password_changed_successfully'});
  } catch (err) {
    Logger.error('Error in change password endpoint:', err);
    return res.status(500).json({ message: 'Internal server error' ,'msg_code':'internal_server_error'});
  }
}));

authRouter.delete('/account', auth.user, MyRequestHandler(async (req, res) => {
  try {
    const userId = req.user?.id;

    // Find and soft delete the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' ,'msg_code':'user_not_found'});
      
    }

    // Mark user as deleted and unblock them
    user.isDeleted = true;
    user.isBlocked = false;
    await user.save();

    // Terminate all active sessions for this user
    await Session.updateMany(
      { userId: user._id, isTerminated: false },
      { isTerminated: true }
    );

    return res.status(200).json({ message: 'Account deleted successfully' ,'msg_code':'account_deleted_successfully'});
  } catch (err) {
    Logger.error('Error in delete account endpoint:', err);
    return res.status(500).json({ message: 'Internal server error' ,'msg_code':'internal_server_error'});
  }
}));

authRouter.get('/sessions', auth.user, MyRequestHandler(async (req, res) => {
  try {
    if (!req.session) {
      Logger.warn('No session found for user', { userId: req.user!.id });
      return res.status(401).json({ message: 'No active session' ,'msg_code':'no_active_session'});
    }

    const sessions = await Session
      .find({ userId: req.user!.id, isTerminated: false })
      .select(['-token', '-__v'])
      .sort({ lastActive: -1 });
      
    // Add current flag to sessions
    const sessionsWithCurrent = sessions.map(session => {
      const sessionObj = session.toObject();
      const sessionId = sessionObj._id as mongoose.Types.ObjectId;
      const currentSessionId = req.session!._id as mongoose.Types.ObjectId;
      return {
        ...sessionObj,
        isCurrent: sessionId.equals(currentSessionId)
      };
    });

    return res.status(200).json({ sessions: sessionsWithCurrent });
  } catch (error: any) {
    Logger.error('Failed to list sessions', { userId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to list sessions' ,'msg_code':'failed_to_list_sessions'});
  }
}));

authRouter.post('/close-session', 
  auth.user,
  validateSessionId,
  MyRequestHandler(async (req, res) => {
    try {
      const { id } = req.body; // Changed from sessionId to token
      const session = await Session.findOne({ _id: id, userId: req.user!.id });

      if (!session) {
        Logger.warn('Session not found or not owned by user', { id, userId: req.user!.id });
            return res.status(403).json({ message: 'Session not found', 'msg_code':'session_not_found'});
        
      }

      session.isTerminated = true;
      await session.save();

      Logger.info('Session closed', { id, userId: req.user!.id });
      return res.status(200).json({ message: 'Session closed successfully' ,'msg_code':'session_closed_successfully'});
    } catch (error: any) {
      Logger.error('Failed to close session', { userId: req.user!.id, error: error.message });
      return res.status(500).json({ message: 'Failed to close session' ,'msg_code':'failed_to_close_session'});
    }
  }));

authRouter.post('/close-other-sessions', auth.user, MyRequestHandler(async (req, res) => {
  try {
    await Session.updateMany(
      { 
        userId: req.user!.id,
        _id: { $ne: req.session!._id }, // Exclude current session
        isTerminated: false
      },
      { 
        isTerminated: true,
        lastActive: Date.now()
      }
    );

    Logger.info('All other sessions closed', { userId: req.user!.id, currentSession: req.session!._id });
    return res.status(200).json({ message: 'All other sessions closed successfully' ,'msg_code':'all_other_sessions_closed_successfully'});
  } catch (error: any) {
    Logger.error('Failed to close other sessions', { userId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Failed to close other sessions' ,'msg_code':'failed_to_close_other_sessions'});
  }
}));

authRouter.post('/logout', auth.user, MyRequestHandler(async (req, res) => {
  try {
    if (!req.session) {
      Logger.warn('No session found for logout', { userId: req.user!.id });
      return res.status(400).json({ message: 'No active session' ,'msg_code':'no_active_session'});
    }

    req.session.isTerminated = true;
    await req.session.save();

    Logger.info('User logged out successfully', { userId: req.user!.id, sessionId: req.session._id });
    return res.json({ message: 'Logged out successfully' ,'msg_code':'logged_out_successfully'});
  } catch (error: any) {
    Logger.error('Logout failed', { userId: req.user!.id, error: error.message });
    return res.status(500).json({ message: 'Logout failed' ,'msg_code':'logout_failed'});
  }
}));

// Avatar upload endpoint
authRouter.post('/avatar', 
  auth.user, 
  avatarUpload.single('avatar'), 
  MyRequestHandler(async (req, res) => {
    try {
      if (!req.file) {
        Logger.warn('No file uploaded for avatar', { userId: req.user!.id });
        return res.status(400).json({ message: 'No file uploaded' ,'msg_code':'no_file_uploaded'});
      }

      const user = await User.findById(req.user!.id);
      if (!user) {
        Logger.warn('User not found for avatar upload', { userId: req.user!.id });
        return res.status(404).json({ message: 'User not found' ,'msg_code':'user_not_found'});
      }
      
      if (user.avatar && !user.avatar.isExternal) {
        try {
          await fileStorage.deleteFileFromDirectory('avatars', user.avatar.filename as string);
        } catch (deleteError) {
          Logger.error('Error deleting old avatar', { 
            userId: req.user!.id, 
            key: user.avatar, 
            error: deleteError 
          });
          // Continue even if deletion fails
        }
      }
      
      // Upload and process the avatar
      const avatarFileInfo = await fileStorage.uploadAvatar(req.file.buffer);
      
      // Update user's avatar in database
      user.avatar = avatarFileInfo;
      
      await user.save();
      
      Logger.info('Avatar uploaded successfully', { userId: req.user!.id });
      return res.status(200).json({ 
        message: 'Avatar uploaded successfully',
        avatar: user.avatar
      });
    } catch (error: any) {
      Logger.error('Avatar upload failed', { 
        userId: req.user!.id, 
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({ message: 'Avatar upload failed: ' + error.message });
    }
  })
);

// Delete avatar endpoint
authRouter.delete('/avatar', 
  auth.user, 
  MyRequestHandler(async (req, res) => {
    try {
      const user = await User.findById(req.user!.id);
      if (!user) {
        Logger.warn('User not found for avatar deletion', { userId: req.user!.id });
        return res.status(404).json({ message: 'User not found' ,'msg_code':'user_not_found'});
      }
      
      // Check if user has an avatar
      if (!user.avatar) {
        Logger.warn('No avatar to delete', { userId: req.user!.id });
        return res.status(400).json({ message: 'No avatar to delete' ,'msg_code':'no_avatar_to_delete'});
      }
      
      // Delete avatar file
      try {
        if (!user.avatar.isExternal) {
          await fileStorage.deleteFileFromDirectory('avatars', user.avatar.filename as string);
        }
      } catch (deleteError) {
        Logger.error('Error deleting avatar file', { 
          userId: req.user!.id, 
          key: user.avatar, 
          error: deleteError 
        });
        // Continue even if file deletion fails
      }
      
      // Remove avatar from user object
      user.avatar = undefined;
      await user.save();
      
      Logger.info('Avatar deleted successfully', { userId: req.user!.id });
      return res.status(200).json({ message: 'Avatar deleted successfully' ,'msg_code':'avatar_deleted_successfully'});
    } catch (error: any) {
      Logger.error('Avatar deletion failed', { 
        userId: req.user!.id, 
        error: error.message 
      });
      return res.status(500).json({ message: 'Avatar deletion failed' ,'msg_code':'avatar_deletion_failed'});
    }
  })
);

// Google Sign In endpoint
authRouter.post('/google', MyRequestHandler(async (req, res) => {
  try {
    const { token, isAdminLogin, platform = 'web' } = req.body;
    
    // Verify Google token based on platform
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: [
        Config.getInstance().google.clientId, // Web client ID
        Config.getInstance().google.androidClientId // Android client ID
      ]
    });
    
    const payload = ticket.getPayload();
    if (!payload) {
      Logger.warn('Invalid Google token', { platform });
      return res.status(400).json({ 
        message: 'Invalid token',
        'msg_code': 'invalid_token'
      });
    }

    const { email, name, picture } = payload;
    Logger.info('Google login attempt', { email, platform });

    if(await Block.findOne({type:'email',value:email})){
      return res.status(403).json({ 
        message: 'Your account has been banned. Please contact support for assistance.',
        'msg_code': 'account_banned'
      });
    }
    // Check if user exists
    let user = await User.findOne({ email,isDeleted:false });

    
    if (!user) {
      // For admin login, only allow pre-registered admin emails
      if (isAdminLogin) {
        Logger.warn('Attempted admin login with unregistered email', { email, platform });
        return res.status(403).json({ 
          message: 'Unauthorized admin access', 
          'msg_code': 'unauthorized_admin_access' 
        });
      }

      // Create new regular user
      user = new User({
        email,
        name,
        avatar: picture ? {
          url: String(picture),
          filename: String(`google_${Date.now()}`),
          path: String(picture),
          width: Number(0),
          height: Number(0),
          isExternal: true
        } : undefined,
        isVerified: true,      // Google emails are verified
        isAdmin: false,        // New Google users are not admins by default
        password: await bcrypt.hash(Math.random().toString(36), 10), // Random password
        platform: platform     // Store the platform information
      });
      await user.save();
      Logger.info('New user created via Google', { email, platform });
    } else {
      // For existing users
      if (isAdminLogin && !user.isAdmin) {
        Logger.warn('Non-admin user attempted admin login', { email, platform });
        return res.status(403).json({ 
          message: 'Unauthorized admin access', 
          'msg_code': 'unauthorized_admin_access' 
        });
      }

      // Update user information if changed
      let isUpdated = false;
      if (user.name !== name) {
        user.name = name;
        isUpdated = true;
      }
      if (picture && (!user.avatar || user.avatar.url !== picture)) {
        user.avatar = {
          url: String(picture),
          filename: String(`google_${user._id}`),
          path: String(picture),
          width: Number(0),
          height: Number(0),
          isExternal: true
        };
        isUpdated = true;
      }
      if (isUpdated) {
        await user.save();
        Logger.info('User information updated via Google', { email, platform });
      }
    }

    // Check if user is blocked or deleted
    if (user.isBlocked) {
      Logger.warn('Blocked user attempted login', { email });
      return res.status(403).json({ 
        message: 'Your account has been banned. Please contact support for assistance.',
        'msg_code': 'account_banned'
      });
    }
    // Use atomic operation to manage sessions
    const sessionCount = await Session.countDocuments({ 
      userId: user._id,
      isTerminated: false 
    });

    if (sessionCount >= Config.getInstance().session.maxCount) {
      await Session.updateMany(
        { 
          userId: user._id,
          isTerminated: false 
        },
        { 
          $set: { isTerminated: true },
          $sort: { lastActive: 1 },
          $limit: sessionCount - Config.getInstance().session.maxCount + 1
        }
      );
    }
    // Generate session token with proper admin status
    const sessionToken = generateToken(user._id.toString(), user.isAdmin);
    const clientIP = getClientIP(req);

    // Create session with device info
    const session = new Session({
      userId: user._id,
      token: sessionToken,
      expiresAt: Date.now() + Config.getInstance().session.maxLifeTime,
      userAgent: req.headers['user-agent'] || 'unknown',
      ip: clientIP,
      deviceOs: req.body.deviceOs || platform,
      osVersion: req.body.osVersion || 'unknown',
      deviceName: req.body.deviceName || (platform === 'android' ? 'Android Device' : 'Web Browser'),
      deviceResolution: req.body.deviceResolution || 'unknown',
      deviceRegId: req.body.deviceRegId || null,
      appVersionName: req.body.appVersionName || '1.0',
      appVersionCode: req.body.appVersionCode || '1',
      platform: platform
    });
    await session.save();

    // Send login notification
    await NotificationService.getInstance().createNotification(
      user._id.toString(),
      'New Login',
      `New login detected via Google on ${session.deviceName} (${platform}) from ${clientIP}.`,
      { 
        type: "login",
        deviceInfo: {
          name: session.deviceName,
          os: session.deviceOs,
          ip: clientIP,
          platform: platform
        }
      }
    );

    Logger.info('Google login successful', { email, platform, isAdmin: user.isAdmin });

    // Return user data and token
    return res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        isAdmin: user.isAdmin,
        isVerified: user.isVerified
      },
      token: sessionToken,
      'msg_code': 'google_auth_success'
    });

  } catch (error) {
    Logger.error('Google authentication error:', error);
    return res.status(500).json({ 
      message: 'Authentication failed', 
      'msg_code': 'authentication_failed'
    });
  }
}));

export default authRouter;