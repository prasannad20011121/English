import { env } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  temperature: number;
  maxTokens?: number;
  /** Ask the model to reply with a JSON object. */
  json?: boolean;
}

export interface LlmClient {
  readonly model: string;
  complete(messages: ChatMessage[], options: CompleteOptions): Promise<string>;
}

/** Works with any OpenAI-compatible chat API (Groq, Gemini, Ollama, OpenRouter, ...). */
export class OpenAiCompatibleClient implements LlmClient {
  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly apiKey?: string,
    private readonly timeoutMs = 90_000,
  ) {}

  async complete(messages: ChatMessage[], options: CompleteOptions): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options.temperature,
          max_tokens: options.maxTokens ?? 4000,
          ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      throw new AppError(
        502,
        'LLM_UNREACHABLE',
        timedOut
          ? 'The AI service took too long to answer. Try fewer questions.'
          : 'Could not reach the AI service. Check LLM_BASE_URL and the network.',
      );
    }

    if (res.status === 429) {
      throw new AppError(
        429,
        'LLM_RATE_LIMITED',
        'The free AI quota is used up for now. Wait a minute and try again.',
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new AppError(502, 'LLM_AUTH', 'The AI service rejected the API key (LLM_API_KEY).');
    }
    if (!res.ok) {
      throw new AppError(
        502,
        'LLM_ERROR',
        `The AI service returned an error (HTTP ${res.status}).`,
      );
    }

    const data = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new AppError(502, 'LLM_EMPTY', 'The AI service sent an empty answer. Try again.');
    }
    return content;
  }
}

let client: LlmClient | null | undefined;

/** The configured AI client, or null when LLM_BASE_URL / LLM_MODEL are not set. */
export function getLlm(): LlmClient | null {
  if (client === undefined) {
    client =
      env.LLM_BASE_URL && env.LLM_MODEL
        ? new OpenAiCompatibleClient(env.LLM_BASE_URL, env.LLM_MODEL, env.LLM_API_KEY)
        : null;
  }
  return client;
}

/** Replace the client (tests). Pass undefined to go back to the environment settings. */
export function setLlmClient(next: LlmClient | null | undefined): void {
  client = next;
}

/** Parses a JSON object from a model reply, tolerating code fences and text around it. */
export function parseJsonReply(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in the reply');
  return JSON.parse(unfenced.slice(start, end + 1));
}
