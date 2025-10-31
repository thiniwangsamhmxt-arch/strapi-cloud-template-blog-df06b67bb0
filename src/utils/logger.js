/**
 * Logger Utility
 * Winston-based logging with daily rotation
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const logDir = process.env.LOG_DIR || './logs';
const logLevel = process.env.LOG_LEVEL || 'info';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format (more readable)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    
    return msg;
  })
);

// Create daily rotate file transport for all logs
const fileTransport = new DailyRotateFile({
  dirname: logDir,
  filename: 'social-cms-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
});

// Create daily rotate file transport for error logs
const errorFileTransport = new DailyRotateFile({
  dirname: logDir,
  filename: 'social-cms-error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '30d',
  format: logFormat,
});

// Create logger
const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  transports: [
    fileTransport,
    errorFileTransport,
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
  exceptionHandlers: [
    new DailyRotateFile({
      dirname: logDir,
      filename: 'exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      dirname: logDir,
      filename: 'rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],
});

// Create specialized loggers for different components
const createComponentLogger = (component) => {
  return {
    info: (message, meta = {}) => logger.info(message, { component, ...meta }),
    error: (message, meta = {}) => logger.error(message, { component, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { component, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { component, ...meta }),
  };
};

// Export logger with component creation helper
module.exports = {
  logger,
  createLogger: createComponentLogger,
  
  // Pre-configured component loggers
  socialPlatformLogger: createComponentLogger('SocialPlatform'),
  queueLogger: createComponentLogger('Queue'),
  apiLogger: createComponentLogger('API'),
  schedulerLogger: createComponentLogger('Scheduler'),
  analyticsLogger: createComponentLogger('Analytics'),
};
