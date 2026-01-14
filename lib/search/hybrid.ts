/**
 * Hybrid Search Module
 *
 * Implements hybrid search combining:
 * - BM25: Full-text search for exact/exact-ish matches
 * - pgvector: Semantic similarity search for user preferences
 *
 * Query routing logic determines which search strategy to use.
 */

import { getSupabaseDatabase } from '../supabase/client.js';
import { generateQueryEmbedding } from '../services/user-prefs.js';
import { env } from '../env.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Search context types that determine routing strategy
 */
export type SearchContext =
  | 'product_search'
  | 'order_inquiry'
  | 'ticket_lookup'
  | 'general_support'
  | 'recommendation';

/**
 * Hybrid search result with scoring
 */
export interface HybridSearchResult {
  id: number;
  type: 'product' | 'order' | 'ticket';
  name: string;
  description?: string;
  price?: number;
  status?: string;
  category?: string;
  score: number;
  matchType: 'vector' | 'bm25' | 'hybrid';
  relevance: number;
}

/**
 * Search options
 */
export interface SearchOptions {
  query: string;
  context: SearchContext;
  userId?: string;
  limit?: number;
  vectorWeight?: number;
  bm25Weight?: number;
  threshold?: number;
  category?: string;
}

/**
 * Search response with results and metadata
 */
export interface SearchResponse {
  results: HybridSearchResult[];
  query: string;
  context: SearchContext;
  totalResults: number;
  searchTimeMs: number;
  routingDecision: string;
  usedVectorSearch: boolean;
  usedBm25Search: boolean;
}

// ============================================================================
// Query Router
// ============================================================================

/**
 * Determines which search strategy to use based on query characteristics
 */
function routeQuery(options: SearchOptions): {
  useVector: boolean;
  useBm25: boolean;
  strategy: string;
} {
  const { query, context } = options;

  // Initialize scores for different search types
  let vectorScore = 0;
  let bm25Score = 0;

  // Context-based scoring
  switch (context) {
    case 'recommendation':
      // Recommendations heavily favor vector search (user preferences)
      vectorScore += 3;
      bm25Score += 1;
      break;
    case 'product_search':
      // Product search uses both, with slight vector preference
      vectorScore += 2;
      bm25Score += 2;
      break;
    case 'order_inquiry':
      // Order inquiries use BM25 for exact order/product matching
      vectorScore += 1;
      bm25Score += 3;
      break;
    case 'ticket_lookup':
      // Ticket lookups use BM25 for ticket content
      vectorScore += 1;
      bm25Score += 2;
      break;
    case 'general_support':
      // General support uses balanced approach
      vectorScore += 2;
      bm25Score += 2;
      break;
  }

  // Query pattern analysis
  const queryLower = query.toLowerCase();

  // Vector-favoring patterns (semantic, vague)
  const vectorPatterns = [
    /similar to/i,
    /kind of/i,
    /like/i,
    /recommend/i,
    /something/i,
    /what's around/i,
    /ideas/i,
    /looking for/i,  // browsing intent
  ];

  // BM25-favoring patterns (exact, specific)
  const bm25Patterns = [
    /#\d+/i,           // Order/ticket IDs
    /\d{4}[-\s]?\d{4}/, // Credit card or similar patterns
    /exact(ly)?/i,
    /specific/i,
    /model\s+\w+/i,    // Product models
    /sku[:\s]+\w+/i,   // SKU references
  ];

  for (let i = 0; i < vectorPatterns.length; i++) {
    if (vectorPatterns[i].test(query)) {
      vectorScore += 1;
    }
  }

  for (let i = 0; i < bm25Patterns.length; i++) {
    if (bm25Patterns[i].test(query)) {
      bm25Score += 1;
    }
  }

  // Query length analysis
  const wordCount = query.split(/\s+/).length;
  if (wordCount <= 2) {
    // Short queries benefit from BM25 exact matching
    bm25Score += 1;
  } else if (wordCount >= 5) {
    // Longer queries benefit from semantic understanding
    vectorScore += 1;
  }

  // Numeric content (favors BM25)
  const hasNumbers = /\d/.test(query);
  if (hasNumbers) {
    bm25Score += 1;
  }

  // Determine strategy
  const useVector = vectorScore > 0 || context === 'recommendation';
  const useBm25 = bm25Score > 0 || context !== 'recommendation';

  let strategy: string;
  if (useVector && useBm25) {
    strategy = vectorScore > bm25Score ? 'hybrid-favor-vector' : 'hybrid-favor-bm25';
  } else if (useVector) {
    strategy = 'vector-only';
  } else {
    strategy = 'bm25-only';
  }

  return { useVector, useBm25, strategy };
}

// ============================================================================
// BM25 Search Implementation
// ============================================================================

/**
 * Performs BM25 full-text search on products
 */
async function searchProductsBm25(
  query: string,
  options: SearchOptions
): Promise<HybridSearchResult[]> {
  const db = getSupabaseDatabase();

  const result = await db.searchProductsBm25({
    searchText: query,
    limit: options.limit || 20,
    category: options.category,
  });

  if (result.error || !result.data) {
    console.error('[HybridSearch] BM25 product search error:', result.error?.message);
    return [];
  }

  // Normalize scores to 0-1 range
  let maxRating = 1;
  for (let i = 0; i < result.data.length; i++) {
    const rating = result.data[i].rating || 1;
    if (rating > maxRating) maxRating = rating;
  }
  if (maxRating === 0) maxRating = 1;

  const results: HybridSearchResult[] = [];
  for (let i = 0; i < result.data.length; i++) {
    const product = result.data[i];
    const rating = product.rating || 0;
    results.push({
      id: product.id,
      type: 'product',
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      score: maxRating > 0 ? rating / 5 : 0.5,
      matchType: 'bm25',
      relevance: maxRating > 0 ? rating / 5 : 0.5,
    });
  }

  return results;
}

/**
 * Performs BM25 search on orders
 */
async function searchOrdersBm25(
  query: string,
  userId: string,
  limit: number = 10
): Promise<HybridSearchResult[]> {
  const db = getSupabaseDatabase();

  const result = await db.searchOrders({
    userId,
    searchText: query,
    limit,
  });

  if (result.error || !result.data) {
    console.error('[HybridSearch] BM25 order search error:', result.error?.message);
    return [];
  }

  const results: HybridSearchResult[] = [];
  for (let i = 0; i < result.data.length; i++) {
    const order = result.data[i];
    results.push({
      id: order.id,
      type: 'order',
      name: `Order #${order.id} - ${order.product_name}`,
      status: order.status,
      price: order.total,
      score: order.total / 1000,  // Normalize by assumed max order value
      matchType: 'bm25',
      relevance: order.total / 1000,
    });
  }

  return results;
}

// ============================================================================
// Vector Search Implementation
// ============================================================================

/**
 * Performs semantic similarity search using pgvector
 */
async function searchVectorSimilarity(
  query: string,
  userId: string,
  options: SearchOptions
): Promise<HybridSearchResult[]> {
  // Generate embedding for the query
  const embeddingResult = await generateQueryEmbedding(query);

  if (embeddingResult.error || !embeddingResult.embedding) {
    console.error('[HybridSearch] Embedding generation error:', embeddingResult.error?.message);
    return [];
  }

  const db = getSupabaseDatabase();

  // Search for similar user embeddings
  const result = await db.findSimilarEmbeddings({
    embedding: embeddingResult.embedding,
    userId,
    limit: options.limit || 10,
    threshold: options.threshold || 0.5,
  });

  if (result.error || !result.data) {
    console.error('[HybridSearch] Vector search error:', result.error?.message);
    return [];
  }

  // Transform embeddings to search results
  // In a real implementation, you would:
  // 1. Look up products/categories related to similar embeddings
  // 2. Return those as recommendations

  const dataLength = result.data.length;
  const results: HybridSearchResult[] = [];
  for (let i = 0; i < result.data.length; i++) {
    const record = result.data[i];
    const scoreValue = dataLength > 0 ? 1 - (i / dataLength) : 0;
    results.push({
      id: i,
      type: 'product',
      name: record.query_text,
      description: `Context: ${record.context_type}`,
      score: scoreValue,
      matchType: 'vector',
      relevance: scoreValue,
    });
  }

  return results;
}

// ============================================================================
// Result Merging and Ranking
// ============================================================================

/**
 * Merges and reranks results from multiple search strategies
 */
function mergeResults(
  vectorResults: HybridSearchResult[],
  bm25Results: HybridSearchResult[],
  vectorWeight: number,
  bm25Weight: number
): HybridSearchResult[] {
  // Combine results, deduplicating by ID using a plain object
  const resultMap: Record<number, HybridSearchResult> = {};

  // Process vector results
  for (let i = 0; i < vectorResults.length; i++) {
    const result = vectorResults[i];
    result.score = result.score * vectorWeight;
    result.matchType = 'vector';
    resultMap[result.id] = result;
  }

  // Process BM25 results
  for (let i = 0; i < bm25Results.length; i++) {
    const result = bm25Results[i];
    const existing = resultMap[result.id];
    if (existing) {
      // Combine scores for same item
      existing.score = existing.score + result.score * bm25Weight;
      existing.matchType = 'hybrid';
    } else {
      result.score = result.score * bm25Weight;
      result.matchType = 'bm25';
      resultMap[result.id] = result;
    }
  }

  // Sort by combined score and return
  const sortedResults = Object.values(resultMap);
  return sortedResults.sort((a, b) => b.score - a.score);
}

// ============================================================================
// Main Hybrid Search Function
// ============================================================================

/**
 * Performs hybrid search combining BM25 and pgvector
 */
export async function hybridSearch(options: SearchOptions): Promise<SearchResponse> {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  // Validate inputs
  if (!options.query?.trim()) {
    return {
      results: [],
      query: options.query,
      context: options.context,
      totalResults: 0,
      searchTimeMs: 0,
      routingDecision: 'empty query',
      usedVectorSearch: false,
      usedBm25Search: false,
    };
  }

  // Route query to determine search strategy
  const routing = routeQuery(options);

  if (env.NODE_ENV === 'development') {
    console.log('[HybridSearch] Routing decision:', {
      query: options.query,
      context: options.context,
      strategy: routing.strategy,
      useVector: routing.useVector,
      useBm25: routing.useBm25,
    });
  }

  // Execute searches based on routing decision
  const results: HybridSearchResult[] = [];
  const vectorWeight = options.vectorWeight ?? 0.5;
  const bm25Weight = options.bm25Weight ?? 0.5;
  const limit = options.limit ?? 20;

  // Parallel execution when both strategies are needed
  const searchPromises: Array<Promise<HybridSearchResult[]>> = [];

  if (routing.useBm25) {
    switch (options.context) {
      case 'product_search':
      case 'recommendation':
        searchPromises.push(searchProductsBm25(options.query, options));
        break;
      case 'order_inquiry':
        if (options.userId) {
          searchPromises.push(searchOrdersBm25(options.query, options.userId, limit));
        }
        break;
      default:
        // Default to product search
        searchPromises.push(searchProductsBm25(options.query, options));
    }
  }

  if (routing.useVector && options.userId) {
    searchPromises.push(searchVectorSimilarity(options.query, options.userId, options));
  }

  // Wait for all searches to complete
  const searchResults = await Promise.allSettled(searchPromises);

  // Collect successful results
  for (let i = 0; i < searchResults.length; i++) {
    const searchResult = searchResults[i];
    if (searchResult.status === 'fulfilled') {
      results.push(...searchResult.value);
    }
  }

  // Merge results if both strategies were used
  let finalResults: HybridSearchResult[];
  if (routing.useVector && routing.useBm25 && searchPromises.length > 1) {
    // Separate results by type for proper merging
    const vectorRes: HybridSearchResult[] = [];
    const bm25Res: HybridSearchResult[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.matchType === 'vector') {
        vectorRes.push(r);
      } else {
        bm25Res.push(r);
      }
    }
    finalResults = mergeResults(vectorRes, bm25Res, vectorWeight, bm25Weight);
  } else {
    finalResults = results;
  }

  // Limit results
  if (finalResults.length > limit) {
    finalResults = finalResults.slice(0, limit);
  }

  const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    results: finalResults,
    query: options.query,
    context: options.context,
    totalResults: finalResults.length,
    searchTimeMs: Math.round(endTime - startTime),
    routingDecision: routing.strategy,
    usedVectorSearch: routing.useVector,
    usedBm25Search: routing.useBm25,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick product search (BM25 only, no user context needed)
 */
export async function searchProducts(
  query: string,
  options?: { limit?: number; category?: string }
): Promise<SearchResponse> {
  return hybridSearch({
    query,
    context: 'product_search',
    limit: options?.limit,
    category: options?.category,
  });
}

/**
 * User preference-based product search
 */
export async function searchWithPreferences(
  query: string,
  userId: string,
  context: SearchContext = 'recommendation'
): Promise<SearchResponse> {
  return hybridSearch({
    query,
    context,
    userId,
  });
}

/**
 * Order lookup with user context
 */
export async function searchOrders(
  query: string,
  userId: string
): Promise<SearchResponse> {
  return hybridSearch({
    query,
    context: 'order_inquiry',
    userId,
  });
}

export default hybridSearch;
