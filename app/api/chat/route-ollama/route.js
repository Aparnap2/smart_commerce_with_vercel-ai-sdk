import { streamText } from 'ai';
import { databaseQueryTool } from '../../../../lib/tools/database';
import { SYSTEM_PROMPT } from '../system-prompt';
import { getLLMModel, isDevelopment, getLLMInfo } from '../../../../lib/ai/config';

export const maxDuration = 30;

export async function POST(req) {
  console.log('[OLLAMA_ROUTE] ===== NEW REQUEST =====');
  console.log('[OLLAMA_ROUTE] Received request at:', new Date().toISOString());

  try {
    console.log('[OLLAMA_ROUTE] Parsing request body...');
    const body = await req.json();
    console.log('[OLLAMA_ROUTE] Request body received, size:', JSON.stringify(body).length);

    const { messages } = body;
    console.log('[OLLAMA_ROUTE] Extracted messages:', messages);

    if (!messages || !Array.isArray(messages)) {
      console.error('[OLLAMA_ROUTE] ❌ Invalid messages format:', typeof messages, Array.isArray(messages));
      throw new Error('Invalid request: messages must be an array');
    }

    console.log('[OLLAMA_ROUTE] Messages validation passed, count:', messages.length);

    // Detect if this is a data query that requires tool usage
    const lastMessage = messages[messages.length - 1];
    let requiresTool = false;
    
    if (lastMessage && lastMessage.role === 'user') {
      const lowerContent = lastMessage.content.toLowerCase().trim();

      // Check if message contains data query keywords
      const dataKeywords = ['order', 'product', 'ticket', 'customer', 'find', 'check', 'show', 'get', '@'];
      requiresTool = dataKeywords.some(keyword => lowerContent.includes(keyword));
    }
    
    console.log('[OLLAMA_ROUTE] Checking database tool...');
    if (!databaseQueryTool || typeof databaseQueryTool.execute !== 'function') {
      console.error('[OLLAMA_ROUTE] ❌ Database tool not configured properly');
      console.error('  databaseQueryTool exists:', !!databaseQueryTool);
      console.error('  execute function exists:', typeof databaseQueryTool?.execute);
      return new Response('Internal server error: Tool not configured.', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    console.log('[OLLAMA_ROUTE] ✅ Database tool is configured');

    // Get LLM config info
    const llmInfo = getLLMInfo();
    console.log('[OLLAMA_ROUTE] LLM Configuration:');
    console.log('  Provider:', llmInfo.provider);
    console.log('  Model:', llmInfo.modelName);
    console.log('  Environment:', llmInfo.isDev ? 'development' : 'production');

    // Use configured LLM with streaming
    console.log('[OLLAMA_ROUTE] 🚀 Calling streamText...');
    let result;
    try {
      // MANUAL OLLAMA CALL - Bypass AI SDK streaming issues
      console.log('[OLLAMA_ROUTE] Making direct Ollama API call...');

      const ollamaResponse = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mistral:latest',
          messages: [
            { role: 'system', content: 'You are TechTrend Support, an AI assistant for an e-commerce platform. Help users with orders, products, and support tickets.' },
            ...messages
          ],
          stream: true,
          options: { temperature: 0.7 }
        })
      });

      if (!ollamaResponse.ok) {
        throw new Error(`Ollama API error: ${ollamaResponse.status}`);
      }

      console.log('[OLLAMA_ROUTE] ✅ Direct Ollama call successful');

      // Convert Ollama stream to AI SDK format
      const stream = new ReadableStream({
        async start(controller) {
          const reader = ollamaResponse.body.getReader();
          const decoder = new TextDecoder();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n').filter(line => line.trim());

              for (const line of lines) {
                try {
                  const data = JSON.parse(line);
                  if (data.message && data.message.content) {
                    // Convert to AI SDK format: 0:"content"
                    const aiSdkChunk = `0:"${JSON.stringify(data.message.content)}"\n`;
                    controller.enqueue(new TextEncoder().encode(aiSdkChunk));
                  }
                  if (data.done) {
                    controller.close();
                    return;
                  }
                } catch (parseError) {
                  // Skip invalid JSON lines
                  continue;
                }
              }
            }
            controller.close();
          } catch (error) {
            console.error('[OLLAMA_ROUTE] Stream processing error:', error);
            controller.error(error);
          }
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
    } catch (llmError) {
      console.error('[API_ROUTE_OLLAMA] LLM error:', llmError.message);
      // Return simple error response
      const errorResponse = "I'm having trouble connecting to my language model right now. Please try again in a moment.";
      
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
    console.log('[OLLAMA_ROUTE] 📤 Returning streaming response');
    return result.toDataStreamResponse();
  } catch (error) {
    console.error('[API_ROUTE_OLLAMA] Error:', error.stack);
    return new Response(
      `Error: ${error.message || 'An error occurred during the request.'}`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      }
    );
  }
}