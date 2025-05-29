import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

interface AppConfig {
  port: number;
  mongoUri: string;
  jwtSecret: string;
  logLevel: string;
  isDebug: boolean;
  maxFileSize: number;
  allowedFileTypes: string[];
  uploads: {
    maxSizeBasic: number;    // in bytes
    maxSizePremium: number;  // in bytes
    dailyLimitBasic: number;
    dailyLimitPremium: number;
    allowedMimeTypes: string[];
  };
  register: {
    activationCodeExpire: number;    // in minutes
    resetPasswordCodeExpire: number;  // in minutes
    resendCooldown: number;          // in seconds
  };
  session: {
    maxLifeTime: number;     // in milliseconds
    maxCount: number;
  };
  storage: {
    appDir: string;
    uploadsDir: string;
    messagesDir: string;
    avatarsDir: string;
    iconsDir: string;
    othersDir: string;
  };
  server: {
    baseUrl: string;
    port: number;
  };
  mail: {
    mailerSendApiKey: string;
    fromEmail: string;
    fromName: string;
  };
  firebase: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  };
  redis: {
    host: string;
    port: number;
    password: string;
    db: number;
    ttl: number;
  };
  google: {
    clientId: string;
    clientSecret: string;
    androidClientId: string;
  };
  debug: {
    enabled: boolean;
    bypassRateLimits: boolean;
  };
  gmail:{
    clientId: string;
    clientSecret: string;
    redirectUrl: string;
    refreshToken: string;
    user: string;
  };
  smtp:{
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    fromEmail: string;
    fromName: string;
  };

  loadConfig: () => void;
}

export class Config implements AppConfig {
  private static instance: Config;
  private _port: number = 8443;
  private _mongoUri: string = 'mongodb://mongo_db:27017/database';
  private _jwtSecret: string = 'mysecret';
  private _logLevel: string = 'info';
  private _isDebug: boolean = false;
  private _uploadDir: string = './uploads';
  private _maxFileSize: number = 5242880;
  private _allowedFileTypes: string[] = ['image/jpeg', 'image/png'];
  private _uploads = {
    maxSizeBasic: 2 * 1024 * 1024,
    maxSizePremium: 5 * 1024 * 1024,
    dailyLimitBasic: 10,
    dailyLimitPremium: 100,
    allowedMimeTypes: ['image/jpg','image/jpeg', 'image/png']
  };
  private _session = {
    maxLifeTime: 30 * 24 * 60 * 60 * 1000,
    maxCount: 5
  };
  private _storage = {
    appDir: path.join(process.cwd()),
    uploadsDir: 'uploads',
    messagesDir: 'messages',
    avatarsDir:  'avatars',
    iconsDir: 'icons',
    othersDir: 'others'
  };
  private _server = {
    baseUrl: 'http://localhost:8443',
    port: 8443
  };
  private _mail = {
    mailerSendApiKey: 'your_mailersend_api_key',
    fromEmail: 'info@test.com',
    fromName: 'Your App'
  };
  private _firebase = {
    projectId: '',
    clientEmail: '',
    privateKey: ''
  };
  private _redis = {
    host: 'redis',
    port: 6379,
    password: '',
    db: 0,
    ttl: 300 // 5 minutes in seconds
  };
  private _google = {
    clientId: '',
    clientSecret: '',
    androidClientId: ''
  };
  private _register = {
    activationCodeExpire: 15,      // 15 minutes
    resetPasswordCodeExpire: 60,    // 60 minutes
    resendCooldown: 60             // 60 seconds
  };
  private _debug = {
    enabled: false,
    bypassRateLimits: false
  };
  private _gmail = {
    clientId: '',
    clientSecret: '',
    redirectUrl: '',
    refreshToken: '',
    user: ''
  };
  private _smtp = {
    host: '',
    port: 0,
    secure: false,
    user: '',
    password: '',
    fromEmail: '',
    fromName: ''
  };
  private constructor() {}

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  public static loadConfig(): void {
    dotenv.config();
    const instance = Config.getInstance();
    instance._port = parseInt(process.env.SERVER_PORT || '8443');
    instance._mongoUri = process.env.MONGO_URI || 'mongodb://mongo_db:27017/database';
    instance._jwtSecret = process.env.JWT_SECRET || 'mysecret';
    instance._logLevel = process.env.LOG_LEVEL || 'info';
    instance._isDebug = process.env.NODE_ENV === 'development';
    instance._uploadDir = process.env.UPLOAD_DIR || './uploads';
    instance._maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '5242880');
    instance._allowedFileTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png').split(',');
    instance._uploads.maxSizeBasic = Number(process.env.UPLOAD_MAX_SIZE_BASIC_MB || 2) * 1024 * 1024;
    instance._uploads.maxSizePremium = Number(process.env.UPLOAD_MAX_SIZE_PREMIUM_MB || 5) * 1024 * 1024;
    instance._uploads.dailyLimitBasic = Number(process.env.UPLOAD_DAILY_LIMIT_BASIC || 10);
    instance._uploads.dailyLimitPremium = Number(process.env.UPLOAD_DAILY_LIMIT_PREMIUM || 100);
    instance._uploads.allowedMimeTypes = (process.env.UPLOAD_ALLOWED_MIME_TYPES || 'image/jpeg,image/png').split(',');
    instance._session.maxLifeTime = Number(process.env.USER_SESSION_LIFE_DAYS || 30) * 24 * 60 * 60 * 1000;
    instance._session.maxCount = Number(process.env.USER_MAX_SESSION_COUNT || 1);
    instance._server.baseUrl = process.env.SERVER_BASE_URL || `http://localhost:${instance._port}`;
    instance._server.port = instance._port;
    instance._mail.mailerSendApiKey = process.env.MAILERSEND_API_KEY || 'your_mailersend_api_key';
    instance._mail.fromEmail = process.env.EMAIL_FROM || 'info@yourdomain.com';
    instance._mail.fromName = process.env.EMAIL_FROM_NAME || 'Your App';
    
    instance._gmail.clientId = process.env.GMAIL_CLIENT_ID || '';
    instance._gmail.clientSecret = process.env.GMAIL_CLIENT_SECRET || '';
    instance._gmail.redirectUrl = process.env.GMAIL_REDIRECT_URL || '';
    instance._gmail.refreshToken = process.env.GMAIL_REFRESH_TOKEN || '';
    instance._gmail.user = process.env.GMAIL_USER || '';

    instance._smtp.host = process.env.SMTP_HOST || '';
    instance._smtp.port = parseInt(process.env.SMTP_PORT || '587');
    instance._smtp.secure = process.env.SMTP_SECURE === 'true';
    instance._smtp.user = process.env.SMTP_USER || '';
    instance._smtp.password = process.env.SMTP_PASSWORD || '';
    instance._smtp.fromEmail = process.env.SMTP_FROM_EMAIL || '';
    instance._smtp.fromName = process.env.SMTP_FROM_NAME || '';
    
    instance._firebase.projectId = process.env.FIREBASE_PROJECT_ID || '';
    instance._firebase.clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
    instance._firebase.privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
    instance._redis.host = process.env.REDIS_HOST || 'redis';
    instance._redis.port = parseInt(process.env.REDIS_PORT || '6379');
    instance._redis.password = process.env.REDIS_PASSWORD || '';
    instance._redis.db = parseInt(process.env.REDIS_DB || '0');
    instance._redis.ttl = parseInt(process.env.REDIS_TTL || '300');
    instance._google.clientId = process.env.GOOGLE_CLIENT_ID || '';
    instance._google.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    instance._google.androidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID || '';
    instance._register.activationCodeExpire = Number(process.env.ACTIVATION_CODE_EXPIRE_MINUTES || 15);
    instance._register.resetPasswordCodeExpire = Number(process.env.RESET_PASSWORD_CODE_EXPIRE_MINUTES || 60);
    instance._register.resendCooldown = Number(process.env.RESEND_COOLDOWN_SECONDS || 60);
    instance._debug.enabled = process.env.DEBUG_MODE === 'true';
    instance._debug.bypassRateLimits = process.env.DEBUG_BYPASS_RATE_LIMITS === 'true';
  }

  // Getters
  get port(): number { return this._port; }
  get mongoUri(): string { return this._mongoUri; }
  get jwtSecret(): string { return this._jwtSecret; }
  get logLevel(): string { return this._logLevel; }
  get isDebug(): boolean { return this._isDebug; }
  get maxFileSize(): number { return this._maxFileSize; }
  get allowedFileTypes(): string[] { return this._allowedFileTypes; }
  get uploads() { return this._uploads; }
  get session() { return this._session; }
  get storage() { return this._storage; }
  get server() { return this._server; }
  get mail() { return this._mail; }
  get firebase() { return this._firebase; }
  get redis() { return this._redis; }
  get google() { return this._google; }
  get register() { return this._register; }
  get debug() { return this._debug; }
  get gmail() { return this._gmail; }
  get smtp() { return this._smtp; }

  public loadConfig(): void {
    Config.loadConfig();
  }
}
