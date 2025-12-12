/**
 * Environment variable validation
 * Validates all required environment variables at application startup
 */

const requiredEnvVars = {
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};

const optionalEnvVars = {
  // Add optional environment variables here if needed
};

function validateEnvironment() {
  const missing = [];

  // Check required variables
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env.local file and ensure all required variables are set.'
    );
  }

  // Log validation success (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ Environment variables validated successfully');
  }

  return {
    ...requiredEnvVars,
    ...optionalEnvVars,
  };
}

// Validate on module load
const env = validateEnvironment();

export { env };
export default env;