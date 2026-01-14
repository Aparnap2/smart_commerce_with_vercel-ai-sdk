/**
 * Redis Client Module
 * Initializes ioredis with connection pooling, health checks, and retry logic
 */

import Redis from 'ioredis';
import { logger } from './logger.js';

// Configuration interface for Redis connection
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number;
  retryStrategy?: (times: number) => number | null;
  connectTimeout?: number;
  commandTimeout?: number;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
  poolSize?: number;
}

// Default configuration
const defaultConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: 3,
  connectTimeout: 10000,
  commandTimeout: 5000,
  enableReadyCheck: true,
  lazyConnect: true,
  poolSize: parseInt(process.env.REDIS_POOL_SIZE || '10', 10),
};

// Redis client instance (singleton pattern)
let redisClient: Redis | null = null;

/**
 * Creates a new Redis client with connection pooling and retry logic
 * @param config - Optional configuration overrides
 * @returns Configured Redis client instance
 */
export function createRedisClient(config?: Partial<RedisConfig>): Redis {
  const finalConfig = { ...defaultConfig, ...config };

  // Exponential backoff retry strategy
  finalConfig.retryStrategy = (times: number): number | null => {
    if (times > 10) {
      logger.error('Redis: Max retry attempts exceeded');
      return null;
    }
    const delay = Math.min(times * 200, 5000);
    logger.warn(`Redis: Retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  };

  const client = new Redis({
    host: finalConfig.host,
    port: finalConfig.port,
    password: finalConfig.password,
    db: finalConfig.db,
    maxRetriesPerRequest: finalConfig.maxRetriesPerRequest,
    retryStrategy: finalConfig.retryStrategy,
    connectTimeout: finalConfig.connectTimeout,
    commandTimeout: finalConfig.commandTimeout,
    enableReadyCheck: finalConfig.enableReadyCheck,
    lazyConnect: finalConfig.lazyConnect,
    poolSize: finalConfig.poolSize,

    // TLS configuration for production
    tls: process.env.REDIS_USE_TLS === 'true' ? {} : undefined,

    // Key prefix for isolation
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'langgraph:',

    // Performance optimizations
    enableOfflineQueue: true,
    offlineQueueTimeout: 5000,
  });

  // Event handlers
  client.on('connect', () => {
    logger.info('Redis: Connected successfully');
  });

  client.on('ready', () => {
    logger.info('Redis: Ready to accept commands');
  });

  client.on('error', (error: Error) => {
    logger.error(`Redis: Connection error - ${error.message}`);
  });

  client.on('close', () => {
    logger.warn('Redis: Connection closed');
  });

  client.on('reconnecting', () => {
    logger.info('Redis: Reconnecting...');
  });

  return client;
}

/**
 * Gets or creates the singleton Redis client instance
 * @returns Redis client instance
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

/**
 * Health check for Redis connection
 * @returns Promise resolving to health status
 */
export async function checkRedisHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  const startTime = Date.now();
  const client = getRedisClient();

  try {
    const result = await client.ping();
    const latency = Date.now() - startTime;

    if (result === 'PONG') {
      return { healthy: true, latency };
    }

    return { healthy: false, error: `Unexpected response: ${result}` };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gracefully closes the Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis: Connection closed gracefully');
  }
}

/**
 * Checks if Redis is available (for fallback logic)
 * @returns true if Redis is configured and available
 */
export function isRedisAvailable(): boolean {
  return (
    process.env.USE_REDIS === 'true' &&
    !!process.env.REDIS_HOST &&
    process.env.REDIS_HOST !== 'localhost' &&
    process.env.REDIS_HOST !== '127.0.0.1'
  );
}

export type { Redis };
