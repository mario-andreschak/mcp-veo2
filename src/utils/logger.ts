/**
 * Simple logger utility for the MCP server
 */
class Logger {
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
   * Log a message with a specific level
   * 
   * @param level The log level
   * @param message The message to log
   * @param data Optional data to include
   */
  private logWithLevel(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] ${message}`;
    
    if (data !== undefined) {
      if (level === 'VERBOSE') {
        // For verbose logs, always use JSON.stringify for the entire data object
        console.log(formattedMessage, JSON.stringify(data));
      } else {
        // For other log levels, pass the object directly
        console.log(formattedMessage, data);
      }
    } else {
      console.log(formattedMessage);
    }
  }
}

// Export a singleton instance
export const log = new Logger();
