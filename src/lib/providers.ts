export type ProviderId = 'openai' | 'anthropic' | 'nvidia' | 'openrouter' | 'omeroute' | 'google' | 'mistral' | 'agentrouter' | 'together' | 'perplexity' | 'cohere' | 'atria';

export interface ProviderModel {
  id: string;
  name: string;
  context?: string;
  starred?: boolean;
  // generation capabilities — lets the chat route dispatch to the real
  // image/video generation pipeline instead of asking the LLM to describe.
  image?: boolean;
  video?: boolean;
  // reasoning-capable models — support thinking budgets / effort levels
  reasoning?: boolean;
}

export interface ModelCapabilities {
  image: boolean;
  video: boolean;
}

const CAPABLE_MODELS_RE: Record<keyof ModelCapabilities, RegExp> = {
  image: /(dall-e|gpt-image|flux|sdxl|stable-diffusion|imagen|image|schnell|turbo|playground)/i,
  video: /(sora|veo|kling|pika|luma|runway|wan|video)/i,
};

// Sniffs a provider/model pair for generation capabilities. `dynamic` is the
// live model list fetched from the provider vault (takes precedence over the
// static curated entry when both are present).
export function modelCapabilities(provider: ProviderId, model: string, dynamic?: ProviderModel[]): ModelCapabilities {
  const fromList = dynamic?.find(m => m.id === model) ?? PROVIDERS.find(p => p.id === provider)?.models.find(m => m.id === model);
  if (fromList && (fromList.image !== undefined || fromList.video !== undefined)) {
    return { image: !!fromList.image, video: !!fromList.video };
  }
  return {
    image: CAPABLE_MODELS_RE.image.test(model),
    video: CAPABLE_MODELS_RE.video.test(model),
  };
}

export interface Provider {
  id: ProviderId;
  name: string;
  icon: string;
  color: string;
  models: ProviderModel[];
  baseUrl: string;
  keyPlaceholder: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: 'openai', name: 'OpenAI', icon: '◐', color: '#10a37f',
    baseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'gpt-5', name: 'GPT-5', context: '400K', starred: true, reasoning: true },
      { id: 'gpt-5-thinking', name: 'GPT-5 Thinking', context: '400K', reasoning: true, starred: true },
      { id: 'o3', name: 'o3 (deep reasoning)', context: '200K', reasoning: true },
      { id: 'o3-mini', name: 'o3-mini', context: '200K', reasoning: true },
      { id: 'gpt-4o', name: 'GPT-4o', context: '128K' },
      { id: 'gpt-image-1', name: 'GPT Image 1', context: '-', image: true },
      { id: 'dall-e-3', name: 'DALL-E 3', context: '-', image: true, starred: true },
      { id: 'dall-e-2', name: 'DALL-E 2', context: '-', image: true },
      { id: 'sora-2', name: 'Sora 2', context: '-', video: true, starred: true },
      { id: 'sora-2-pro', name: 'Sora 2 Pro', context: '-', video: true },
    ]
  },
  {
    id: 'anthropic', name: 'Anthropic', icon: '✦', color: '#d4a574',
    baseUrl: 'https://api.anthropic.com',
    keyPlaceholder: 'sk-ant-...',
    models: [
      { id: 'claude-4-opus', name: 'Claude 4 Opus', context: '200K', starred: true, reasoning: true },
      { id: 'claude-4-sonnet', name: 'Claude 4 Sonnet', context: '200K', starred: true, reasoning: true },
      { id: 'claude-3.5-haiku', name: 'Claude 3.5 Haiku', context: '200K' },
    ]
  },
  {
    id: 'nvidia', name: 'NVIDIA NIM', icon: '⬢', color: '#76b900',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyPlaceholder: 'nvapi-...',
    models: [
      { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', context: '128K', starred: true },
      { id: 'nvidia/llama-3.3-nemotron-super-49b-v1', name: 'Nemotron Super 49B', context: '128K', reasoning: true },
      { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1 (reasoning)', context: '128K', reasoning: true, starred: true },
      { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', context: '128K' },
    ]
  },
  {
    id: 'openrouter', name: 'OpenRouter', icon: '⬡', color: '#6467f2',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-v1-...',
    models: [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude via OR', context: '200K', reasoning: true },
      { id: 'openai/gpt-4o', name: 'GPT-4o via OR', context: '128K' },
      { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', context: '1M', starred: true },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (thinking)', context: '1M', reasoning: true, starred: true },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', context: '128K', reasoning: true },
      { id: 'deepseek/deepseek-v3', name: 'DeepSeek V3', context: '128K' },
      { id: 'openai/dall-e-3', name: 'DALL-E 3 via OR', context: '-', image: true, starred: true },
      { id: 'black-forest-labs/flux-schnell', name: 'FLUX Schnell', context: '-', image: true },
      { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro', context: '-', image: true },
    ]
  },
  {
    id: 'omeroute', name: 'OmeRoute', icon: '⬔', color: '#ff6b35',
    baseUrl: 'https://api.omeroute.ai/v1',
    keyPlaceholder: 'ome-...',
    models: [
      { id: 'omeroute/auto', name: 'OmeRoute Auto', context: '200K', starred: true, reasoning: true },
      { id: 'omeroute/gpt-5-router', name: 'GPT-5 Router', context: '400K', reasoning: true },
      { id: 'omeroute/claude-router', name: 'Claude Router', context: '200K', reasoning: true },
    ]
  },
  {
    id: 'google', name: 'Google', icon: 'G', color: '#4285f4',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    keyPlaceholder: 'AIza...',
    models: [
      { id: 'gemini-2.0-pro', name: 'Gemini 2.0 Pro', context: '2M', starred: true, reasoning: true },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', context: '1M' },
      { id: 'gemini-2.5-flash-image', name: 'Gemini Image', context: '130K', image: true, starred: true },
      { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0', context: '-', image: true },
      { id: 'veo-3.0-fast', name: 'Veo 3.0 Fast', context: '-', video: true, starred: true },
      { id: 'veo-3.0-generate-001', name: 'Veo 3.0', context: '-', video: true },
    ]
  },
  {
    id: 'agentrouter', name: 'AgentRouter', icon: '◈', color: '#a855f7',
    baseUrl: 'https://agentrouter.org/v1',
    keyPlaceholder: 'ak-...',
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5', context: '400K', starred: true },
      { id: 'claude-4-opus', name: 'Claude 4 Opus', context: '200K' },
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
      { id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX.1 Schnell', context: '-', image: true, starred: true },
      { id: 'black-forest-labs/FLUX.1-dev', name: 'FLUX.1 Dev', context: '-', image: true },
      { id: 'stabilityai/stable-diffusion-xl-base-1.0', name: 'Stable Diffusion XL', context: '-', image: true },
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
  {
    id: 'atria', name: 'Atria (ASI)', icon: '▲', color: '#f43f5e',
    baseUrl: 'https://api.atria-asi.ai/v1',
    keyPlaceholder: 'atria_...',
    models: [
      { id: 'Atria-Dawn-Preview', name: 'Atria Dawn Preview', context: '128K', starred: true },
    ]
  },
];

export const getProvider = (id: ProviderId) => PROVIDERS.find(p => p.id === id);

// effective model list: models fetched live from the provider via the API key take
// precedence over the static curated list. `dynamic` comes from the vault entry.
export function modelsFor(p: Provider | undefined, dynamic?: ProviderModel[]): ProviderModel[] {
  if (dynamic && dynamic.length) return dynamic;
  return p?.models || [];
}
