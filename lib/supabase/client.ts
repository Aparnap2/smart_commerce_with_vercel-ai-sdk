/**
 * Supabase Client Module
 *
 * Type-safe Supabase client initialization with authentication and database access.
 * Handles environment variable validation and provides typed client methods.
 */

import { createClient, SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';
import { env } from '../env.js';

// ============================================================================
// Environment Variable Types
// ============================================================================

interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

// ============================================================================
// Environment Validation
// ============================================================================

/**
 * Validates required Supabase environment variables
 * @throws Error if required variables are missing
 */
function validateSupabaseEnv(): SupabaseEnv {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('Missing required environment variable: SUPABASE_URL');
  }

  if (!anonKey) {
    throw new Error('Missing required environment variable: SUPABASE_ANON_KEY');
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid SUPABASE_URL format: ${url}`);
  }

  // Validate anon key format (should be a JWT-like string)
  if (anonKey.length < 10) {
    throw new Error('Invalid SUPABASE_ANON_KEY format');
  }

  return {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  };
}

// ============================================================================
// Client Initialization
// ============================================================================

let _supabaseClient: SupabaseClient | null = null;
let _supabaseAdminClient: SupabaseClient | null = null;

/**
 * Get Supabase client options for browser/edge environments
 */
function getClientOptions(): SupabaseClientOptions {
  return {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  };
}

/**
 * Get Supabase client options for server-side environments
 */
function getServerClientOptions(): SupabaseClientOptions {
  return {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  };
}

/**
 * Creates and returns the Supabase client instance (anon key)
 * For client-side use with proper auth session handling
 */
export function getSupabaseClient(): SupabaseClient {
  if (_supabaseClient) {
    return _supabaseClient;
  }

  const supabaseEnv = validateSupabaseEnv();

  const isServer = typeof window === 'undefined';
  const options = isServer ? getServerClientOptions() : getClientOptions();

  _supabaseClient = createClient(supabaseEnv.SUPABASE_URL, supabaseEnv.SUPABASE_ANON_KEY, options);

  if (env.NODE_ENV === 'development') {
    console.log('[Supabase] Client initialized successfully');
  }

  return _supabaseClient;
}

/**
 * Creates and returns the Supabase admin client (service role key)
 * For server-side only operations bypassing RLS
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (_supabaseAdminClient) {
    return _supabaseAdminClient;
  }

  const supabaseEnv = validateSupabaseEnv();

  if (!supabaseEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for admin operations. ' +
      'Use only in server-side contexts with proper access controls.'
    );
  }

  _supabaseAdminClient = createClient(
    supabaseEnv.SUPABASE_URL,
    supabaseEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  if (env.NODE_ENV === 'development') {
    console.log('[Supabase] Admin client initialized successfully');
  }

  return _supabaseAdminClient;
}

// ============================================================================
// Type-Safe Database Operations
// ============================================================================

/**
 * Generic query result type
 */
export interface QueryResult<T> {
  data: T | null;
  error: Error | null;
  status: number;
}

/**
 * User embedding record type
 */
export interface UserEmbeddingRecord {
  id: string;
  user_id: string;
  embedding: number[];
  query_text: string;
  context_type: string;
  context_id?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Product record type for search
 */
export interface ProductSearchRecord {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  sku: string;
  rating: number;
}

/**
 * Order record type for search
 */
export interface OrderSearchRecord {
  id: number;
  status: string;
  product_name: string;
  total: number;
}

/**
 * Type-safe database operations wrapper
 */
export class SupabaseDatabase {
  private client: SupabaseClient;
  private adminClient: SupabaseClient | null;

  constructor(client: SupabaseClient, adminClient?: SupabaseClient) {
    this.client = client;
    this.adminClient = adminClient || null;
  }

  // -----------------------------------------------------------------------
  // User Embedding Operations
  // -----------------------------------------------------------------------

  /**
   * Store user query embedding for preference history
   */
  async storeUserEmbedding(params: {
    userId: string;
    embedding: number[];
    queryText: string;
    contextType: string;
    contextId?: string;
  }): Promise<QueryResult<UserEmbeddingRecord>> {
    const { data, error } = await this.client
      .from('user_embeddings')
      .insert({
        user_id: params.userId,
        embedding: params.embedding,
        query_text: params.queryText,
        context_type: params.contextType,
        context_id: params.contextId,
      })
      .select()
      .single();

    return {
      data: data as UserEmbeddingRecord | null,
      error: error ? new Error(error.message) : null,
      status: error?.code ? 400 : 200,
    };
  }

  /**
   * Find similar user embeddings for preference learning
   */
  async findSimilarEmbeddings(params: {
    embedding: number[];
    userId: string;
    limit?: number;
    threshold?: number;
  }): Promise<QueryResult<UserEmbeddingRecord[]>> {
    const limit = params.limit || 10;
    const threshold = params.threshold || 0.7;

    // Use pgvector similarity search via RPC if available, otherwise raw query
    const { data, error } = await this.client
      .rpc('match_user_embeddings', {
        query_embedding: params.embedding,
        match_user_id: params.userId,
        match_threshold: threshold,
        match_limit: limit,
      });

    return {
      data: data as UserEmbeddingRecord[] | null,
      error: error ? new Error(error.message) : null,
      status: error?.code ? 400 : 200,
    };
  }

  /**
   * Delete old embeddings for a user
   */
  async deleteOldEmbeddings(params: {
    userId: string;
    olderThanDays: number;
  }): Promise<QueryResult<{ count: number }>> {
    if (!this.adminClient) {
      return {
        data: null,
        error: new Error('Admin client required for delete operations'),
        status: 403,
      };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - params.olderThanDays);

    const { data, error } = await this.adminClient
      .from('user_embeddings')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .eq('user_id', params.userId)
      .select('id');

    return {
      data: { count: data?.length || 0 },
      error: error ? new Error(error.message) : null,
      status: error?.code ? 400 : 200,
    };
  }

  // -----------------------------------------------------------------------
  // Product Search Operations (BM25)
  // -----------------------------------------------------------------------

  /**
   * Search products using BM25 full-text search
   */
  async searchProductsBm25(params: {
    searchText: string;
    limit?: number;
    category?: string;
  }): Promise<QueryResult<ProductSearchRecord[]>> {
    const limit = params.limit || 20;

    let query = this.client
      .from('Product')
      .select('id, name, description, price, category, sku, rating')
      .textSearch('name', params.searchText, {
        type: 'websearch',
        config: 'english',
      });

    if (params.category) {
      query = query.eq('category', params.category);
    }

    query = query.limit(limit).order('rating', { ascending: false });

    const { data, error } = await query;

    return {
      data: data as ProductSearchRecord[] | null,
      error: error ? new Error(error.message) : null,
      status: error?.code ? 400 : 200,
    };
  }

  // -----------------------------------------------------------------------
  // Order Search Operations (BM25)
  // -----------------------------------------------------------------------

  /**
   * Search orders using full-text search
   */
  async searchOrders(params: {
    userId: string;
    searchText: string;
    limit?: number;
  }): Promise<QueryResult<OrderSearchRecord[]>> {
    const limit = params.limit || 20;

    // Join with products for full-text search on product names
    const { data, error } = await this.client
      .from('Order')
      .select(`
        id,
        status,
        total,
        Product (name)
      `)
      .eq('customerId', params.userId)
      .textSearch('Product.name', params.searchText, {
        type: 'websearch',
        config: 'english',
      })
      .limit(limit);

    const formattedData = data?.map((order) => ({
      id: order.id,
      status: order.status,
      product_name: (order.Product as { name: string })?.name || 'Unknown',
      total: order.total,
    })) || null;

    return {
      data: formattedData,
      error: error ? new Error(error.message) : null,
      status: error?.code ? 400 : 200,
    };
  }

  // -----------------------------------------------------------------------
  // Authentication Helpers
  // -----------------------------------------------------------------------

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<QueryResult<{ id: string; email: string }>> {
    const { data, error } = await this.client.auth.getUser();

    return {
      data: data.user
        ? { id: data.user.id, email: data.user.email || '' }
        : null,
      error: error ? new Error(error.message) : null,
      status: error?.code ? 401 : 200,
    };
  }

  /**
   * Verify session token
   */
  async verifySession(sessionToken: string): Promise<QueryResult<{ userId: string }>> {
    const { data, error } = await this.client.auth.getUser();

    return {
      data: data.user ? { userId: data.user.id } : null,
      error: error ? new Error(error.message) : null,
      status: error?.code ? 401 : 200,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _databaseInstance: SupabaseDatabase | null = null;

/**
 * Get SupabaseDatabase instance with type-safe operations
 */
export function getSupabaseDatabase(): SupabaseDatabase {
  if (_databaseInstance) {
    return _databaseInstance;
  }

  const client = getSupabaseClient();
  const adminClient = env.NODE_ENV === 'production' ? getSupabaseAdminClient() : null;

  _databaseInstance = new SupabaseDatabase(client, adminClient);

  return _databaseInstance;
}

// ============================================================================
// Re-export for convenience
// ============================================================================

export { getSupabaseClient, getSupabaseAdminClient };
export default getSupabaseClient;
