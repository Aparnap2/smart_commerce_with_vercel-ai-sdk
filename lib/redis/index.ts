/**
 * Redis Module Exports
 * Provides Redis-based checkpointing for LangGraph state persistence
 */

// Client
export {
  createRedisClient,
  getRedisClient,
  checkRedisHealth,
  closeRedisConnection,
  isRedisAvailable,
  type RedisConfig,
} from './client.js';

// Checkpoint Manager
export {
  CheckpointManager,
  getCheckpointManager,
  type CheckpointData,
  type CheckpointMetadata,
} from './checkpoint-manager.js';

// LangGraph Integration
export {
  RedisCheckpointSaver,
  MemoryCheckpointSaver,
  createCheckpointSaver,
  getDefaultCheckpointSaver,
  type RedisCheckpointMetadata,
} from './langgraph-checkpoint.js';

// Logger (internal use)
export { logger } from './logger.js';
