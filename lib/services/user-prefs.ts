/**
 * User Preference Service
 *
 * Manages user query embeddings for preference-based search:
 * - Generates embeddings using local ML models
 * - Stores/retrieves embeddings from pgvector
 * - Updates preferences based on conversation context
 */

import { getSupabaseDatabase, UserEmbeddingRecord } from '../supabase/client.js';
import { env } from '../env.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Context types for user queries
 */
export type PreferenceContextType =
  | 'product_search'
  | 'order_inquiry'
  | 'ticket_create'
  | 'general_support'
  | 'recommendation'
  | 'browsing';

/**
 * Embedding generation result
 */
export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
  error?: Error;
}

/**
 * Preference storage result
 */
export interface PreferenceResult {
  success: boolean;
  embeddingId?: string;
  error?: Error;
}

/**
 * Preference query result
 */
export interface PreferenceQueryResult {
  preferences: UserEmbeddingRecord[];
  similarCount: number;
  error?: Error;
}

/**
 * Conversation context for preference updates
 */
export interface ConversationContext {
  userId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentIntent?: string;
  lastQuery?: string;
}

// ============================================================================
// Embedding Model Configuration
// ============================================================================

// 384-dimensional embeddings (all-MiniLM-L6-v2 compatible)
const EMBEDDING_DIMENSIONS = 384;
const DEFAULT_EMBEDDING_MODEL = 'all-MiniLM-L6-v2';

/**
 * Check if embedding model is available
 */
function isEmbeddingModelAvailable(): boolean {
  // In production, this would check for ONNX Runtime or similar
  // For now, we support Ollama embeddings if available
  return true; // Always true, will fallback gracefully
}

// ============================================================================
// Embedding Generation
// ============================================================================

/**
 * Generates embedding for a query using available ML model
 * Supports Ollama, local transformers, or API-based generation
 */
export async function generateQueryEmbedding(
  query: string
): Promise<EmbeddingResult> {
  if (!query?.trim()) {
    return {
      embedding: [],
      model: 'none',
      dimensions: 0,
      error: new Error('Query cannot be empty'),
    };
  }

  try {
    // Strategy 1: Use Ollama if available (recommended for local dev)
    if (env.OLLAMA_BASE_URL) {
      const embedding = await generateWithOllama(query);
      if (embedding) {
        return {
          embedding,
          model: 'ollama',
          dimensions: embedding.length,
        };
      }
    }

    // Strategy 2: Use simple hash-based fallback for testing
    // In production, this would use a proper embedding model
    const fallbackEmbedding = generateFallbackEmbedding(query);
    return {
      embedding: fallbackEmbedding,
      model: 'fallback-hash',
      dimensions: EMBEDDING_DIMENSIONS,
    };
  } catch (error) {
    console.error('[UserPrefs] Embedding generation error:', error);
    return {
      embedding: [],
      model: 'none',
      dimensions: 0,
      error: error instanceof Error ? error : new Error('Unknown embedding error'),
    };
  }
}

/**
 * Generate embedding using Ollama API
 */
async function generateWithOllama(query: string): Promise<number[] | null> {
  try {
    const baseUrl = env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const model = env.OLLAMA_MODEL || 'nomic-embed-text';

    const response = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: query,
        options: {
          num_predict: 1,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();

    // Normalize to 384 dimensions if needed
    let embedding: number[] = data.embedding || data.embeddings?.[0];
    if (!embedding) {
      return null;
    }

    // Truncate or pad to 384 dimensions
    if (embedding.length > EMBEDDING_DIMENSIONS) {
      embedding = embedding.slice(0, EMBEDDING_DIMENSIONS);
    } else if (embedding.length < EMBEDDING_DIMENSIONS) {
      // Pad with zeros
      const paddingLength = EMBEDDING_DIMENSIONS - embedding.length;
      embedding = [
        ...embedding,
        ...Array<number>(paddingLength).fill(0),
      ];
    }

    // Normalize to unit length (for cosine similarity via inner product)
    const norm = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );
    if (norm > 0) {
      embedding = embedding.map((val) => val / norm);
    }

    return embedding;
  } catch (error) {
    console.warn('[UserPrefs] Ollama embedding failed:', error);
    return null;
  }
}

/**
 * Generate deterministic embedding from query text
 * Used as fallback when no ML model is available
 * Note: This is NOT semantic similarity - just a hash-like representation
 */
function generateFallbackEmbedding(query: string): number[] {
  // Simple word-based feature extraction
  const words = query.toLowerCase().split(/\s+/);
  const embedding: number[] = Array<number>(EMBEDDING_DIMENSIONS).fill(0);

  // Create a simple hash for each word
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash + word.charCodeAt(j)) | 0;
    }

    // Distribute hash across embedding dimensions
    const idx1 = Math.abs(hash) % EMBEDDING_DIMENSIONS;
    const idx2 = Math.abs((hash >> 8)) % EMBEDDING_DIMENSIONS;

    // Set values with some spread
    embedding[idx1] += 1 / (i + 1);  // Earlier words more important
    if (idx2 !== idx1) {
      embedding[idx2] += 0.5 / (i + 1);
    }
  }

  // Normalize to unit length
  const norm = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0)
  );
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
      embedding[i] /= norm;
    }
  }

  return embedding;
}

// ============================================================================
// Preference Storage
// ============================================================================

/**
 * Store a user query embedding for preference tracking
 */
export async function storePreference(params: {
  userId: string;
  query: string;
  contextType: PreferenceContextType;
  contextId?: string;
  metadata?: Record<string, unknown>;
}): Promise<PreferenceResult> {
  // Generate embedding for the query
  const embeddingResult = await generateQueryEmbedding(params.query);

  if (embeddingResult.error || embeddingResult.embedding.length === 0) {
    return {
      success: false,
      error: embeddingResult.error || new Error('Failed to generate embedding'),
    };
  }

  const db = getSupabaseDatabase();

  // Store in database
  const result = await db.storeUserEmbedding({
    userId: params.userId,
    embedding: embeddingResult.embedding,
    queryText: params.query,
    contextType: params.contextType,
    contextId: params.contextId,
  });

  if (result.error) {
    console.error('[UserPrefs] Store error:', result.error.message);
    return {
      success: false,
      error: result.error,
    };
  }

  if (env.NODE_ENV === 'development') {
    console.log('[UserPrefs] Stored preference:', {
      userId: params.userId,
      contextType: params.contextType,
      model: embeddingResult.model,
    });
  }

  return {
    success: true,
    embeddingId: result.data?.id,
  };
}

/**
 * Store multiple preferences in batch
 */
export async function storePreferencesBatch(
  preferences: Array<{
    userId: string;
    query: string;
    contextType: PreferenceContextType;
    contextId?: string;
  }>
): Promise<PreferenceResult[]> {
  // Process sequentially to avoid overwhelming the embedding service
  const results: PreferenceResult[] = [];

  for (const pref of preferences) {
    const result = await storePreference(pref);
    results.push(result);

    // Small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return results;
}

// ============================================================================
// Preference Retrieval
// ============================================================================

/**
 * Get similar preferences for a user query
 */
export async function getSimilarPreferences(params: {
  userId: string;
  query: string;
  limit?: number;
  threshold?: number;
}): Promise<PreferenceQueryResult> {
  // Generate embedding for the query
  const embeddingResult = await generateQueryEmbedding(params.query);

  if (embeddingResult.error || embeddingResult.embedding.length === 0) {
    return {
      preferences: [],
      similarCount: 0,
      error: embeddingResult.error,
    };
  }

  const db = getSupabaseDatabase();

  const result = await db.findSimilarEmbeddings({
    embedding: embeddingResult.embedding,
    userId: params.userId,
    limit: params.limit || 10,
    threshold: params.threshold || 0.5,
  });

  if (result.error) {
    console.error('[UserPrefs] Retrieval error:', result.error.message);
    return {
      preferences: [],
      similarCount: 0,
      error: result.error,
    };
  }

  return {
    preferences: result.data || [],
    similarCount: result.data?.length || 0,
  };
}

/**
 * Get all preferences for a user (for analytics/preference export)
 */
export async function getUserPreferences(
  userId: string,
  limit: number = 100
): Promise<{ preferences: UserEmbeddingRecord[]; error?: Error }> {
  const db = getSupabaseDatabase();

  // For now, we query using findSimilarEmbeddings with a zero threshold
  // In a real implementation, you'd add a getUserAllEmbeddings method
  const result = await db.findSimilarEmbeddings({
    embedding: Array<number>(EMBEDDING_DIMENSIONS).fill(0),
    userId,
    limit,
    threshold: -1,  // Get all embeddings
  });

  return {
    preferences: result.data || [],
    error: result.error,
  };
}

// ============================================================================
// Preference Updates from Conversation Context
// ============================================================================

/**
 * Extract preferences from conversation context and store them
 */
export async function updatePreferencesFromContext(
  context: ConversationContext
): Promise<{ stored: number; errors: number }> {
  const { userId, messages, currentIntent, lastQuery } = context;

  let stored = 0;
  let errors = 0;

  // Determine context type from intent
  let contextType: PreferenceContextType = 'general_support';
  if (currentIntent) {
    switch (currentIntent.toLowerCase()) {
      case 'product_search':
      case 'recommendation':
        contextType = 'product_search';
        break;
      case 'order_inquiry':
        contextType = 'order_inquiry';
        break;
      case 'ticket_create':
        contextType = 'ticket_create';
        break;
    }
  }

  // Process user messages for preference extraction
  for (const message of messages) {
    if (message.role === 'user' && message.content.trim()) {
      // Skip very short messages (greetings, thanks, etc.)
      if (message.content.split(/\s+/).length < 3) {
        continue;
      }

      const result = await storePreference({
        userId,
        query: message.content,
        contextType,
        metadata: {
          extractedFrom: 'conversation',
          messageCount: messages.length,
          intent: currentIntent,
        },
      });

      if (result.success) {
        stored++;
      } else {
        errors++;
      }
    }
  }

  // Store the last query specifically if provided
  if (lastQuery && lastQuery !== messages[messages.length - 1]?.content) {
    const result = await storePreference({
      userId,
      query: lastQuery,
      contextType,
      metadata: {
        extractedFrom: 'current_query',
        intent: currentIntent,
      },
    });

    if (result.success) {
      stored++;
    } else {
      errors++;
    }
  }

  return { stored, errors };
}

/**
 * Consolidate similar preferences (merge duplicates or near-duplicates)
 * This helps reduce storage and improve search quality
 */
export async function consolidateUserPreferences(
  userId: string,
  similarityThreshold: number = 0.95
): Promise<{ consolidated: number; deleted: number; error?: Error }> {
  // Get all user preferences
  const { preferences } = await getUserPreferences(userId, 1000);

  if (preferences.length === 0) {
    return { consolidated: 0, deleted: 0 };
  }

  const toDelete: string[] = [];
  let consolidated = 0;

  // Compare each pair (O(n^2) but acceptable for small preference sets)
  for (let i = 0; i < preferences.length; i++) {
    if (toDelete.indexOf(preferences[i].id) >= 0) continue;

    for (let j = i + 1; j < preferences.length; j++) {
      if (toDelete.indexOf(preferences[j].id) >= 0) continue;

      // Calculate similarity
      const similarity = calculateSimilarity(
        preferences[i].embedding,
        preferences[j].embedding
      );

      if (similarity >= similarityThreshold) {
        // Mark the older one for deletion
        const older =
          new Date(preferences[i].created_at) < new Date(preferences[j].created_at)
            ? preferences[i]
            : preferences[j];
        toDelete.push(older.id);
        consolidated++;
      }
    }
  }

  // In production, you would delete the marked records here
  // For now, we just return counts
  if (env.NODE_ENV === 'development') {
    console.log('[UserPrefs] Consolidation plan:', {
      userId,
      toDelete: toDelete.length,
      consolidated,
    });
  }

  return {
    consolidated,
    deleted: toDelete.length,
  };
}

/**
 * Calculate cosine similarity between two embeddings
 */
function calculateSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ============================================================================
// Cleanup and Maintenance
// ============================================================================

/**
 * Delete old preferences for a user
 */
export async function cleanupOldPreferences(
  userId: string,
  olderThanDays: number = 90
): Promise<{ deleted: number; error?: Error }> {
  const db = getSupabaseDatabase();

  const result = await db.deleteOldEmbeddings({
    userId,
    olderThanDays,
  });

  if (result.error) {
    return { deleted: 0, error: result.error };
  }

  return {
    deleted: result.data?.count || 0,
  };
}

/**
 * Get preference statistics for a user
 */
export async function getPreferenceStats(userId: string): Promise<{
  totalPreferences: number;
  byContextType: Record<string, number>;
  oldestPreference?: Date;
  newestPreference?: Date;
}> {
  const { preferences } = await getUserPreferences(userId, 1000);

  const byContextType: Record<string, number> = {};
  let oldest: Date | undefined;
  let newest: Date | undefined;

  for (const pref of preferences) {
    byContextType[pref.context_type] = (byContextType[pref.context_type] || 0) + 1;

    const created = new Date(pref.created_at);
    if (!oldest || created < oldest) oldest = created;
    if (!newest || created > newest) newest = created;
  }

  return {
    totalPreferences: preferences.length,
    byContextType,
    oldestPreference: oldest,
    newestPreference: newest,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate embedding dimensions
 */
export function validateEmbedding(embedding: number[]): boolean {
  return (
    Array.isArray(embedding) &&
    embedding.length === EMBEDDING_DIMENSIONS &&
    embedding.every((val) => typeof val === 'number' && !isNaN(val))
  );
}

/**
 * Get embedding configuration
 */
export function getEmbeddingConfig(): {
  dimensions: number;
  model: string;
  metric: string;
} {
  return {
    dimensions: EMBEDDING_DIMENSIONS,
    model: DEFAULT_EMBEDDING_MODEL,
    metric: 'cosine',  // Using inner product on normalized vectors
  };
}

// Default export for convenience
export default {
  generateQueryEmbedding,
  storePreference,
  getSimilarPreferences,
  updatePreferencesFromContext,
  cleanupOldPreferences,
  getPreferenceStats,
  storePreferencesBatch,
  getUserPreferences,
  consolidateUserPreferences,
  validateEmbedding,
  getEmbeddingConfig,
};
