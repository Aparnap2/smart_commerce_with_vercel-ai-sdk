-- ============================================================================
-- pgvector Setup Migration for User Preference History
-- ============================================================================
-- This migration sets up:
-- 1. pgvector extension for 384-dimensional embeddings
-- 2. user_embeddings table for preference history
-- 3. HNSW index for fast similarity search
-- 4. Row Level Security (RLS) policies for data isolation
-- 5. BM25 full-text search capabilities
--
-- Migration version: 001
-- ============================================================================

-- ============================================================================
-- 1. Enable Required Extensions
-- ============================================================================

-- Enable pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pg_trgm for trigram similarity (used in BM25 fallback)
CREATE EXTENSION IF NOT EXISTS IF EXISTS pg_trgm;

-- Enable fuzzystrmatch for text similarity (optional, for advanced matching)
CREATE EXTENSION IF NOT EXISTS IF EXISTS fuzzystrmatch;

-- ============================================================================
-- 2. Create User Embeddings Table
-- ============================================================================

-- Table to store user query embeddings for preference-based search
CREATE TABLE IF NOT EXISTS user_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    embedding VECTOR(384) NOT NULL,  -- 384 dimensions for sentence-transformers/all-MiniLM-L6-v2
    query_text TEXT NOT NULL,
    context_type TEXT NOT NULL,      -- 'product_search', 'order_inquiry', 'general', etc.
    context_id TEXT,                 -- Optional reference to related record
    metadata JSONB DEFAULT '{}'::jsonb,  -- Additional context data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraint: user_id and query_text combination should be unique per session
    CONSTRAINT unique_user_query UNIQUE (user_id, query_text, context_type, context_id)
);

-- ============================================================================
-- 3. Create HNSW Index for Vector Similarity Search
-- ============================================================================

-- HNSW (Hierarchical Navigable Small World) index for fast approximate nearest neighbor search
-- Using inner product (vector_ip_ops) for cosine similarity via normalized vectors
CREATE INDEX IF NOT EXISTS idx_user_embeddings_hnsw
ON user_embeddings
USING hnsw (embedding vector_ip_ops)
WITH (m = 16, ef_construction = 64);

-- Additional index on user_id for fast user-specific lookups
CREATE INDEX IF NOT EXISTS idx_user_embeddings_user_id
ON user_embeddings (user_id, created_at DESC);

-- ============================================================================
-- 4. Enable Row Level Security (RLS)
-- ============================================================================

ALTER TABLE user_embeddings ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows users to only see their own embeddings
CREATE POLICY IF NOT EXISTS "Users can view own embeddings" ON user_embeddings
    FOR SELECT
    USING (auth.uid()::TEXT = user_id OR user_id = current_setting('app.current_user_id', true));

CREATE POLICY IF NOT EXISTS "Users can insert own embeddings" ON user_embeddings
    FOR INSERT
    WITH CHECK (auth.uid()::TEXT = user_id OR user_id = current_setting('app.current_user_id', true));

CREATE POLICY IF NOT EXISTS "Users can update own embeddings" ON user_embeddings
    FOR UPDATE
    USING (auth.uid()::TEXT = user_id OR user_id = current_setting('app.current_user_id', true));

CREATE POLICY IF NOT EXISTS "Users can delete own embeddings" ON user_embeddings
    FOR DELETE
    USING (auth.uid()::TEXT = user_id OR user_id = current_setting('app.current_user_id', true));

-- ============================================================================
-- 5. Enable Full-Text Search Index on Product Table
-- ============================================================================

-- Add a generated column for full-text search on products
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(category, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(sku, '')), 'D')
    ) STORED;

-- Create GIN index for full-text search performance
CREATE INDEX IF NOT EXISTS idx_product_search_vector
ON "Product" USING gin(search_vector);

-- ============================================================================
-- 6. Enable Full-Text Search Index on Order Table (via Product join)
-- ============================================================================

-- Create a function to update order search relevance based on product name
CREATE OR REPLACE FUNCTION get_order_search_relevance(order_row "Order", search_query TEXT)
RETURNS FLOAT AS $$
BEGIN
    RETURN ts_rank(
        (SELECT COALESCE(search_vector, '') FROM "Product" WHERE id = order_row."productId"),
        websearch_to_tsquery('english', search_query)
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 7. Create pgvector Similarity Search Function (RPC)
-- ============================================================================

-- Function to perform vector similarity search with threshold
-- Uses inner product for normalized vectors (equivalent to cosine similarity)
CREATE OR REPLACE FUNCTION match_user_embeddings(
    query_embedding VECTOR(384),
    match_user_id TEXT,
    match_threshold FLOAT DEFAULT 0.7,
    match_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    user_id TEXT,
    embedding VECTOR(384),
    query_text TEXT,
    context_type TEXT,
    context_id TEXT,
    similarity FLOAT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ue.id,
        ue.user_id,
        ue.embedding,
        ue.query_text,
        ue.context_type,
        ue.context_id,
        (ue.embedding <#> query_embedding)::FLOAT AS similarity,
        ue.created_at,
        ue.updated_at
    FROM user_embeddings ue
    WHERE ue.user_id = match_user_id
      AND (ue.embedding <#> query_embedding)::FLOAT >= match_threshold
    ORDER BY similarity DESC
    LIMIT match_limit;
END;
$$;

-- ============================================================================
-- 8. Create BM25 Full-Text Search Function for Products
-- ============================================================================

-- Function for BM25-style product search
CREATE OR REPLACE FUNCTION search_products_bm25(
    search_query TEXT,
    search_limit INTEGER DEFAULT 20,
    search_category TEXT DEFAULT NULL
)
RETURNS TABLE (
    id INT,
    name TEXT,
    description TEXT,
    price FLOAT,
    stock INT,
    category TEXT,
    sku TEXT,
    rating FLOAT,
    rank FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        p.stock,
        p.category,
        p.sku,
        p.rating,
        ts_rank(p.search_vector, websearch_to_tsquery('english', search_query)) AS rank
    FROM "Product" p
    WHERE
        (search_category IS NULL OR p.category = search_category)
        AND p.search_vector @@ websearch_to_tsquery('english', search_query)
    ORDER BY rank DESC, p.rating DESC
    LIMIT search_limit;
END;
$$;

-- ============================================================================
-- 9. Create Hybrid Search Function (BM25 + Vector)
-- ============================================================================

-- Function to combine BM25 and vector search results
CREATE OR REPLACE FUNCTION hybrid_search_products(
    query_embedding VECTOR(384),
    search_query TEXT,
    user_id TEXT,
    vector_weight FLOAT DEFAULT 0.5,
    bm25_weight FLOAT DEFAULT 0.5,
    match_threshold FLOAT DEFAULT 0.7,
    search_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id INT,
    name TEXT,
    description TEXT,
    price FLOAT,
    stock INT,
    category TEXT,
    sku TEXT,
    rating FLOAT,
    combined_score FLOAT,
    match_type TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    bm25_limit INTEGER := search_limit * 2;  -- Get more BM25 results for fusion
BEGIN
    RETURN QUERY
    WITH vector_results AS (
        -- Get vector similarity matches (user preferences)
        SELECT
            p.id,
            p.name,
            p.description,
            p.price,
            p.stock,
            p.category,
            p.sku,
            p.rating,
            1 - ((p.embedding <#> query_embedding)::FLOAT + 1) / 2 AS vector_score,
            'vector' AS match_type
        FROM "Product" p
        INNER JOIN user_embeddings ue ON true
        WHERE ue.user_id = match_user_id
          AND (p.embedding <#> query_embedding)::FLOAT >= match_threshold
    ),
    bm25_results AS (
        -- Get BM25 full-text matches
        SELECT
            p.id,
            p.name,
            p.description,
            p.price,
            p.stock,
            p.category,
            p.sku,
            p.rating,
            ts_rank(p.search_vector, websearch_to_tsquery('english', search_query)) AS bm25_score,
            'bm25' AS match_type
        FROM "Product" p
        WHERE p.search_vector @@ websearch_to_tsquery('english', search_query)
        ORDER BY bm25_score DESC
        LIMIT bm25_limit
    ),
    combined AS (
        -- Normalize and combine scores
        SELECT
            COALESCE(v.id, b.id) AS id,
            COALESCE(v.name, b.name) AS name,
            COALESCE(v.description, b.description) AS description,
            COALESCE(v.price, b.price) AS price,
            COALESCE(v.stock, b.stock) AS stock,
            COALESCE(v.category, b.category) AS category,
            COALESCE(v.sku, b.sku) AS sku,
            COALESCE(v.rating, b.rating) AS rating,
            COALESCE(
                (v.vector_score * vector_weight) + (b.bm25_score * bm25_weight),
                v.vector_score * vector_weight,
                b.bm25_score * bm25_weight
            ) AS combined_score,
            COALESCE(v.match_type, b.match_type) AS match_type
        FROM vector_results v
        FULL OUTER JOIN bm25_results b ON v.id = b.id
    )
    SELECT
        c.id,
        c.name,
        c.description,
        c.price,
        c.stock,
        c.category,
        c.sku,
        c.rating,
        c.combined_score,
        c.match_type
    FROM combined c
    ORDER BY c.combined_score DESC
    LIMIT search_limit;
END;
$$;

-- ============================================================================
-- 10. Create Index Maintenance Functions
-- ============================================================================

-- Function to rebuild HNSW index (useful for maintenance)
CREATE OR REPLACE FUNCTION rebuild_user_embeddings_index()
RETURNS VOID AS $$
BEGIN
    -- Drop existing index
    DROP INDEX IF EXISTS idx_user_embeddings_hnsw;
    -- Recreate index with current data
    CREATE INDEX IF NOT EXISTS idx_user_embeddings_hnsw
    ON user_embeddings
    USING hnsw (embedding vector_ip_ops)
    WITH (m = 16, ef_construction = 64);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. Create Updated_at Trigger
-- ============================================================================

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_embeddings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_embeddings_timestamp ON user_embeddings;
CREATE TRIGGER trigger_update_user_embeddings_timestamp
    BEFORE UPDATE ON user_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_user_embeddings_timestamp();

-- ============================================================================
-- 12. Comments and Documentation
-- ============================================================================

COMMENT ON TABLE user_embeddings IS 'Stores user query embeddings for preference-based semantic search. 384-dimensional vectors from sentence-transformers models.';
COMMENT ON COLUMN user_embeddings.embedding IS '384-dimensional vector embedding using cosine similarity (inner product on normalized vectors)';
COMMENT ON COLUMN user_embeddings.context_type IS 'Type of query context: product_search, order_inquiry, ticket_create, general_support, etc.';
COMMENT ON INDEX idx_user_embeddings_hnsW IS 'HNSW index for fast approximate nearest neighbor search using inner product';
COMMENT ON FUNCTION match_user_embeddings IS 'Performs vector similarity search with threshold filtering for user preference matching';
COMMENT ON FUNCTION search_products_bm25 IS 'Performs BM25 full-text search on product catalog';
COMMENT ON FUNCTION hybrid_search_products IS 'Combines vector similarity and BM25 scores for hybrid search results';

-- ============================================================================
-- 13. Verify Installation
-- ============================================================================

-- Verify pgvector extension is installed
SELECT
    extname AS extension,
    extversion AS version
FROM pg_extension
WHERE extname = 'vector';

-- Verify user_embeddings table exists
SELECT
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'user_embeddings'
ORDER BY ordinal_position;

-- List all indexes on user_embeddings
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'user_embeddings';

-- List RLS policies
SELECT
    policyname,
    tablename,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'user_embeddings';
