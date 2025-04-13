import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

// Define schema for environment variables
const ConfigSchema = z.object({
  // Google API Key for Gemini/Veo2
  GOOGLE_API_KEY: z.string().min(1),
  
  // Server configuration (optional with default)
  PORT: z.string().transform(Number).default('3000'),
  
  // Storage directory for generated videos (optional with default)
  STORAGE_DIR: z.string().default('./generated-videos'),
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
        console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
        console.error('Please check your .env file or environment configuration.');
      } else {
        console.error('❌ Invalid environment variables:', error.errors);
      }
    } else {
      console.error('❌ Error parsing configuration:', error);
    }
    process.exit(1);
  }
};

// Export the validated config
const config = parseConfig();
export default config;
