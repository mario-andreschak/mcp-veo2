import type { LogLevel } from '../config.js';

// Define log level priorities (higher number = higher priority)
const LOG_LEVEL_PRIORITY: Record<string, number> = {
  'VERBOSE': 0,
  'DEBUG': 1,
  'INFO': 2,
  'WARN': 3,
  'ERROR': 4,
  'FATAL': 5,
  'NONE': 6
};

/**
 * Simple logger utility for the MCP server
 * Respects the LOG_LEVEL environment variable
 */
class Logger {
  private currentLogLevel: string = 'FATAL'; // Default to FATAL
  
  /**
   * Initialize the logger with the configured log level
   * This should be called after config is loaded to avoid circular dependencies
   * 
   * @param logLevel The log level from configuration
   */
  initialize(logLevel: LogLevel): void {
    this.currentLogLevel = logLevel.toUpperCase();
  }
  
  /**
   * Log a verbose message
   * 
   * @param message The message to log
   * @param data Optional data to include
   */
  verbose(message: string, data?: any): void {
    this.logWithLevel('VERBOSE', message, data);
  }
  
  /**
   * Log a debug message
   * 
   * @param message The message to log
   * @param data Optional data to include
   */
  debug(message: string, data?: any): void {
    this.logWithLevel('DEBUG', message, data);
  }
  
  /**
   * Log an info message
   * 
   * @param message The message to log
   * @param data Optional data to include
   */
  info(message: string, data?: any): void {
    this.logWithLevel('INFO', message, data);
  }
  
  /**
   * Log a warning message
   * 
   * @param message The message to log
   * @param data Optional data to include
   */
  warn(message: string, data?: any): void {
    this.logWithLevel('WARN', message, data);
  }
  
  /**
   * Log an error message
   * 
   * @param message The message to log
   * @param data Optional data to include
   */
  error(message: string, data?: any): void {
    this.logWithLevel('ERROR', message, data);
  }
  
  /**
   * Log a fatal message
   * 
   * @param message The message to log
   * @param data Optional data to include
   */
  fatal(message: string, data?: any): void {
    this.logWithLevel('FATAL', message, data);
  }
  
  /**
   * Check if a log level should be displayed based on the current log level setting
   * 
   * @param level The log level to check
   * @returns True if the log level should be displayed
   */
  private shouldLog(level: string): boolean {
    // If log level is NONE, don't log anything
    if (this.currentLogLevel === 'NONE') {
      return false;
    }
    
    // Get the priority of the current log level and the level being checked
    const currentPriority = LOG_LEVEL_PRIORITY[this.currentLogLevel] || 5; // Default to FATAL if not found
    const levelPriority = LOG_LEVEL_PRIORITY[level] || 0; // Default to lowest priority if not found
    
    // Only log if the level priority is >= the current log level priority
    return levelPriority >= currentPriority;
  }
  
  /**
   * Log a message with a specific level
   * Only logs messages at or above the configured log level
   * 
   * @param level The log level
   * @param message The message to log
   * @param data Optional data to include
   */
  private logWithLevel(level: string, message: string, data?: any): void {
    // Check if this log level should be displayed
    if (!this.shouldLog(level)) {
      return;
    }
    
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] ${message}`;
    
    if (data !== undefined) {
      if (level === 'VERBOSE') {
        // For verbose logs, always use JSON.stringify for the entire data object
        console.error(formattedMessage, JSON.stringify(data));
      } else {
        // For other log levels, pass the object directly
        console.error(formattedMessage, data);
      }
    } else {
      console.error(formattedMessage);
    }
  }
}

// Export a singleton instance
export const log = new Logger();
