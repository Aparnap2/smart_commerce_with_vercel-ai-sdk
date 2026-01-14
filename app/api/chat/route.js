import { streamText } from 'ai';
import { databaseQueryTool } from '../../../lib/tools/database';
import { SYSTEM_PROMPT } from './system-prompt';
import { getLLMModel, isDevelopment, getLLMInfo } from '../../../lib/ai/config';

export async function POST(req) {
  console.log('[API_ROUTE] ===== NEW REQUEST =====');
  console.log('[API_ROUTE] Received request at:', new Date().toISOString());

  try {
    console.log('[API_ROUTE] Parsing request body...');
    const body = await req.json();
    console.log('[API_ROUTE] Request body received, size:', JSON.stringify(body).length);

    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      console.error('[API_ROUTE] ❌ Invalid messages format:', typeof messages, Array.isArray(messages));
      return new Response('Invalid request: messages must be an array', {
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    console.log('[API_ROUTE] Messages count:', messages.length);
    messages.forEach((msg, i) => {
      console.log(`[API_ROUTE] Message ${i}: role=${msg.role}, content_length=${msg.content?.length || 0}`);
    });

    // Detect if this is a data query that requires tool usage
    const lastMessage = messages[messages.length - 1];
    let requiresTool = false;

    if (lastMessage && lastMessage.role === 'user') {
      const lowerContent = lastMessage.content.toLowerCase().trim();
      console.log('[API_ROUTE] Last message content preview:', lowerContent.substring(0, 100) + (lowerContent.length > 100 ? '...' : ''));

      // Check if message contains data query keywords
      const dataKeywords = ['order', 'product', 'ticket', 'customer', 'find', 'check', 'show', 'get', '@'];
      requiresTool = dataKeywords.some(keyword => lowerContent.includes(keyword));
      console.log('[API_ROUTE] Tool required:', requiresTool, 'matching keywords:', dataKeywords.filter(k => lowerContent.includes(k)));
    }

    // Check database tool
    if (!databaseQueryTool || typeof databaseQueryTool.execute !== 'function') {
      console.error('[API_ROUTE] ❌ Database tool not configured properly');
      console.error('  databaseQueryTool exists:', !!databaseQueryTool);
      console.error('  execute function exists:', typeof databaseQueryTool?.execute);
      return new Response('Internal server error: Tool not configured.', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    console.log('[API_ROUTE] ✅ Database tool is configured');

    // Get LLM config info for debugging
    const llmInfo = getLLMInfo();
    console.log('[API_ROUTE] LLM Configuration:');
    console.log('  Provider:', llmInfo.provider);
    console.log('  Model:', llmInfo.modelName);
    console.log('  Environment:', llmInfo.isDev ? 'development' : 'production');

    // Use configured LLM with streaming
    let result;
    console.log('[API_ROUTE] 🚀 Calling streamText...');
    try {
      const streamConfig = {
        model: getLLMModel(),
        system: SYSTEM_PROMPT,
        messages,
        tools: {
          db_query: databaseQueryTool,
        },
        toolChoice: requiresTool ? 'auto' : 'auto',
        temperature: isDevelopment() ? 0.7 : 0.5,
      };

      console.log('[API_ROUTE] Stream config:', {
        hasModel: !!streamConfig.model,
        messageCount: streamConfig.messages.length,
        toolChoice: streamConfig.toolChoice,
        temperature: streamConfig.temperature,
        systemPromptLength: streamConfig.system.length
      });

      result = await streamText(streamConfig);
      console.log('[API_ROUTE] ✅ streamText completed successfully');

    } catch (llmError) {
      console.error('[API_ROUTE] ❌ LLM STREAM ERROR - Full details:');
      console.error('  Error name:', llmError.name);
      console.error('  Error message:', llmError.message);
      console.error('  Error stack:', llmError.stack);
      console.error('  Error cause:', llmError.cause);

      // Check if it's a specific type of error
      if (llmError.message?.includes('fetch')) {
        console.error('[API_ROUTE] Network/fetch error detected');
      }
      if (llmError.message?.includes('timeout')) {
        console.error('[API_ROUTE] Timeout error detected');
      }
      if (llmError.message?.includes('model')) {
        console.error('[API_ROUTE] Model-related error detected');
      }

      // Return detailed error response for debugging
      const errorResponse = `LLM Error: ${llmError.message}. Provider: ${llmInfo.provider}, Model: ${llmInfo.modelName}`;

      console.log('[API_ROUTE] 📤 Returning error response to client');

      const stream = new ReadableStream({
        async start(controller) {
          const textData = `0:"${JSON.stringify(errorResponse)}"\n`;
          controller.enqueue(new TextEncoder().encode(textData));
          controller.close();
        }
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // Return streaming response
    console.log('[API_ROUTE] 📤 Returning successful stream response');
    return result.toDataStreamResponse();

  } catch (error) {
    console.error('[API_ROUTE] ❌ GENERAL ERROR - Full details:');
    console.error('  Error name:', error.name);
    console.error('  Error message:', error.message);
    console.error('  Error stack:', error.stack);
    console.error('  Error cause:', error.cause);

    // Check request parsing errors
    if (error instanceof SyntaxError) {
      console.error('[API_ROUTE] JSON parsing error - invalid request body');
    }

    return new Response(
      `Error: ${error.message || 'An error occurred during the request.'}`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      }
    );
  }
}