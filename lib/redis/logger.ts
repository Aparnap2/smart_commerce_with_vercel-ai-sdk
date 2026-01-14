/**
 * Logger Module
 * Structured logging for Redis checkpointing operations
 */

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  module: string;
  message: string;
  data?: Record<string, unknown>;
}

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

const currentLogLevel = (() => {
  const envLevel = process.env.LOG_LEVEL || 'info';
  return LOG_LEVELS[envLevel as keyof typeof LOG_LEVELS] ?? LOG_LEVELS.info;
})();

function formatLogEntry(entry: LogEntry): string {
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}${dataStr}`;
}

function createLogEntry(
  level: LogEntry['level'],
  module: string,
  message: string,
  data?: Record<string, unknown>
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    data,
  };
}

export const logger = {
  debug: (module: string, message: string, data?: Record<string, unknown>): void => {
    if (currentLogLevel <= LOG_LEVELS.debug) {
      console.debug(formatLogEntry(createLogEntry('debug', module, message, data)));
    }
  },

  info: (module: string, message: string, data?: Record<string, unknown>): void => {
    if (currentLogLevel <= LOG_LEVELS.info) {
      console.info(formatLogEntry(createLogEntry('info', module, message, data)));
    }
  },

  warn: (module: string, message: string, data?: Record<string, unknown>): void => {
    if (currentLogLevel <= LOG_LEVELS.warn) {
      console.warn(formatLogEntry(createLogEntry('warn', module, message, data)));
    }
  },

  error: (module: string, message: string, error?: unknown): void => {
    if (currentLogLevel <= LOG_LEVELS.error) {
      const data = error instanceof Error ? { error: error.message, stack: error.stack } : { error };
      console.error(formatLogEntry(createLogEntry('error', module, message, data)));
    }
  },
};
