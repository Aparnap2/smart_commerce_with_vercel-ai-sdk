/**
 * Checkpoint Manager Module
 * Manages LangGraph state persistence in Redis with TTL support
 */

import { getRedisClient, type Redis } from './client.js';
import { logger } from './logger.js';

// Key prefixes for checkpoint storage
const THREAD_PREFIX = 'thread:';
const CHECKPOINT_PREFIX = 'checkpoint:';
const METADATA_PREFIX = 'metadata:';
const INDEX_PREFIX = 'index:';

/**
 * Checkpoint data structure
 */
export interface CheckpointData {
  threadId: string;
  checkpointId: string;
  state: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: number;
  expiresAt?: number;
}

/**
 * Checkpoint metadata
 */
export interface CheckpointMetadata {
  threadId: string;
  checkpointCount: number;
  lastCheckpointId: string;
  lastUpdated: number;
}

/**
 * Serializes data for Redis storage
 * @param data - Data to serialize
 * @returns JSON string
 */
function serialize(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Deserializes data from Redis
 * @param data - JSON string from Redis
 * @returns Parsed data
 */
function deserialize<T = unknown>(data: string): T {
  return JSON.parse(data) as T;
}

/**
 * Checkpoint Manager class for Redis-based state persistence
 */
export class CheckpointManager {
  private client: Redis;
  private defaultTtl: number;

  /**
   * Creates a new CheckpointManager instance
   * @param client - Redis client instance (optional, uses singleton if not provided)
   * @param defaultTtl - Default TTL in seconds (default: 24 hours)
   */
  constructor(client?: Redis, defaultTtl: number = 86400) {
    this.client = client ?? getRedisClient();
    this.defaultTtl = defaultTtl;
  }

  /**
   * Generates Redis key for checkpoint data
   */
  private checkpointKey(threadId: string, checkpointId: string): string {
    return `${CHECKPOINT_PREFIX}${threadId}:${checkpointId}`;
  }

  /**
   * Generates Redis key for checkpoint metadata
   */
  private metadataKey(threadId: string): string {
    return `${METADATA_PREFIX}${threadId}`;
  }

  /**
   * Generates Redis key for thread index
   */
  private threadIndexKey(threadId: string): string {
    return `${INDEX_PREFIX}${threadId}`;
  }

  /**
   * Saves a checkpoint to Redis
   * @param threadId - Thread identifier
   * @param checkpoint - Checkpoint data to save
   * @param state - State object to persist
   * @param metadata - Optional metadata
   * @param ttl - Optional TTL override in seconds
   */
  async saveCheckpoint(
    threadId: string,
    checkpoint: Record<string, unknown>,
    state: Record<string, unknown>,
    metadata?: Record<string, unknown>,
    ttl?: number
  ): Promise<void> {
    const checkpointId = checkpoint.id as string;
    const now = Date.now();
    const expiresAt = now + (ttl ?? this.defaultTtl) * 1000;

    const checkpointData: CheckpointData = {
      threadId,
      checkpointId,
      state,
      metadata: metadata ?? {},
      createdAt: now,
      expiresAt,
    };

    const pipeline = this.client.pipeline();

    // Store checkpoint data
    pipeline.set(
      this.checkpointKey(threadId, checkpointId),
      serialize(checkpointData),
      'EX',
      ttl ?? this.defaultTtl
    );

    // Update thread index with sorted set (score = timestamp)
    pipeline.zadd(this.threadIndexKey(threadId), now, checkpointId);

    // Update thread metadata
    const threadMeta: CheckpointMetadata = {
      threadId,
      checkpointCount: 0,
      lastCheckpointId: checkpointId,
      lastUpdated: now,
    };

    pipeline.hset(this.metadataKey(threadId), serialize(threadMeta));

    await pipeline.exec();

    logger.info('CheckpointManager', `Saved checkpoint ${checkpointId} for thread ${threadId}`, {
      threadId,
      checkpointId,
      ttl: ttl ?? this.defaultTtl,
    });
  }

  /**
   * Loads a checkpoint from Redis
   * @param threadId - Thread identifier
   * @param checkpointId - Checkpoint ID (optional, loads latest if not provided)
   * @returns Checkpoint data or null if not found
   */
  async loadCheckpoint(
    threadId: string,
    checkpointId?: string
  ): Promise<CheckpointData | null> {
    const targetId = checkpointId ?? (await this.getLatestCheckpointId(threadId));

    if (!targetId) {
      logger.debug('CheckpointManager', `No checkpoint found for thread ${threadId}`);
      return null;
    }

    const data = await this.client.get(this.checkpointKey(threadId, targetId));

    if (!data) {
      logger.warn('CheckpointManager', `Checkpoint ${targetId} not found for thread ${threadId}`);
      return null;
    }

    return deserialize<CheckpointData>(data);
  }

  /**
   * Lists all checkpoints for a thread
   * @param threadId - Thread identifier
   * @param limit - Maximum number of checkpoints to return
   * @param before - Only return checkpoints created before this checkpoint ID
   * @returns Array of checkpoint metadata
   */
  async listCheckpoints(
    threadId: string,
    limit: number = 10,
    before?: string
  ): Promise<Array<{ checkpointId: string; createdAt: number }>> {
    let ids: Array<{ value: string; score: number }>;

    if (before) {
      // Get checkpoint creation time for 'before' checkpoint
      const beforeData = await this.client.get(this.checkpointKey(threadId, before));
      if (beforeData) {
        const checkpoint = deserialize<CheckpointData>(beforeData);
        ids = await this.client.zrangebyscorewithscores(
          this.threadIndexKey(threadId),
          '-inf',
          checkpoint.createdAt,
          'LIMIT',
          0,
          limit + 1
        );
        // Remove the 'before' checkpoint itself
        ids = ids.filter((item) => item.value !== before);
      } else {
        ids = await this.client.zrevrange(
          this.threadIndexKey(threadId),
          0,
          limit - 1,
          'WITHSCORES'
        ) as Array<{ value: string; score: number }>;
      }
    } else {
      const rawIds = await this.client.zrevrange(
        this.threadIndexKey(threadId),
        0,
        limit - 1,
        'WITHSCORES'
      );
      ids = rawIds.map((item, index) => ({
        value: item,
        score: parseFloat(rawIds[index + 1] as string) ?? 0,
      })) as Array<{ value: string; score: number }>;
    }

    return ids.map((item) => ({
      checkpointId: item.value,
      createdAt: item.score,
    }));
  }

  /**
   * Gets the latest checkpoint ID for a thread
   * @param threadId - Thread identifier
   * @returns Latest checkpoint ID or null
   */
  async getLatestCheckpointId(threadId: string): Promise<string | null> {
    const result = await this.client.zrevrange(
      this.threadIndexKey(threadId),
      0,
      0
    );
    return result[0] ?? null;
  }

  /**
   * Deletes a specific checkpoint
   * @param threadId - Thread identifier
   * @param checkpointId - Checkpoint ID to delete
   * @returns true if checkpoint was deleted
   */
  async deleteCheckpoint(threadId: string, checkpointId: string): Promise<boolean> {
    const pipeline = this.client.pipeline();

    // Delete checkpoint data
    pipeline.del(this.checkpointKey(threadId, checkpointId));

    // Remove from thread index
    pipeline.zrem(this.threadIndexKey(threadId), checkpointId);

    // Update metadata
    const metaData = await this.client.hget(this.metadataKey(threadId), 'data');
    if (metaData) {
      const metadata = deserialize<CheckpointMetadata>(metaData);
      metadata.checkpointCount = Math.max(0, metadata.checkpointCount - 1);
      metadata.lastUpdated = Date.now();
      pipeline.hset(this.metadataKey(threadId), serialize(metadata));
    }

    await pipeline.exec();

    logger.info('CheckpointManager', `Deleted checkpoint ${checkpointId} for thread ${threadId}`, {
      threadId,
      checkpointId,
    });

    return true;
  }

  /**
   * Cleans up expired checkpoints for a thread
   * @param threadId - Thread identifier
   * @param maxAge - Maximum age in milliseconds (default: 7 days)
   * @returns Number of checkpoints cleaned up
   */
  async cleanupExpired(threadId: string, maxAge: number = 604800000): Promise<number> {
    const cutoffTime = Date.now() - maxAge;

    // Get all checkpoints older than cutoff
    const oldIds = await this.client.zrangebyscore(
      this.threadIndexKey(threadId),
      '-inf',
      cutoffTime
    );

    if (oldIds.length === 0) {
      return 0;
    }

    const pipeline = this.client.pipeline();

    // Delete all old checkpoint data
    for (const checkpointId of oldIds) {
      pipeline.del(this.checkpointKey(threadId, checkpointId));
    }

    // Remove from thread index
    pipeline.zremrangebyscore(this.threadIndexKey(threadId), '-inf', cutoffTime);

    await pipeline.exec();

    logger.info('CheckpointManager', `Cleaned up ${oldIds.length} expired checkpoints for thread ${threadId}`, {
      threadId,
      cleanedCount: oldIds.length,
      maxAge,
    });

    return oldIds.length;
  }

  /**
   * Gets thread metadata
   * @param threadId - Thread identifier
   * @returns Thread metadata or null
   */
  async getThreadMetadata(threadId: string): Promise<CheckpointMetadata | null> {
    const data = await this.client.hget(this.metadataKey(threadId), 'data');
    if (!data) {
      return null;
    }
    return deserialize<CheckpointMetadata>(data);
  }

  /**
   * Deletes all checkpoints for a thread
   * @param threadId - Thread identifier
   * @returns true if thread was deleted
   */
  async deleteThread(threadId: string): Promise<boolean> {
    // Get all checkpoint IDs for this thread
    const checkpointIds = await this.client.zrange(this.threadIndexKey(threadId), 0, -1);

    if (checkpointIds.length === 0) {
      return true;
    }

    const pipeline = this.client.pipeline();

    // Delete all checkpoint data
    for (const checkpointId of checkpointIds) {
      pipeline.del(this.checkpointKey(threadId, checkpointId));
    }

    // Delete thread index and metadata
    pipeline.del(this.threadIndexKey(threadId));
    pipeline.del(this.metadataKey(threadId));

    await pipeline.exec();

    logger.info('CheckpointManager', `Deleted thread ${threadId} with ${checkpointIds.length} checkpoints`, {
      threadId,
      checkpointCount: checkpointIds.length,
    });

    return true;
  }

  /**
   * Extends TTL for all checkpoints in a thread
   * @param threadId - Thread identifier
   * @param additionalTtl - Additional TTL in seconds
   * @returns Number of checkpoints updated
   */
  async extendTtl(threadId: string, additionalTtl: number): Promise<number> {
    const checkpointIds = await this.client.zrange(this.threadIndexKey(threadId), 0, -1);

    if (checkpointIds.length === 0) {
      return 0;
    }

    const pipeline = this.client.pipeline();

    for (const checkpointId of checkpointIds) {
      pipeline.expire(this.checkpointKey(threadId, checkpointId), additionalTtl);
    }

    await pipeline.exec();

    logger.info('CheckpointManager', `Extended TTL for ${checkpointIds.length} checkpoints in thread ${threadId}`, {
      threadId,
      checkpointCount: checkpointIds.length,
      additionalTtl,
    });

    return checkpointIds.length;
  }
}

// Singleton instance
let checkpointManager: CheckpointManager | null = null;

/**
 * Gets or creates the singleton CheckpointManager instance
 * @param client - Optional Redis client
 * @param defaultTtl - Optional default TTL
 */
export function getCheckpointManager(client?: Redis, defaultTtl?: number): CheckpointManager {
  if (!checkpointManager) {
    checkpointManager = new CheckpointManager(client, defaultTtl);
  }
  return checkpointManager;
}
