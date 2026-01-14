/**
 * E-Commerce Agent SSE API Route
 *
 * Handles POST requests for the LangGraph e-commerce agent with SSE streaming.
 * Provides authentication, thread management, and graceful error handling.
 *
 * @packageDocumentation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '../../../lib/supabase/client.js';
import {
  getCheckpointSaver,
  generateThreadId,
  generateCheckpointId,
} from '../../../lib/redis/checkpointer.js';
import { AgentState, createInitialState, Message } from '../../../lib/agents/state.js';

/**
 * Request body schema for agent queries
 */
export interface AgentRequest {
  /** User's message content */
  message: string;
  /** Optional thread ID for continuing conversation */
  threadId?: string;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Enable streaming (default: true) */
  stream?: boolean;
}

/**
 * SSE event types
 */
export type SSEEventType =
  | 'delta'          // Token/partial response
  | 'complete'       // Response complete
  | 'error'          // Error occurred
  | 'thread_id'      // New thread ID assigned
  | 'metadata'       // Processing metadata
  | 'heartbeat'      // Keep-alive ping
  | 'tool_call'      // Tool execution started
  | 'tool_complete'  // Tool execution finished
  | 'checkpoint'     // State checkpoint saved;

/**
 * SSE event payload
 */
export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp?: number;
}

/**
 * Response schema for agent queries
 */
export interface AgentResponse {
  threadId: string;
  messageId: string;
  response: string;
  metadata?: {
    intent?: string;
    processingTime?: number;
    tokensUsed?: number;
  };
}

/**
 * Parse and validate request body
 * @param request - Next.js request object
 * @returns Parsed and validated request or error response
 */
async function parseRequest(request: NextRequest): Promise<AgentRequest> {
  const body = await request.json() as unknown;

  // Validate required fields
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body');
  }

  const { message, threadId, systemPrompt, stream } = body as Record<string, unknown>;

  // Validate message
  if (!message || typeof message !== 'string') {
    throw new Error('Message is required and must be a string');
  }

  // Validate message length
  if (message.length > 10000) {
    throw new Error('Message too long (max 10000 characters)');
  }

  // Validate threadId if provided
  if (threadId && typeof threadId !== 'string') {
    throw new Error('Thread ID must be a string');
  }

  return {
    message,
    threadId: threadId as string | undefined,
    systemPrompt: systemPrompt as string | undefined,
    stream: stream !== false, // Default to true
  };
}

/**
 * Authenticate request using Supabase session
 * @param request - Next.js request object
 * @returns User ID
 */
async function authenticateRequest(request: NextRequest): Promise<string> {
  // Extract auth token from header
  const authHeader = request.headers.get('authorization');

  // Try to get user from Supabase client
  const supabase = getSupabaseClient();

  // Check for Bearer token
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new Error('Invalid or expired token');
    }

    return data.user.id;
  }

  // Try to get user from session (cookies)
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Authentication required');
  }

  return user.id;
}

/**
 * Format SSE event as string
 * @param event - SSE event to format
 * @returns Formatted SSE string
 */
function formatSSEEvent(event: SSEEvent): string {
  let sse = '';
  sse += `event: ${event.type}\n`;
  sse += `data: ${JSON.stringify(event.data)}\n`;
  sse += `id: ${event.timestamp || Date.now()}\n`;
  sse += '\n';
  return sse;
}

/**
 * Send SSE event to controller
 * @param controller - ReadableStream controller
 * @param event - SSE event to send
 */
function sendSSEEvent(
  controller: ReadableStreamDefaultController,
  event: SSEEvent
): void {
  try {
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode(formatSSEEvent(event)));
  } catch (error) {
    console.error('[Agent] Error sending SSE event:', error);
  }
}

/**
 * Process agent request and stream response
 * @param request - Validated agent request
 * @param userId - Authenticated user ID
 * @param threadId - Conversation thread ID
 * @param controller - SSE controller for streaming
 * @returns Response data
 */
async function processAgentRequest(
  request: AgentRequest,
  userId: string,
  threadId: string,
  controller: ReadableStreamDefaultController
): Promise<AgentResponse> {
  const startTime = Date.now();

  // Get checkpoint saver
  const { saver } = await getCheckpointSaver();
  const checkpointId = generateCheckpointId();

  // Load existing state or create new
  let state: AgentState;
  const existingCheckpoints = await saver.list(threadId);

  if (existingCheckpoints.length > 0) {
    // Load latest checkpoint
    const latestCheckpointId = existingCheckpoints[existingCheckpoints.length - 1];
    const checkpoint = await saver.get(threadId, latestCheckpointId);
    state = checkpoint?.state || createInitialState(threadId, userId, request.message);

    // Add new message to state
    const newMessage: Message = {
      id: crypto.randomUUID(),
      role: 'human',
      content: request.message,
      timestamp: Date.now(),
    };
    state.messages = [...state.messages, newMessage];
  } else {
    // Create new state
    state = createInitialState(threadId, userId, request.message);
  }

  // Update metadata
  state.metadata.thread_id = threadId;
  state.metadata.user_id = userId;
  state.metadata.last_updated = Date.now();

  // Send thread ID if this is the first message
  if (existingCheckpoints.length === 0) {
    sendSSEEvent(controller, {
      type: 'thread_id',
      data: { threadId },
      timestamp: Date.now(),
    });
  }

  // Simulate agent processing with streaming updates
  // In production, this would call the LangGraph agent
  const processingSteps: Array<{ type: SSEEventType; message: string; duration: number }> = [
    { type: 'metadata', message: 'Analyzing query intent...', duration: 100 },
    { type: 'tool_call', message: 'Searching knowledge base...', duration: 200 },
    { type: 'tool_complete', message: 'Found relevant information', duration: 150 },
    { type: 'metadata', message: 'Generating response...', duration: 100 },
  ];

  // Process with simulated steps
  let fullResponse = '';
  const simulatedResponse = `I understand you're asking about "${request.message.substring(0, 50)}...". ` +
    `As your e-commerce support assistant, I'm here to help with orders, refunds, products, and more. ` +
    `How can I assist you further with your inquiry?`;

  for (const step of processingSteps) {
    // Send processing metadata
    sendSSEEvent(controller, {
      type: step.type,
      data: { message: step.message, status: 'processing' },
      timestamp: Date.now(),
    });

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, step.duration));

    // Send heartbeat to keep connection alive
    sendSSEEvent(controller, {
      type: 'heartbeat',
      data: { status: 'alive' },
      timestamp: Date.now(),
    });
  }

  // Stream the response in chunks
  const chunks = simulatedResponse.split(' ');
  for (let i = 0; i < chunks.length; i++) {
    const chunk = i === 0 ? chunks[i] : ' ' + chunks[i];
    fullResponse += chunk;

    sendSSEEvent(controller, {
      type: 'delta',
      data: { token: chunk, partial: i < chunks.length - 1 },
      timestamp: Date.now(),
    });

    // Small delay between tokens for streaming effect
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  // Add AI response to state
  const aiMessage: Message = {
    id: crypto.randomUUID(),
    role: 'ai',
    content: fullResponse,
    timestamp: Date.now(),
  };
  state.messages = [...state.messages, aiMessage];

  // Save checkpoint
  state.metadata.last_updated = Date.now();
  await saver.put(threadId, checkpointId, {
    state,
    timestamp: Date.now(),
    version: existingCheckpoints.length + 1,
    nodeVisits: state.metadata.node_visits,
  });

  // Send completion event
  sendSSEEvent(controller, {
    type: 'complete',
    data: {
      messageId: aiMessage.id,
      processingTime: Date.now() - startTime,
      tokensUsed: Math.floor(fullResponse.length / 4),
    },
    timestamp: Date.now(),
  });

  return {
    threadId,
    messageId: aiMessage.id,
    response: fullResponse,
    metadata: {
      processingTime: Date.now() - startTime,
      tokensUsed: Math.floor(fullResponse.length / 4),
    },
  };
}

/**
 * Handle SSE streaming response
 * @param request - Next.js request object
 * @returns SSE streaming response
 */
async function handleSSEStream(
  request: NextRequest
): Promise<NextResponse> {
  // Create ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Parse and validate request
        const data = await parseRequest(request);

        // Authenticate request
        const userId = await authenticateRequest(request);

        // Get or create thread ID
        const threadId = data.threadId || generateThreadId();

        // Send initial connection event
        sendSSEEvent(controller, {
          type: 'metadata',
          data: {
            status: 'connected',
            threadId,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        });

        // Process the request
        const result = await processAgentRequest(data, userId, threadId, controller);

        console.log(`[Agent] Request completed: threadId=${threadId}, messageId=${result.messageId}`);

      } catch (error) {
        console.error('[Agent] Stream error:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        sendSSEEvent(controller, {
          type: 'error',
          data: {
            message: 'An error occurred while processing your request',
            details: errorMessage,
            code: 'INTERNAL_ERROR',
          },
          timestamp: Date.now(),
        });
      } finally {
        controller.close();
      }
    },
    cancel() {
      console.log('[Agent] Stream cancelled by client');
    },
  });

  // Return SSE response with appropriate headers
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

/**
 * Handle non-streaming JSON response (fallback for clients that don't support SSE)
 * @param request - Next.js request object
 * @returns JSON response
 */
async function handleJSONResponse(
  request: NextRequest
): Promise<NextResponse> {
  try {
    // Parse and validate request
    const data = await parseRequest(request);

    // Authenticate request
    const userId = await authenticateRequest(request);

    const threadId = data.threadId || generateThreadId();

    // Get checkpoint saver
    const { saver } = await getCheckpointSaver();
    const checkpointId = generateCheckpointId();

    // Load or create state
    let state: AgentState;
    const existingCheckpoints = await saver.list(threadId);

    if (existingCheckpoints.length > 0) {
      const latestCheckpointId = existingCheckpoints[existingCheckpoints.length - 1];
      const checkpoint = await saver.get(threadId, latestCheckpointId);
      state = checkpoint?.state || createInitialState(threadId, userId, data.message);
      state.messages = [...state.messages, {
        id: crypto.randomUUID(),
        role: 'human',
        content: data.message,
        timestamp: Date.now(),
      }];
    } else {
      state = createInitialState(threadId, userId, data.message);
    }

    state.metadata.thread_id = threadId;
    state.metadata.user_id = userId;
    state.metadata.last_updated = Date.now();

    // Generate response (simulated - replace with actual agent)
    const response = `I understand you're asking about "${data.message.substring(0, 50)}...". ` +
      `How can I assist you further?`;

    // Add AI response to state
    const aiMessage = {
      id: crypto.randomUUID(),
      role: 'ai' as const,
      content: response,
      timestamp: Date.now(),
    };
    state.messages = [...state.messages, aiMessage];

    // Save checkpoint
    await saver.put(threadId, checkpointId, {
      state,
      timestamp: Date.now(),
      version: existingCheckpoints.length + 1,
      nodeVisits: state.metadata.node_visits,
    });

    return NextResponse.json({
      threadId,
      messageId: aiMessage.id,
      response,
      metadata: {
        processingTime: 0,
        tokensUsed: Math.floor(response.length / 4),
      },
    });

  } catch (error) {
    console.error('[Agent] JSON handler error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'An error occurred while processing your request',
        details: errorMessage,
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}

/**
 * Main POST handler for the agent API
 * Supports both SSE streaming and JSON responses
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check for streaming preference
  const streamParam = request.nextUrl.searchParams.get('stream');
  const acceptHeader = request.headers.get('accept');

  const wantsSSE = streamParam === 'true' ||
    (streamParam !== 'false' && acceptHeader?.includes('text/event-stream'));

  if (wantsSSE) {
    return handleSSEStream(request);
  }

  return handleJSONResponse(request);
}

/**
 * GET handler for health check and API info
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    name: 'E-Commerce Agent API',
    version: '1.0.0',
    description: 'LangGraph-powered e-commerce support agent with SSE streaming',
    endpoints: {
      POST: 'Send a message to the agent (supports SSE streaming)',
    },
    streaming: true,
    authentication: 'Supabase session token required',
  });
}

/**
 * OPTIONS handler for CORS preflight requests
 */
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
