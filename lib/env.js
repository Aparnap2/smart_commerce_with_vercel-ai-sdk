/**
 * Environment variable validation
 * Validates all required environment variables at application startup
 */

const requiredEnvVars = {
  DATABASE_URL: process.env.DATABASE_URL,
};

const optionalEnvVars = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  OLLAMA_MODEL: 'mistral:latest', // Use mistral:latest which we confirmed works
  // Supabase Configuration (optional, for pgvector + auth)
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  // Embedding Configuration
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
  EMBEDDING_DIMENSIONS: parseInt(process.env.EMBEDDING_DIMENSIONS || '384'),
  // Stripe Configuration (for refund processing)
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  // Refund Policy Configuration
  REFUND_MAX_DAYS: parseInt(process.env.REFUND_MAX_DAYS || '30'),
  REFUND_MIN_AMOUNT: parseInt(process.env.REFUND_MIN_AMOUNT || '100'),
  // Redis Configuration (for LangGraph checkpointing)
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_DB: parseInt(process.env.REDIS_DB || '0', 10),
  REDIS_POOL_SIZE: parseInt(process.env.REDIS_POOL_SIZE || '10', 10),
  REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX || 'langgraph:',
  REDIS_USE_TLS: process.env.REDIS_USE_TLS === 'true',
  USE_REDIS: process.env.USE_REDIS === 'true',
  CHECKPOINT_TTL: parseInt(process.env.CHECKPOINT_TTL || '86400', 10), // 24 hours default
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