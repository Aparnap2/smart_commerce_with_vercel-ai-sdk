/**
 * LangGraph Chat API Route with Redis Checkpointing
 * Demonstrates how to use Redis-based state persistence for LangGraph workflows
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  StateGraph,
  END,
  START,
} from '@langchain/langgraph';
import {
  createCheckpointSaver,
  checkRedisHealth,
  getCheckpointManager,
  logger,
} from '@/lib/redis/index.js';
import { env } from '@/lib/env.js';

/**
 * Define the state schema for the graph
 */
interface ChatState {
  messages: Array<{ role: string; content: string }>;
  context: string;
  response: string;
}

/**
 * Define the graph nodes
 */
function processMessage(state: ChatState): ChatState {
  return {
    ...state,
    response: `Processed: ${state.messages[state.messages.length - 1]?.content ?? ''}`,
  };
}

function generateResponse(state: ChatState): ChatState {
  return {
    ...state,
    response: `AI Response: ${state.response}`,
  };
}

/**
 * Creates the chat workflow graph
 */
function createChatGraph(checkpointSaver: ReturnType<typeof createCheckpointSaver>) {
  const workflow = new StateGraph<ChatState>({
    channels: {
      messages: {
        default: () => [],
      },
      context: {
        default: () => '',
      },
      response: {
        default: () => '',
      },
    },
  });

  workflow.addNode('process', processMessage);
  workflow.addNode('generate', generateResponse);

  workflow.addEdge(START, 'process');
  workflow.addEdge('process', 'generate');
  workflow.addEdge('generate', END);

  return workflow.compile({
    checkpointer: checkpointSaver,
  });
}

/**
 * GET /api/chat/langgraph
 * Returns health status and checkpoint information
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get('threadId');
  const action = searchParams.get('action') || 'health';

  try {
    switch (action) {
      case 'health': {
        const health = await checkRedisHealth();
        return NextResponse.json({
          success: health.healthy,
          redis: health,
          mode: env.USE_REDIS ? 'redis' : 'memory',
        });
      }

      case 'list': {
        if (!threadId) {
          return NextResponse.json(
            { error: 'threadId is required for list action' },
            { status: 400 }
          );
        }

        const manager = getCheckpointManager();
        const checkpoints = await manager.listCheckpoints(threadId, 10);

        return NextResponse.json({
          threadId,
          checkpoints,
        });
      }

      case 'metadata': {
        if (!threadId) {
          return NextResponse.json(
            { error: 'threadId is required for metadata action' },
            { status: 400 }
          );
        }

        const manager = getCheckpointManager();
        const metadata = await manager.getThreadMetadata(threadId);

        return NextResponse.json({
          threadId,
          metadata,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error('API', 'GET request failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat/langgraph
 * Creates a new thread and runs the workflow
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { threadId, message, checkpointId } = body as {
      threadId?: string;
      message?: string;
      checkpointId?: string;
    };

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Generate thread ID if not provided
    const effectiveThreadId = threadId || `thread-${Date.now()}`;

    logger.info('API', 'Processing chat message', {
      threadId: effectiveThreadId,
      messageLength: message.length,
    });

    // Create checkpoint saver based on environment
    const checkpointSaver = createCheckpointSaver(
      env.USE_REDIS,
      ['chat', 'langgraph']
    );

    // Create and compile the graph
    const graph = createChatGraph(checkpointSaver);

    // Initial state
    const initialState: ChatState = {
      messages: [{ role: 'user', content: message }],
      context: '',
      response: '',
    };

    // Run the graph
    const result = await graph.invoke(initialState, {
      configurable: {
        thread_id: effectiveThreadId,
        checkpoint_id: checkpointId,
      },
    });

    logger.info('API', 'Chat processing complete', {
      threadId: effectiveThreadId,
      responseLength: result.response.length,
    });

    return NextResponse.json({
      success: true,
      threadId: effectiveThreadId,
      checkpointId: result.checkpoint?.id,
      response: result.response,
      state: {
        messages: result.messages,
        response: result.response,
      },
    });
  } catch (error) {
    logger.error('API', 'POST request failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat/langgraph
 * Deletes a thread and all its checkpoints
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get('threadId');

  if (!threadId) {
    return NextResponse.json(
      { error: 'threadId is required' },
      { status: 400 }
    );
  }

  try {
    const manager = getCheckpointManager();
    const success = await manager.deleteThread(threadId);

    logger.info('API', 'Thread deleted', { threadId, success });

    return NextResponse.json({
      success,
      threadId,
    });
  } catch (error) {
    logger.error('API', 'DELETE request failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
