import { isFreeModel, type ProviderId } from "./providers";

/**
 * Best-effort chat pricing. Rates are USD per 1M tokens and are intentionally
 * centralised: update this table when provider prices change rather than
 * scattering numbers through the app. Unknown models use a provider-level
 * estimate and are labelled as such so reports never imply exact billing.
 */
export interface ModelPrice {
  input: number;
  output: number;
}

const MODEL_PRICES: Record<string, ModelPrice> = {
  // OpenAI
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "o4-mini": { input: 1.1, output: 4.4 },
  // Anthropic
  "claude-3-5-haiku": { input: 0.8, output: 4 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-7-sonnet": { input: 3, output: 15 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-opus-4": { input: 15, output: 75 },
  // Google
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  // DeepSeek / Mistral (also used via routers)
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  "mistral-small": { input: 0.1, output: 0.3 },
  "mistral-medium": { input: 0.4, output: 2 },
  "mistral-large": { input: 2, output: 6 },
};

const PROVIDER_ESTIMATES: Partial<Record<ProviderId, ModelPrice>> = {
  openai: { input: 2.5, output: 10 },
  anthropic: { input: 3, output: 15 },
  google: { input: 0.3, output: 2.5 },
  mistral: { input: 1, output: 3 },
  openrouter: { input: 1, output: 3 },
  omeroute: { input: 1, output: 3 },
  agentrouter: { input: 1, output: 3 },
  atria: { input: 1, output: 3 },
  nvidia: { input: 0.5, output: 1 },
  together: { input: 0.5, output: 1 },
  perplexity: { input: 1, output: 1 },
  cohere: { input: 1, output: 2 },
};

const FALLBACK: ModelPrice = { input: 1, output: 3 };

export interface CostEstimate {
  costUsd: number;
  source: string;
  rate: ModelPrice;
}

/** Match a catalog id or a routed id such as `openrouter/anthropic/claude-sonnet-4`. */
function matchModelPrice(model: string): ModelPrice | null {
  const id = model.toLowerCase();
  const candidates = Object.entries(MODEL_PRICES)
    .filter(([key]) => id === key || id.endsWith(`/${key}`) || id.includes(`:${key}`))
    .sort((a, b) => b[0].length - a[0].length);
  return candidates.length ? candidates[0][1] : null;
}

export function estimateChatCost(input: {
  provider: ProviderId;
  model: string;
  promptTokens: number;
  completionTokens: number;
}): CostEstimate {
  if (isFreeModel(input.model)) {
    return { costUsd: 0, source: "free-model", rate: { input: 0, output: 0 } };
  }
  const exact = matchModelPrice(input.model);
  const rate = exact ?? PROVIDER_ESTIMATES[input.provider] ?? FALLBACK;
  const costUsd =
    (Math.max(0, input.promptTokens) / 1_000_000) * rate.input +
    (Math.max(0, input.completionTokens) / 1_000_000) * rate.output;
  return {
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    source: exact ? "model-catalog" : `provider-estimate:${input.provider}`,
    rate,
  };
}
