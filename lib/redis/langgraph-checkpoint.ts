/**
 * LangGraph Checkpoint Saver
 * Implements LangGraph's CheckpointSaver interface using Redis
 */

import type {
  Checkpoint,
  CheckpointSaver,
  SerializedCheckpoint,
  ChannelLogs,
} from '@langchain/langgraph';
import { getRedisClient, type Redis } from './client.js';
import { CheckpointManager, getCheckpointManager } from './checkpoint-manager.js';
import { logger } from './logger.js';

// Type for checkpoint metadata
export interface RedisCheckpointMetadata {
  source: 'input' | 'loop' | 'update' | 'readonly';
  step: number;
  threadsuffix?: string;
  [key: string]: unknown;
}

/**
 * Converts LangGraph checkpoint format to Redis format
 */
function toRedisCheckpoint(checkpoint: Checkpoint): SerializedCheckpoint {
  return {
    v: checkpoint.v,
    id: checkpoint.id,
    ts: checkpoint.ts,
    pending_writes: checkpoint.pending_writes,
    channels: checkpoint.channels,
  };
}

/**
 * Converts Redis format back to LangGraph checkpoint
 */
function fromRedisCheckpoint(
  serialized: SerializedCheckpoint,
  state: Record<string, unknown>
): Checkpoint {
  return {
    v: serialized.v,
    id: serialized.id,
    ts: serialized.ts,
    pending_writes: serialized.pending_writes ?? null,
    channels: serialized.channels,
    tasks: serialized.tasks ?? [],
    results: serialized.results ?? {},
    state,
  };
}

/**
 * LangGraph Redis Checkpoint Saver
 * Implements the CheckpointSaver interface for Redis-based state persistence
 */
export class RedisCheckpointSaver implements CheckpointSaver {
  private manager: CheckpointManager;
  private namespace: string[];

  /**
   * Creates a new RedisCheckpointSaver instance
   * @param manager - CheckpointManager instance
   * @param namespace - Optional namespace for key isolation
   */
  constructor(manager?: CheckpointManager, namespace: string[] = []) {
    this.manager = manager ?? getCheckpointManager();
    this.namespace = namespace;
  }

  /**
   * Get the full thread ID with namespace
   */
  private getFullThreadId(threadId: string): string {
    return this.namespace.length > 0
      ? `${this.namespace.join(':')}:${threadId}`
      : threadId;
  }

  /**
   * Get a checkpoint by thread and checkpoint ID
   * Implements CheckpointSaver.get()
   */
  async get(
    threadId: string,
    checkpointId?: string
  ): Promise<Checkpoint | null> {
    const fullThreadId = this.getFullThreadId(threadId);

    logger.debug('RedisCheckpointSaver', 'Getting checkpoint', {
      threadId: fullThreadId,
      checkpointId,
    });

    try {
      const checkpointData = await this.manager.loadCheckpoint(fullThreadId, checkpointId);

      if (!checkpointData) {
        return null;
      }

      // Parse the checkpoint JSON
      const serialized: SerializedCheckpoint = typeof checkpointData.state.checkpoint === 'string'
        ? JSON.parse(checkpointData.state.checkpoint)
        : checkpointData.state.checkpoint as SerializedCheckpoint;

      const state = checkpointData.state.state as Record<string, unknown>;

      return fromRedisCheckpoint(serialized, state);
    } catch (error) {
      logger.error('RedisCheckpointSaver', 'Failed to get checkpoint', error);
      return null;
    }
  }

  /**
   * Save a checkpoint
   * Implements CheckpointSaver.put()
   */
  async put(
    threadId: string,
    checkpoint: Checkpoint,
    _channels: Record<string, unknown>,
    newChannels: Record<string, unknown>,
    metadata: Record<string, unknown> | undefined,
    _logs: ChannelLogs | undefined
  ): Promise<void> {
    const fullThreadId = this.getFullThreadId(threadId);

    logger.info('RedisCheckpointSaver', 'Saving checkpoint', {
      threadId: fullThreadId,
      checkpointId: checkpoint.id,
      metadata,
    });

    try {
      const redisCheckpoint = toRedisCheckpoint(checkpoint);

      const state = {
        checkpoint: redisCheckpoint,
        state: newChannels,
      };

      // Extract TTL from metadata or use default (24 hours)
      const ttl = typeof metadata?.ttl === 'number' ? metadata.ttl : 86400;

      await this.manager.saveCheckpoint(
        fullThreadId,
        { id: checkpoint.id, ...checkpoint },
        state,
        metadata,
        ttl
      );
    } catch (error) {
      logger.error('RedisCheckpointSaver', 'Failed to save checkpoint', error);
      throw error;
    }
  }

  /**
   * List checkpoints for a thread
   * Implements CheckpointSaver.list()
   */
  async list(
    threadId: string,
    options?: {
      limit?: number;
      before?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Array<SerializedCheckpoint>> {
    const fullThreadId = this.getFullThreadId(threadId);

    logger.debug('RedisCheckpointSaver', 'Listing checkpoints', {
      threadId: fullThreadId,
      limit: options?.limit,
      before: options?.before,
    });

    try {
      const checkpoints = await this.manager.listCheckpoints(
        fullThreadId,
        options?.limit ?? 10,
        options?.before
      );

      const result: Array<SerializedCheckpoint> = [];

      for (const { checkpointId } of checkpoints) {
        const checkpointData = await this.manager.loadCheckpoint(fullThreadId, checkpointId);
        if (checkpointData) {
          const serialized: SerializedCheckpoint = typeof checkpointData.state.checkpoint === 'string'
            ? JSON.parse(checkpointData.state.checkpoint)
            : checkpointData.state.checkpoint as SerializedCheckpoint;
          result.push(serialized);
        }
      }

      return result;
    } catch (error) {
      logger.error('RedisCheckpointSaver', 'Failed to list checkpoints', error);
      return [];
    }
  }

  /**
   * Delete a checkpoint
   * Implements CheckpointSaver.delete()
   */
  async delete(threadId: string, checkpointId: string): Promise<void> {
    const fullThreadId = this.getFullThreadId(threadId);

    logger.info('RedisCheckpointSaver', 'Deleting checkpoint', {
      threadId: fullThreadId,
      checkpointId,
    });

    try {
      await this.manager.deleteCheckpoint(fullThreadId, checkpointId);
    } catch (error) {
      logger.error('RedisCheckpointSaver', 'Failed to delete checkpoint', error);
      throw error;
    }
  }

  /**
   * Search checkpoints across threads (optional method)
   */
  async search(
    query: Record<string, unknown>,
    limit: number = 10
  ): Promise<Array<{ threadId: string; checkpoint: Checkpoint }>> {
    logger.debug('RedisCheckpointSaver', 'Searching checkpoints', { query, limit });

    // This is a simplified implementation - in production you might use
    // Redis search capabilities or maintain an index
    const results: Array<{ threadId: string; checkpoint: Checkpoint }> = [];

    // For now, return empty results
    // A full implementation would scan keys or use Redis Search
    return results;
  }
}

/**
 * Memory-based checkpoint saver for development fallback
 * Implements CheckpointSaver interface using in-memory storage
 */
export class MemoryCheckpointSaver implements CheckpointSaver {
  private checkpoints: Map<string, Map<string, { checkpoint: Checkpoint; state: Record<string, unknown> }>> = new Map();
  private metadata: Map<string, Record<string, unknown>> = new Map();

  /**
   * Get a checkpoint from memory
   */
  async get(
    threadId: string,
    checkpointId?: string
  ): Promise<Checkpoint | null> {
    const threadCheckpoints = this.checkpoints.get(threadId);
    if (!threadCheckpoints) {
      return null;
    }

    if (checkpointId) {
      const checkpoint = threadCheckpoints.get(checkpointId);
      return checkpoint
        ? { ...checkpoint.checkpoint, channels: checkpoint.state as Record<string, unknown> }
        : null;
    }

    // Get latest checkpoint
    let latest: { checkpoint: Checkpoint; state: Record<string, unknown> } | null = null;
    let latestTs = 0;

    for (const [, cp] of threadCheckpoints) {
      if (new Date(cp.checkpoint.ts).getTime() > latestTs) {
        latest = cp;
        latestTs = new Date(cp.checkpoint.ts).getTime();
      }
    }

    return latest
      ? { ...latest.checkpoint, channels: latest.state as Record<string, unknown> }
      : null;
  }

  /**
   * Save a checkpoint to memory
   */
  async put(
    threadId: string,
    checkpoint: Checkpoint,
    _channels: Record<string, unknown>,
    newChannels: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.checkpoints.has(threadId)) {
      this.checkpoints.set(threadId, new Map());
    }

    this.checkpoints.get(threadId)!.set(checkpoint.id, {
      checkpoint,
      state: newChannels,
    });

    if (metadata) {
      this.metadata.set(threadId, metadata);
    }
  }

  /**
   * List checkpoints for a thread
   */
  async list(
    threadId: string,
    options?: { limit?: number; before?: string }
  ): Promise<Array<SerializedCheckpoint>> {
    const threadCheckpoints = this.checkpoints.get(threadId);
    if (!threadCheckpoints) {
      return [];
    }

    let checkpoints = Array.from(threadCheckpoints.values())
      .map((cp) => toRedisCheckpoint(cp.checkpoint));

    if (options?.before) {
      const beforeCp = threadCheckpoints.get(options.before);
      if (beforeCp) {
        const beforeTs = new Date(beforeCp.checkpoint.ts).getTime();
        checkpoints = checkpoints.filter(
          (cp) => new Date(cp.ts!).getTime() < beforeTs
        );
      }
    }

    checkpoints.sort(
      (a, b) => new Date(b.ts!).getTime() - new Date(a.ts!).getTime()
    );

    return checkpoints.slice(0, options?.limit ?? 10);
  }

  /**
   * Delete a checkpoint from memory
   */
  async delete(threadId: string, checkpointId: string): Promise<void> {
    const threadCheckpoints = this.checkpoints.get(threadId);
    if (threadCheckpoints) {
      threadCheckpoints.delete(checkpointId);
    }
  }
}

/**
 * Factory function to create the appropriate checkpoint saver
 * @param useRedis - Whether to use Redis (defaults to environment variable)
 * @param namespace - Optional namespace for key isolation
 * @param redisClient - Optional Redis client instance
 */
export function createCheckpointSaver(
  useRedis?: boolean,
  namespace: string[] = [],
  redisClient?: Redis
): CheckpointSaver {
  const shouldUseRedis = useRedis ?? process.env.USE_REDIS === 'true';

  if (shouldUseRedis) {
    logger.info('RedisCheckpointSaver', 'Using Redis checkpoint saver', { namespace });
    const client = redisClient ?? getRedisClient();
    const manager = new CheckpointManager(client);
    return new RedisCheckpointSaver(manager, namespace);
  }

  logger.info('RedisCheckpointSaver', 'Using memory checkpoint saver (development)', { namespace });
  return new MemoryCheckpointSaver();
}

/**
 * Gets the default checkpoint saver instance
 */
let defaultCheckpointSaver: CheckpointSaver | null = null;

export function getDefaultCheckpointSaver(): CheckpointSaver {
  if (!defaultCheckpointSaver) {
    defaultCheckpointSaver = createCheckpointSaver();
  }
  return defaultCheckpointSaver;
}

export type { Redis as RedisClient };
