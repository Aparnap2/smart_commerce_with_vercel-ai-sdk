/**
 * Redis Checkpoint Manager for LangGraph
 *
 * Provides persistent checkpoint storage for LangGraph agent state using Redis.
 * Includes MemorySaver fallback for local development when Redis is unavailable.
 *
 * @packageDocumentation
 */

import Redis from 'ioredis';
import {
  createRedisClient,
  getRedisEnv,
  buildRedisConnectionOptions,
  closeRedisConnection,
  checkRedisHealth,
  isRedisConfigured,
} from './config.js';
import { AgentState } from '../agents/state.js';

/**
 * Checkpoint key prefix for LangGraph state
 */
const CHECKPOINT_PREFIX = 'langgraph:checkpoint:';

/**
 * Thread metadata key prefix
 */
const THREAD_META_PREFIX = 'langgraph:thread:';

/**
 * Thread list key
 */
const THREAD_LIST_KEY = 'langgraph:threads';

/**
 * Checkpoint data structure stored in Redis
 */
export interface CheckpointData {
  /** The serialized agent state */
  state: AgentState;
  /** Checkpoint timestamp */
  timestamp: number;
  /** Number of checkpoint saves */
  version: number;
  /** Node visits count */
  nodeVisits: Record<string, number>;
}

/**
 * Thread metadata stored in Redis
 */
export interface ThreadMetadata {
  threadId: string;
  userId: string;
  createdAt: number;
  lastAccessedAt: number;
  messageCount: number;
  totalTokens: number;
}

/**
 * Thread list item for display
 */
export interface ThreadListItem {
  threadId: string;
  userId: string;
  createdAt: number;
  lastAccessedAt: number;
  messageCount: number;
  preview: string;
}

/**
 * Result of thread list query
 */
export interface ThreadListResult {
  threads: ThreadListItem[];
  total: number;
}

/**
 * Memory-based checkpoint saver for local development
 * Fallback when Redis is unavailable
 */
export class MemoryCheckpointSaver {
  private checkpoints: Map<string, CheckpointData> = new Map();
  private threadMetadata: Map<string, ThreadMetadata> = new Map();
  private readonly maxCheckpoints: number;
  private readonly maxAge: number;

  constructor(options: { maxCheckpoints?: number; maxAge?: number } = {}) {
    this.maxCheckpoints = options.maxCheckpoints || 100;
    this.maxAge = options.maxAge || 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Get checkpoint for a specific thread and checkpoint ID
   */
  async get(threadId: string, checkpointId: string): Promise<CheckpointData | null> {
    const key = this.getCheckpointKey(threadId, checkpointId);
    const checkpoint = this.checkpoints.get(key);
    if (!checkpoint) return null;

    // Check if checkpoint has expired
    if (Date.now() - checkpoint.timestamp > this.maxAge) {
      this.checkpoints.delete(key);
      return null;
    }

    return checkpoint;
  }

  /**
   * List all checkpoints for a thread
   */
  async list(threadId: string): Promise<string[]> {
    const prefix = `${CHECKPOINT_PREFIX}${threadId}:`;
    const checkpoints: string[] = [];

    for (const key of Array.from(this.checkpoints.keys())) {
      if (key.startsWith(prefix)) {
        const checkpointId = key.substring(prefix.length);
        checkpoints.push(checkpointId);
      }
    }

    return checkpoints.sort();
  }

  /**
   * Save checkpoint for a thread
   */
  async put(
    threadId: string,
    checkpointId: string,
    data: CheckpointData
  ): Promise<void> {
    const key = this.getCheckpointKey(threadId, checkpointId);
    this.checkpoints.set(key, data);

    // Update thread metadata
    const metaKey = `${THREAD_META_PREFIX}${threadId}`;
    const existingMeta = this.threadMetadata.get(metaKey);
    this.threadMetadata.set(metaKey, {
      threadId,
      userId: data.state.metadata?.user_id || 'unknown',
      createdAt: existingMeta?.createdAt || Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: data.state.messages?.length || 0,
      totalTokens: data.state.metadata?.total_tokens || 0,
    });

    // Cleanup old checkpoints if needed
    if (this.checkpoints.size > this.maxCheckpoints) {
      this.evictOldestCheckpoints();
    }
  }

  /**
   * Delete a specific checkpoint
   */
  async delete(threadId: string, checkpointId: string): Promise<boolean> {
    const key = this.getCheckpointKey(threadId, checkpointId);
    return this.checkpoints.delete(key);
  }

  /**
   * Delete all checkpoints for a thread
   */
  async deleteThread(threadId: string): Promise<number> {
    let deleted = 0;
    const prefix = `${CHECKPOINT_PREFIX}${threadId}:`;

    for (const key of Array.from(this.checkpoints.keys())) {
      if (key.startsWith(prefix)) {
        this.checkpoints.delete(key);
        deleted++;
      }
    }

    // Delete thread metadata
    this.threadMetadata.delete(`${THREAD_META_PREFIX}${threadId}`);

    return deleted;
  }

  /**
   * Get thread metadata
   */
  async getThreadMetadata(threadId: string): Promise<ThreadMetadata | null> {
    return this.threadMetadata.get(`${THREAD_META_PREFIX}${threadId}`) || null;
  }

  /**
   * List all threads for a user
   */
  async listThreads(userId?: string): Promise<ThreadListResult> {
    const threads: ThreadListItem[] = [];

    for (const [key, meta] of Array.from(this.threadMetadata.entries())) {
      if (key.startsWith(THREAD_META_PREFIX)) {
        if (userId && meta.userId !== userId) continue;

        // Get latest checkpoint for preview
        const checkpointIds = await this.list(meta.threadId);
        let preview = '';
        if (checkpointIds.length > 0) {
          const latestCheckpoint = await this.get(meta.threadId, checkpointIds[0]);
          preview = latestCheckpoint?.state.messages?.slice(-1)[0]?.content || '';
        }

        threads.push({
          threadId: meta.threadId,
          userId: meta.userId,
          createdAt: meta.createdAt,
          lastAccessedAt: meta.lastAccessedAt,
          messageCount: meta.messageCount,
          preview: preview.substring(0, 100),
        });
      }
    }

    // Sort by last accessed (most recent first)
    threads.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

    return { threads, total: threads.length };
  }

  /**
   * Clear all checkpoints (use with caution)
   */
  async clearAll(): Promise<void> {
    this.checkpoints.clear();
    this.threadMetadata.clear();
  }

  /**
   * Generate checkpoint key
   */
  private getCheckpointKey(threadId: string, checkpointId: string): string {
    return `${CHECKPOINT_PREFIX}${threadId}:${checkpointId}`;
  }

  /**
   * Evict oldest checkpoints when limit is reached
   */
  private evictOldestCheckpoints(): void {
    const entries: Array<[string, CheckpointData]> = [];

    for (const [key, data] of Array.from(this.checkpoints.entries())) {
      entries.push([key, data]);
    }

    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest until under limit
    const toRemove = this.checkpoints.size - this.maxCheckpoints;
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.checkpoints.delete(entries[i][0]);
    }
  }
}

/**
 * Redis-based checkpoint saver for production
 * Provides persistent storage with TTL support
 */
export class RedisCheckpointSaver {
  private client: Redis;
  private readonly sessionTTL: number;
  private readonly prefix: string;

  constructor(client: Redis, options: { sessionTTL?: number; prefix?: string } = {}) {
    this.client = client;
    this.sessionTTL = options.sessionTTL || 86400; // 24 hours default
    this.prefix = options.prefix || CHECKPOINT_PREFIX;
  }

  /**
   * Get checkpoint for a specific thread and checkpoint ID
   */
  async get(threadId: string, checkpointId: string): Promise<CheckpointData | null> {
    try {
      const key = this.getCheckpointKey(threadId, checkpointId);
      const data = await this.client.get(key);

      if (!data) return null;

      const parsed = JSON.parse(data) as CheckpointData;

      // Check if checkpoint has expired based on TTL
      const ttl = await this.client.ttl(key);
      if (ttl === -2) return null; // Key doesn't exist

      return parsed;
    } catch (error) {
      console.error('[RedisCheckpointer] Error getting checkpoint:', error);
      return null;
    }
  }

  /**
   * List all checkpoints for a thread
   */
  async list(threadId: string): Promise<string[]> {
    try {
      const pattern = `${this.prefix}${threadId}:*`;
      const keys = await this.client.keys(pattern);

      // Extract checkpoint IDs from keys
      const prefixLength = `${this.prefix}${threadId}:`.length;
      return keys.map((key) => key.substring(prefixLength)).sort();
    } catch (error) {
      console.error('[RedisCheckpointer] Error listing checkpoints:', error);
      return [];
    }
  }

  /**
   * Save checkpoint for a thread
   */
  async put(
    threadId: string,
    checkpointId: string,
    data: CheckpointData
  ): Promise<void> {
    try {
      const key = this.getCheckpointKey(threadId, checkpointId);
      const serialized = JSON.stringify(data);

      // Use SET with EX for TTL
      await this.client.setex(key, this.sessionTTL, serialized);

      // Update thread metadata in separate key
      await this.updateThreadMetadata(threadId, data);

      // Add thread to user's thread list
      const userId = data.state.metadata?.user_id;
      if (userId) {
        await this.addToThreadList(userId, threadId);
      }
    } catch (error) {
      console.error('[RedisCheckpointer] Error saving checkpoint:', error);
      throw error;
    }
  }

  /**
   * Delete a specific checkpoint
   */
  async delete(threadId: string, checkpointId: string): Promise<boolean> {
    try {
      const key = this.getCheckpointKey(threadId, checkpointId);
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      console.error('[RedisCheckpointer] Error deleting checkpoint:', error);
      return false;
    }
  }

  /**
   * Delete all checkpoints for a thread
   */
  async deleteThread(threadId: string): Promise<number> {
    try {
      const pattern = `${this.prefix}${threadId}:*`;
      const keys = await this.client.keys(pattern);

      if (keys.length === 0) return 0;

      // Delete all matching keys
      const result = await this.client.del(...keys);

      // Also delete thread metadata
      await this.client.del(`${THREAD_META_PREFIX}${threadId}`);

      return result;
    } catch (error) {
      console.error('[RedisCheckpointer] Error deleting thread:', error);
      return 0;
    }
  }

  /**
   * Get thread metadata
   */
  async getThreadMetadata(threadId: string): Promise<ThreadMetadata | null> {
    try {
      const key = `${THREAD_META_PREFIX}${threadId}`;
      const data = await this.client.get(key);

      if (!data) return null;

      return JSON.parse(data) as ThreadMetadata;
    } catch (error) {
      console.error('[RedisCheckpointer] Error getting thread metadata:', error);
      return null;
    }
  }

  /**
   * List all threads for a user
   */
  async listThreads(userId?: string): Promise<ThreadListResult> {
    try {
      if (!userId) {
        // If no user specified, return all threads (limited)
        const pattern = `${THREAD_META_PREFIX}*`;
        const keys = await this.client.keys(pattern);

        const threads: ThreadListItem[] = await Promise.all(
          keys.slice(0, 100).map(async (key) => {
            const data = await this.client.get(key);
            const meta = data ? (JSON.parse(data) as ThreadMetadata) : null;
            if (!meta) return null;

            return {
              threadId: meta.threadId,
              userId: meta.userId,
              createdAt: meta.createdAt,
              lastAccessedAt: meta.lastAccessedAt,
              messageCount: meta.messageCount,
              preview: '',
            };
          })
        );

        return {
          threads: threads.filter((t): t is ThreadListItem => t !== null),
          total: keys.length,
        };
      }

      // Get threads for specific user from their thread list
      const userThreadListKey = `${THREAD_LIST_KEY}:${userId}`;
      const threadIds = await this.client.smembers(userThreadListKey);

      const threads: ThreadListItem[] = await Promise.all(
        threadIds.slice(0, 100).map(async (threadId) => {
          const meta = await this.getThreadMetadata(threadId);
          if (!meta) return null;

          return {
            threadId: meta.threadId,
            userId: meta.userId,
            createdAt: meta.createdAt,
            lastAccessedAt: meta.lastAccessedAt,
            messageCount: meta.messageCount,
            preview: '',
          };
        })
      );

      return {
        threads: threads.filter((t): t is ThreadListItem => t !== null),
        total: threadIds.length,
      };
    } catch (error) {
      console.error('[RedisCheckpointer] Error listing threads:', error);
      return { threads: [], total: 0 };
    }
  }

  /**
   * Get the Redis client for direct operations
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Health check for the Redis connection
   */
  async healthCheck(): Promise<{ status: boolean; latency: number }> {
    const start = Date.now();
    try {
      const result = await this.client.ping();
      return {
        status: result === 'PONG',
        latency: Date.now() - start,
      };
    } catch {
      return { status: false, latency: Date.now() - start };
    }
  }

  /**
   * Generate checkpoint key
   */
  private getCheckpointKey(threadId: string, checkpointId: string): string {
    return `${this.prefix}${threadId}:${checkpointId}`;
  }

  /**
   * Update thread metadata
   */
  private async updateThreadMetadata(
    threadId: string,
    data: CheckpointData
  ): Promise<void> {
    const meta: ThreadMetadata = {
      threadId,
      userId: data.state.metadata?.user_id || 'unknown',
      createdAt: data.state.metadata?.session_start || Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: data.state.messages?.length || 0,
      totalTokens: data.state.metadata?.total_tokens || 0,
    };

    const key = `${THREAD_META_PREFIX}${threadId}`;
    await this.client.setex(key, this.sessionTTL, JSON.stringify(meta));
  }

  /**
   * Add thread to user's thread list
   */
  private async addToThreadList(userId: string, threadId: string): Promise<void> {
    const key = `${THREAD_LIST_KEY}:${userId}`;
    await this.client.sadd(key, threadId);
    // Set TTL on the thread list (refresh TTL on each addition)
    await this.client.expire(key, this.sessionTTL);
  }
}

/**
 * Factory function to create appropriate checkpoint saver
 * Uses Redis if configured, otherwise MemoryCheckpointSaver
 */
export async function createCheckpointSaver(): Promise<{
  saver: RedisCheckpointSaver | MemoryCheckpointSaver;
  type: 'redis' | 'memory';
}> {
  if (!isRedisConfigured()) {
    console.log('[Checkpointer] Using in-memory checkpoint saver (development mode)');
    return {
      saver: new MemoryCheckpointSaver(),
      type: 'memory',
    };
  }

  const env = getRedisEnv();
  const options = buildRedisConnectionOptions(env);
  const client = createRedisClient(options);

  try {
    // Test connection
    const health = await checkRedisHealth(client);
    if (health.status !== 'healthy') {
      console.warn('[Checkpointer] Redis health check failed, falling back to memory');
      await closeRedisConnection(client);
      return {
        saver: new MemoryCheckpointSaver(),
        type: 'memory',
      };
    }

    console.log(`[Checkpointer] Connected to Redis (latency: ${health.latency}ms)`);
    return {
      saver: new RedisCheckpointSaver(client, {
        sessionTTL: options.sessionTTL,
      }),
      type: 'redis',
    };
  } catch (error) {
    console.error('[Checkpointer] Failed to connect to Redis:', error);
    await closeRedisConnection(client);
    return {
      saver: new MemoryCheckpointSaver(),
      type: 'memory',
    };
  }
}

/**
 * Singleton checkpoint saver instance
 */
let _checkpointSaver: RedisCheckpointSaver | MemoryCheckpointSaver | null = null;
let _checkpointSaverType: 'redis' | 'memory' | null = null;

/**
 * Get or create the singleton checkpoint saver
 */
export async function getCheckpointSaver(): Promise<{
  saver: RedisCheckpointSaver | MemoryCheckpointSaver;
  type: 'redis' | 'memory';
}> {
  if (_checkpointSaver) {
    return { saver: _checkpointSaver, type: _checkpointSaverType! };
  }

  const result = await createCheckpointSaver();
  _checkpointSaver = result.saver;
  _checkpointSaverType = result.type;

  return result;
}

/**
 * Generate a new checkpoint ID (UUID v4)
 */
export function generateCheckpointId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a new thread ID (UUID v4)
 */
export function generateThreadId(): string {
  return crypto.randomUUID();
}

export type { Redis };
