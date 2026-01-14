'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Loader2,
  RotateCcw,
  X,
  Bot,
  User,
  CheckCircle,
  AlertCircle,
  Clock,
  ChevronDown
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

// Message types
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'streaming' | 'complete' | 'error';
  toolCalls?: ToolCall[];
}

interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'executing' | 'complete' | 'error';
  result?: string;
}

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 11);

// Tool execution status component
function ToolExecutionBadge({ toolCalls }: { toolCalls: ToolCall[] }) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {toolCalls.map((tool) => (
        <div
          key={tool.id}
          className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
        >
          {tool.status === 'pending' && (
            <Clock className="w-3 h-3 animate-pulse" />
          )}
          {tool.status === 'executing' && (
            <Loader2 className="w-3 h-3 animate-spin" />
          )}
          {tool.status === 'complete' && (
            <CheckCircle className="w-3 h-3 text-green-500" />
          )}
          {tool.status === 'error' && (
            <AlertCircle className="w-3 h-3 text-red-500" />
          )}
          <span>
            {tool.name}
            {tool.status === 'complete' && ' - Done'}
            {tool.status === 'error' && ' - Failed'}
          </span>
        </div>
      ))}
    </div>
  );
}

// Message bubble component
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}
      <div className={`max-w-[75%]`}>
        <div
          className={`px-4 py-2.5 rounded-2xl ${
            isUser
              ? 'bg-blue-600 text-white rounded-br-md'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md'
          }`}
        >
          {message.role === 'user' ? (
            <p className="text-sm">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={{
                  h1: ({ node, ...props }) => (
                    <h1 className="text-lg font-bold mt-3 mb-2" {...props} />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2 className="text-base font-semibold mt-2 mb-1" {...props} />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 className="text-sm font-semibold mt-2 mb-1" {...props} />
                  ),
                  p: ({ node, ...props }) => (
                    <p className="mb-2 last:mb-0" {...props} />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />
                  ),
                  li: ({ node, ...props }) => <li {...props} />,
                  a: ({ node, ...props }) => (
                    <a
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                      {...props}
                    />
                  ),
                  code: ({ node, ...props }) => (
                    <code className="bg-gray-200 dark:bg-gray-600 rounded px-1 py-0.5 text-xs" {...props} />
                  ),
                  pre: ({ node, ...props }) => (
                    <pre className="bg-gray-900 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto text-xs" {...props} />
                  ),
                  table: ({ node, ...props }) => (
                    <table className="border-collapse border border-gray-300 dark:border-gray-600 mb-2 w-full text-xs" {...props} />
                  ),
                  th: ({ node, ...props }) => (
                    <th className="border border-gray-300 dark:border-gray-600 p-2 bg-gray-100 dark:bg-gray-700" {...props} />
                  ),
                  td: ({ node, ...props }) => (
                    <td className="border border-gray-300 dark:border-gray-600 p-2" {...props} />
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        <ToolExecutionBadge toolCalls={message.toolCalls} />
        <div
          className={`text-xs text-gray-400 mt-1 ${
            isUser ? 'text-right' : 'text-left'
          }`}
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
      {isUser && (
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </div>
      )}
    </motion.div>
  );
}

// Loading indicator
function LoadingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3"
    >
      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 rounded-2xl rounded-bl-md">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Processing your request...
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export default function ChatWidget() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Welcome to TechTrend Support! I am here to help you with orders, refunds, products, and any customer inquiries. How can I assist you today?',
      timestamp: new Date(),
      status: 'complete',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);

  // Keep messages ref in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Handle SSE streaming
  const handleStreamingResponse = async (
    userMessage: Message,
    responseId: string
  ) => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let accumulatedContent = '';

    try {
      // Update message status to streaming
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === responseId ? { ...msg, status: 'streaming' } : msg
        )
      );

      // Simulate SSE connection to /api/agent
      // In production, replace with actual SSE endpoint
      const response = await fetch('/api/chat/route-ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesRef.current
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              // Stream complete
              break;
            }
            try {
              // Parse SSE data - handle different response formats
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content ||
                parsed.choices?.[0]?.message?.content ||
                parsed.content ||
                '';

              if (content) {
                accumulatedContent += content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === responseId
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  )
                );
              }
            } catch {
              // Ignore parsing errors for partial chunks
            }
          }
        }
      }

      // Mark as complete
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === responseId ? { ...msg, status: 'complete' } : msg
        )
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was cancelled
        return;
      }
      console.error('SSE error:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === responseId
            ? {
                ...msg,
                content: accumulatedContent || 'Sorry, I encountered an error. Please try again.',
                status: 'error',
              }
            : msg
        )
      );
    } finally {
      abortControllerRef.current = null;
    }
  };

  // Handle message submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;

      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: input.trim(),
        timestamp: new Date(),
        status: 'complete',
      };

      const responseId = generateId();
      const assistantMessage: Message = {
        id: responseId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        status: 'streaming',
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput('');
      setIsLoading(true);

      await handleStreamingResponse(userMessage, responseId);
      setIsLoading(false);
    },
    [input, isLoading]
  );

  // Reset chat
  const resetChat = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([
      {
        id: generateId(),
        role: 'assistant',
        content: 'Welcome to TechTrend Support! I am here to help you with orders, refunds, products, and any customer inquiries. How can I assist you today?',
        timestamp: new Date(),
        status: 'complete',
      },
    ]);
    setIsLoading(false);
  }, []);

  // Cancel current request
  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold">AI Support Agent</h3>
              <p className="text-sm text-white/80">Online - Ready to help</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetChat}
              title="Reset chat"
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              title="Toggle expanded"
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <X className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="h-[400px] overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && <LoadingIndicator />}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-gray-200 dark:border-gray-700 p-4">
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about orders, refunds, products..."
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  disabled={isLoading}
                />
                {isLoading ? (
                  <button
                    type="button"
                    onClick={cancelRequest}
                    className="px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                )}
              </form>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
                Press Enter to send your message
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed View */}
      {!isExpanded && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900">
          <button
            onClick={() => setIsExpanded(true)}
            className="w-full py-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
          >
            Open Chat
          </button>
        </div>
      )}
    </div>
  );
}
