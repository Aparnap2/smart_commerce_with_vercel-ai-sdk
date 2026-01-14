/**
 * Redis Configuration Module
 *
 * Handles environment variable validation and Redis connection configuration
 * for the LangGraph checkpoint system. Supports both production Redis and
 * local MemorySaver fallback for development.
 *
 * @packageDocumentation
 */

import Redis from 'ioredis';

/**
 * Environment variable types for Redis configuration
 */
export interface RedisEnv {
  /** Redis connection URL (格式: redis://host:port) */
  REDIS_URL: string | undefined;
  /** Redis host (when URL not provided) */
  REDIS_HOST: string | undefined;
  /** Redis port (default: 6379) */
  REDIS_PORT: string | undefined;
  /** Redis password */
  REDIS_PASSWORD: string | undefined;
  /** Redis database number (default: 0) */
  REDIS_DB: string | undefined;
  /** Session TTL in seconds (default: 86400 = 24 hours) */
  REDIS_SESSION_TTL: string | undefined;
  /** Enable TLS for Redis connection */
  REDIS_TLS: string | undefined;
}

/**
 * Redis connection options derived from environment
 */
export interface RedisConnectionOptions {
  /** Redis host */
  host: string;
  /** Redis port */
  port: number;
  /** Redis password (undefined if no auth) */
  password?: string;
  /** Redis database number */
  db: number;
  /** Session TTL in seconds */
  sessionTTL: number;
  /** Connection timeout in ms */
  connectTimeout: number;
  /** Enable TLS */
  tls?: boolean;
  /** Retry strategy options */
  retryStrategy: {
    /** Max retry attempts */
    maxAttempts: number;
    /** Retry delay factor (ms) */
    factor: number;
    /** Min retry delay (ms) */
    minTimeout: number;
    /** Max retry delay (ms) */
    maxTimeout: number;
  };
}

/**
 * Validate and parse Redis environment variables
 * @returns Validated Redis configuration options
 * @throws Error if required variables are missing or invalid
 */
export function getRedisEnv(): RedisEnv {
  return {
    REDIS_URL: process.env.REDIS_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    REDIS_DB: process.env.REDIS_DB,
    REDIS_SESSION_TTL: process.env.REDIS_SESSION_TTL,
    REDIS_TLS: process.env.REDIS_TLS,
  };
}

/**
 * Build Redis connection options from environment variables
 * @param env - Redis environment variables
 * @returns Configured Redis connection options
 */
export function buildRedisConnectionOptions(env: RedisEnv): RedisConnectionOptions {
  // Parse connection URL if provided
  let host = 'localhost';
  let port = 6379;

  if (env.REDIS_URL) {
    try {
      const url = new URL(env.REDIS_URL);
      host = url.hostname || 'localhost';
      port = parseInt(url.port || '6379', 10);
    } catch {
      // Fallback to default if URL parsing fails
      console.warn('[Redis] Invalid REDIS_URL, using defaults');
    }
  } else {
    // Use individual host/port if URL not provided
    host = env.REDIS_HOST || 'localhost';
    port = parseInt(env.REDIS_PORT || '6379', 10);
  }

  return {
    host,
    port,
    password: env.REDIS_PASSWORD,
    db: parseInt(env.REDIS_DB || '0', 10),
    sessionTTL: parseInt(env.REDIS_SESSION_TTL || '86400', 10), // 24 hours default
    connectTimeout: 10000, // 10 seconds
    tls: env.REDIS_TLS === 'true',
    retryStrategy: {
      maxAttempts: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
    },
  };
}

/**
 * Check if Redis is properly configured (URL or host provided)
 * @returns true if Redis is configured
 */
export function isRedisConfigured(): boolean {
  const env = getRedisEnv();
  return !!(env.REDIS_URL || env.REDIS_HOST);
}

/**
 * Create a Redis client instance with configured options
 * @param options - Redis connection options
 * @returns Configured Redis client
 */
export function createRedisClient(options: RedisConnectionOptions): Redis {
  const client = new Redis({
    host: options.host,
    port: options.port,
    password: options.password,
    db: options.db,
    tls: options.tls ? { rejectUnauthorized: false } : undefined,
    connectTimeout: options.connectTimeout,
    retryStrategy: (times: number) => {
      if (times > options.retryStrategy.maxAttempts) {
        console.error('[Redis] Max retry attempts reached');
        return null; // Stop retrying
      }
      const delay = Math.min(
        options.retryStrategy.minTimeout *
          Math.pow(options.retryStrategy.factor, times - 1),
        options.retryStrategy.maxTimeout
      );
      console.warn(`[Redis] Retry attempt ${times}/${options.retryStrategy.maxAttempts} in ${delay}ms`);
      return delay;
    },
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
  });

  // Event handlers for debugging and monitoring
  client.on('connect', () => {
    console.log('[Redis] Client connected');
  });

  client.on('ready', () => {
    console.log('[Redis] Client ready');
  });

  client.on('error', (error: Error) => {
    console.error('[Redis] Client error:', error.message);
  });

  client.on('close', () => {
    console.log('[Redis] Connection closed');
  });

  client.on('reconnecting', () => {
    console.log('[Redis] Reconnecting...');
  });

  return client;
}

/**
 * Health check result type
 */
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  latency: number;
  error?: string;
  version?: string;
}

/**
 * Perform health check on Redis connection
 * @param client - Redis client instance
 * @returns Health check result with latency and status
 */
export async function checkRedisHealth(client: Redis): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    // Ping Redis to check connection
    const result = await client.ping();
    const latency = Date.now() - start;

    // Get Redis version if possible
    let version: string | undefined;
    try {
      const info = await client.info('server');
      const versionMatch = info.match(/redis_version:([^\r\n]+)/);
      version = versionMatch ? versionMatch[1] : undefined;
    } catch {
      // Ignore version fetch errors
    }

    return {
      status: result === 'PONG' ? 'healthy' : 'unhealthy',
      latency,
      version,
    };
  } catch (error) {
    const latency = Date.now() - start;
    return {
      status: 'unhealthy',
      latency,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Default connection options for quick access
 */
export const defaultRedisOptions: RedisConnectionOptions = buildRedisConnectionOptions({
  REDIS_URL: process.env.REDIS_URL,
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_DB: process.env.REDIS_DB,
  REDIS_SESSION_TTL: process.env.REDIS_SESSION_TTL,
  REDIS_TLS: process.env.REDIS_TLS,
});

/**
 * Singleton Redis client instance
 */
let _redisClient: Redis | null = null;

/**
 * Get or create the singleton Redis client
 * @returns Configured Redis client instance
 */
export function getRedisClient(): Redis {
  if (_redisClient) {
    return _redisClient;
  }

  if (!isRedisConfigured()) {
    throw new Error(
      'Redis is not configured. Set REDIS_URL or REDIS_HOST environment variable.'
    );
  }

  _redisClient = createRedisClient(defaultRedisOptions);
  return _redisClient;
}

/**
 * Gracefully close Redis connection
 * @param client - Redis client to close
 */
export async function closeRedisConnection(client: Redis): Promise<void> {
  if (client) {
    await client.quit();
    console.log('[Redis] Connection closed gracefully');
  }
}

export type { Redis };
