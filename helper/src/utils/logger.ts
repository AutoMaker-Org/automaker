type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private prefix = '[Automaker Helper]';
  
  private log(level: LogLevel, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const message = `${this.prefix} ${timestamp} [${level.toUpperCase()}]`;
    
    switch (level) {
      case 'debug':
        console.debug(message, ...args);
        break;
      case 'info':
        console.log(message, ...args);
        break;
      case 'warn':
        console.warn(message, ...args);
        break;
      case 'error':
        console.error(message, ...args);
        break;
    }
  }

  debug(...args: any[]) {
    if (process.env.DEBUG) {
      this.log('debug', ...args);
    }
  }

  info(...args: any[]) {
    this.log('info', ...args);
  }

  warn(...args: any[]) {
    this.log('warn', ...args);
  }

  error(...args: any[]) {
    this.log('error', ...args);
  }
}

export const logger = new Logger();