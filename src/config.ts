import dotenv from 'dotenv';
import { z } from 'zod';
import { log } from './utils/logger.js';

// Load environment variables from .env file
dotenv.config();

// Define log levels
export type LogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'none';

// Define schema for environment variables
const ConfigSchema = z.object({
  // Google API Key for Gemini/Veo2
  GOOGLE_API_KEY: z.string().min(1),
  
  // Server configuration (optional with default)
  PORT: z.string().transform(Number).default('3000'),
  
  // Storage directory for generated videos (optional with default)
  STORAGE_DIR: z.string().default('./generated-videos'),
  
  // Logging level (optional with default to 'fatal')
  LOG_LEVEL: z.enum(['verbose', 'debug', 'info', 'warn', 'error', 'fatal', 'none']).default('fatal'),
});

// Parse and validate environment variables
const parseConfig = () => {
  try {
    return ConfigSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .filter(e => e.code === 'invalid_type' && e.received === 'undefined')
        .map(e => e.path.join('.'));
      
      if (missingVars.length > 0) {
        log.fatal(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
        log.fatal('Please check your .env file or environment configuration.');
      } else {
        log.fatal('❌ Invalid environment variables:', error.errors);
      }
    } else {
      log.fatal('❌ Error parsing configuration:', error);
    }
    process.exit(1);
  }
};

// Parse and export the validated config
const config = parseConfig();

// Initialize the logger with the configured log level
log.initialize(config.LOG_LEVEL);

export default config;
