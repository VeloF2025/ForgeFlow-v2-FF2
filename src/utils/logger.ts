import winston from 'winston';
import chalk from 'chalk';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const customLevels = {
  levels: {
    critical: 0,
    error: 1,
    warning: 2,
    info: 3,
    debug: 4,
    trace: 5,
  },
  colors: {
    critical: 'red bold',
    error: 'red',
    warning: 'yellow',
    info: 'green',
    debug: 'blue',
    trace: 'gray',
  },
};

winston.addColors(customLevels.colors);

const consoleFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const emoji = getEmoji(level);
  const coloredLevel = getColoredLevel(level);
  const formattedMessage = formatMessage(message, meta);

  return `${chalk.gray(ts)} ${emoji} ${coloredLevel} ${formattedMessage}`;
});

function getEmoji(level: string): string {
  const emojis: Record<string, string> = {
    critical: '🔴',
    error: '❌',
    warning: '⚠️',
    info: '✅',
    debug: '🔍',
    trace: '📝',
  };
  return emojis[level] || '📋';
}

function getColoredLevel(level: string): string {
  const colors: Record<string, (text: string) => string> = {
    critical: (text: string) => chalk.red.bold(text.toUpperCase()),
    error: (text: string) => chalk.red(text.toUpperCase()),
    warning: (text: string) => chalk.yellow(text.toUpperCase()),
    info: (text: string) => chalk.green(text.toUpperCase()),
    debug: (text: string) => chalk.blue(text.toUpperCase()),
    trace: (text: string) => chalk.gray(text.toUpperCase()),
  };

  const colorFn = colors[level] || ((text: string) => text);
  return colorFn(level.padEnd(8));
}

function formatMessage(message: unknown, meta: Record<string, unknown>): string {
  let formatted = String(message);

  if (Object.keys(meta).length > 0 && !meta.stack) {
    formatted += ` ${chalk.gray(JSON.stringify(meta))}`;
  }

  if (meta.stack) {
    formatted += `\n${chalk.red(String(meta.stack))}`;
  }

  return formatted;
}

const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  errors({ stack: true }),
  winston.format.json(),
);

const logger = winston.createLogger({
  levels: customLevels.levels,
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console({
      format: combine(
        timestamp({ format: 'HH:mm:ss.SSS' }),
        errors({ stack: true }),
        consoleFormat,
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: fileFormat,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: fileFormat,
    }),
  ],
});

export { logger };

export class LogContext {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  critical(message: string, meta?: unknown): void {
    logger.log('critical', `[${this.context}] ${message}`, meta);
  }

  error(message: string, meta?: unknown): void {
    logger.error(`[${this.context}] ${message}`, meta);
  }

  warning(message: string, meta?: unknown): void {
    logger.log('warning', `[${this.context}] ${message}`, meta);
  }

  warn(message: string, meta?: unknown): void {
    logger.log('warning', `[${this.context}] ${message}`, meta);
  }

  info(message: string, meta?: unknown): void {
    logger.info(`[${this.context}] ${message}`, meta);
  }

  debug(message: string, meta?: unknown): void {
    logger.debug(`[${this.context}] ${message}`, meta);
  }

  trace(message: string, meta?: unknown): void {
    logger.log('trace', `[${this.context}] ${message}`, meta);
  }
}
