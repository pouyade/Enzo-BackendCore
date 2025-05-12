import winston from 'winston';
import { Config } from '@/config';

const logger = winston.createLogger({
  level: !Config.getInstance().isDebug ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

export default logger;
export { logger as Logger }; 