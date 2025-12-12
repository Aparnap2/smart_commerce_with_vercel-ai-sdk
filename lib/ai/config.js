/**
 * LLM Provider Configuration
 * Automatically switches between Ollama (dev) and Google GenAI (prod)
 */

import { google } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { env } from '../env.js';

/**
 * Determine which LLM provider to use based on environment
 * @returns {{provider: 'ollama'|'google', model: any, isDev: boolean}}
 */
export function getLLMConfig() {
  const isDev = env.NODE_ENV === 'development';
  
  if (isDev && env.OLLAMA_BASE_URL) {
    // Use Ollama for development
    console.log('🔧 Using Ollama LLM (Development Mode)');
    
    const ollama = createOllama({
      baseURL: env.OLLAMA_BASE_URL,
    });
    
    return {
      provider: 'ollama',
      model: ollama(env.OLLAMA_MODEL),
      isDev: true,
      modelName: env.OLLAMA_MODEL,
    };
  } else if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
    // Use Google GenAI for production
    console.log('🔧 Using Google GenAI (Production Mode)');
    
    return {
      provider: 'google',
      model: google('models/gemini-2.0-flash-exp'),
      isDev: false,
      modelName: 'gemini-2.0-flash-exp',
    };
  } else {
    throw new Error(
      'No LLM provider configured. ' +
      'Set OLLAMA_BASE_URL for development or GOOGLE_GENERATIVE_AI_API_KEY for production.'
    );
  }
}

/**
 * Get the appropriate LLM model for the current environment
 * @returns {import('ai').LanguageModel}
 */
export function getLLMModel() {
  return getLLMConfig().model;
}

/**
 * Check if we're in development mode
 * @returns {boolean}
 */
export function isDevelopment() {
  return env.NODE_ENV === 'development';
}

/**
 * Get current LLM provider information
 * @returns {{provider: string, modelName: string, isDev: boolean}}
 */
export function getLLMInfo() {
  const config = getLLMConfig();
  return {
    provider: config.provider,
    modelName: config.modelName,
    isDev: config.isDev,
  };
}