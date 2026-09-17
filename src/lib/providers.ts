export type ProviderId = 'openai' | 'anthropic' | 'nvidia' | 'openrouter' | 'omeroute' | 'google' | 'mistral' | 'groq' | 'together' | 'perplexity' | 'cohere';

export interface Provider {
  id: ProviderId;
  name: string;
  icon: string;
  color: string;
  models: { id: string; name: string; context: string; starred?: boolean }[];
  baseUrl: string;
  keyPlaceholder: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: 'openai', name: 'OpenAI', icon: '◐', color: '#10a37f',
    baseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'gpt-5', name: 'GPT-5', context: '400K', starred: true },
      { id: 'gpt-4o', name: 'GPT-4o', context: '128K' },
      { id: 'o3-mini', name: 'o3-mini', context: '200K' },
    ]
  },
  {
    id: 'anthropic', name: 'Anthropic', icon: '✦', color: '#d4a574',
    baseUrl: 'https://api.anthropic.com',
    keyPlaceholder: 'sk-ant-...',
    models: [
      { id: 'claude-4-opus', name: 'Claude 4 Opus', context: '200K', starred: true },
      { id: 'claude-4-sonnet', name: 'Claude 4 Sonnet', context: '200K', starred: true },
      { id: 'claude-3.5-haiku', name: 'Claude 3.5 Haiku', context: '200K' },
    ]
  },
  {
    id: 'nvidia', name: 'NVIDIA NIM', icon: '⬢', color: '#76b900',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyPlaceholder: 'nvapi-...',
    models: [
      { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', context: '128K', starred: true },
      { id: 'mistralai/mixtral-8x22b-instruct', name: 'Mixtral 8x22B', context: '64K' },
      { id: 'nvidia/nemotron-4-340b', name: 'Nemotron 4 340B', context: '128K' },
    ]
  },
  {
    id: 'openrouter', name: 'OpenRouter', icon: '⬡', color: '#6467f2',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-v1-...',
    models: [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude via OR', context: '200K' },
      { id: 'openai/gpt-4o', name: 'GPT-4o via OR', context: '128K' },
      { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', context: '1M', starred: true },
      { id: 'deepseek/deepseek-v3', name: 'DeepSeek V3', context: '128K' },
    ]
  },
  {
    id: 'omeroute', name: 'OmeRoute', icon: '⬔', color: '#ff6b35',
    baseUrl: 'https://api.omeroute.ai/v1',
    keyPlaceholder: 'ome-...',
    models: [
      { id: 'omeroute/auto', name: 'OmeRoute Auto', context: '200K', starred: true },
      { id: 'omeroute/gpt-5-router', name: 'GPT-5 Router', context: '400K' },
      { id: 'omeroute/claude-router', name: 'Claude Router', context: '200K' },
    ]
  },
  {
    id: 'google', name: 'Google', icon: 'G', color: '#4285f4',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    keyPlaceholder: 'AIza...',
    models: [
      { id: 'gemini-2.0-pro', name: 'Gemini 2.0 Pro', context: '2M', starred: true },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', context: '1M' },
    ]
  },
  {
    id: 'groq', name: 'Groq', icon: '⚡', color: '#f55036',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyPlaceholder: 'gsk_...',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', context: '128K', starred: true },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', context: '32K' },
    ]
  },
  {
    id: 'mistral', name: 'Mistral', icon: 'M', color: '#ff7000',
    baseUrl: 'https://api.mistral.ai/v1',
    keyPlaceholder: '...',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', context: '128K', starred: true },
      { id: 'codestral-latest', name: 'Codestral', context: '32K' },
    ]
  },
  {
    id: 'together', name: 'Together AI', icon: '◎', color: '#000000',
    baseUrl: 'https://api.together.xyz/v1',
    keyPlaceholder: '...',
    models: [
      { id: 'meta-llama/Llama-3-70b-chat-hf', name: 'Llama 3 70B', context: '8K' },
    ]
  },
  {
    id: 'perplexity', name: 'Perplexity', icon: 'P', color: '#1fb6ff',
    baseUrl: 'https://api.perplexity.ai',
    keyPlaceholder: 'pplx-...',
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro', context: '200K', starred: true },
    ]
  },
  {
    id: 'cohere', name: 'Cohere', icon: 'C', color: '#39594e',
    baseUrl: 'https://api.cohere.ai/v1',
    keyPlaceholder: '...',
    models: [
      { id: 'command-r-plus', name: 'Command R+', context: '128K' },
    ]
  },
];

export const getProvider = (id: ProviderId) => PROVIDERS.find(p => p.id === id);
