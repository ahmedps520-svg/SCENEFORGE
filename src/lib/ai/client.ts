import Anthropic from '@anthropic-ai/sdk';
import { uid } from '../ids';
import type { Proposal } from '../types';
import { resolveProposal } from './apply';
import { focusContext, loadSnapshot, projectContext, runReadTool } from './context';
import { SYSTEM_PROMPT } from './prompts';
import { isToolName, PROPOSAL_TOOLS, READ_TOOLS, TOOL_ACTIVITY, toolDefinitions, validateToolInput } from './tools';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);
const MAX_ITERATIONS = 10;

export interface TurnCallbacks {
  /** Streamed assistant text. */
  onText: (delta: string) => void;
  /** A new suggestion card. */
  onProposal: (p: Proposal) => void;
  /** Short status while the assistant reads project data. */
  onActivity?: (label: string | null) => void;
}

export interface TurnResult {
  /** Full API history including this turn (only valid when `complete`). */
  apiMessages: MessageParam[];
  text: string;
  proposals: Proposal[];
  /** False when the turn was stopped or failed part-way. */
  complete: boolean;
  notice?: string;
}

class TruncatedToolInput extends Error {}

/** Content blocks as plain JSON (drops SDK-internal helper fields before storing). */
function plainContent(content: Anthropic.Beta.BetaContentBlock[]): Anthropic.Beta.BetaContentBlockParam[] {
  return JSON.parse(JSON.stringify(content)).map((b: Record<string, unknown>) => {
    delete b.parsed_output;
    return b;
  });
}

export function createClient(apiKey: string): Anthropic {
  // The key belongs to the user and stays in their browser; requests go straight to api.anthropic.com.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

/**
 * Run one user turn: stream the reply, execute read-only tools locally, turn
 * propose_* calls into suggestion cards (never applied here), and loop until
 * the model finishes.
 */
export async function runAssistantTurn(opts: {
  apiKey: string;
  model: string;
  projectId: string;
  history: MessageParam[];
  userText: string;
  focus?: { type: 'scene' | 'character'; id: string };
  signal: AbortSignal;
  callbacks: TurnCallbacks;
}): Promise<TurnResult> {
  const { callbacks } = opts;
  const client = createClient(opts.apiKey);
  const snapshot = await loadSnapshot(opts.projectId);
  const focusText = opts.focus ? focusContext(snapshot, opts.focus) : null;

  const userContent = focusText ? `${focusText}\n\n${opts.userText}` : opts.userText;
  const messages: MessageParam[] = [...opts.history, { role: 'user', content: userContent }];
  const proposals: Proposal[] = [];
  let text = '';
  let jsonRetries = 0;
  const tools = toolDefinitions();
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: projectContext(snapshot) },
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (opts.signal.aborted) return { apiMessages: messages, text, proposals, complete: false, notice: 'Stopped.' };
    const useFallback = FALLBACK_MODELS.has(opts.model);
    const stream = client.beta.messages.stream(
      {
        model: opts.model,
        max_tokens: 16000,
        system,
        messages,
        tools,
        tool_choice: { type: 'auto' },
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { signal: opts.signal },
    );
    if (text && iteration > 0) {
      // Separate prose written before and after tool calls.
      stream.once('text', () => {
        if (!text.endsWith('\n\n')) {
          callbacks.onText('\n\n');
          text += '\n\n';
        }
      });
    }
    stream.on('text', (delta) => {
      text += delta;
      callbacks.onText(delta);
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (err instanceof Anthropic.APIUserAbortError || opts.signal.aborted) {
        return { apiMessages: messages, text, proposals, complete: false, notice: 'Stopped.' };
      }
      // A tool input that couldn't be parsed at all: re-issue the turn (bounded).
      if (!(err instanceof Anthropic.APIError) && err instanceof Error && /JSON/i.test(err.message) && jsonRetries++ < 2) continue;
      throw err;
    }
    callbacks.onActivity?.(null);

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');

    if (message.stop_reason === 'refusal') {
      messages.push({ role: 'assistant', content: plainContent(message.content) });
      return { apiMessages: messages, text, proposals, complete: true, notice: 'The model declined to continue with this request.' };
    }
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: plainContent(message.content) });
      continue;
    }
    if (message.stop_reason === 'max_tokens' && toolUses.length) {
      // Never act on a tool input that may have been cut off.
      throw new TruncatedToolInput('The reply was too long and got cut off before a suggestion was complete. Try asking for a smaller piece (for example one scene at a time).');
    }

    messages.push({ role: 'assistant', content: plainContent(message.content) });
    if (!toolUses.length || message.stop_reason !== 'tool_use') {
      return {
        apiMessages: messages,
        text,
        proposals,
        complete: true,
        notice: message.stop_reason === 'max_tokens' ? 'The reply reached its length limit.' : undefined,
      };
    }

    const results: ToolResult[] = [];
    // Fresh data for reads, so the assistant sees anything applied mid-conversation.
    const live = await loadSnapshot(opts.projectId);
    for (const use of toolUses) {
      if (!isToolName(use.name)) {
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Unknown tool ${use.name}.` });
        continue;
      }
      const v = validateToolInput(use.name, use.input);
      if (!v.ok) {
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: `INVALID input: ${v.error}. Fix the input and call the tool again.` });
        continue;
      }
      if (READ_TOOLS.includes(use.name)) {
        const label = TOOL_ACTIVITY[use.name];
        const n = (v.value as { scene_number?: number }).scene_number;
        callbacks.onActivity?.(label ? `${label}${n ? ` ${n}` : ''}…` : 'Reading project…');
        const r = runReadTool(live, use.name, v.value as Record<string, unknown>);
        results.push({ type: 'tool_result', tool_use_id: use.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
        continue;
      }
      if (PROPOSAL_TOOLS.includes(use.name)) {
        const resolved = resolveProposal(live, use.name, v.value);
        if (!resolved.ok) {
          results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: resolved.error });
          continue;
        }
        const proposal: Proposal = { id: uid(), kind: use.name, input: resolved.payload, status: 'pending', textOffset: text.length };
        proposals.push(proposal);
        callbacks.onProposal(proposal);
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: `Shown to the user as suggestion #${proposals.length}. It has NOT been applied — the user decides whether to apply it. Do not claim it was applied.`,
        });
      }
    }
    callbacks.onActivity?.(null);
    messages.push({ role: 'user', content: results });
  }
  return { apiMessages: messages, text, proposals, complete: true, notice: 'Stopped after many tool calls. Ask a follow-up to continue.' };
}

/** A plain-language explanation for a failed request. */
export function describeError(err: unknown): { message: string; retryable: boolean } {
  if (err instanceof TruncatedToolInput) return { message: err.message, retryable: true };
  if (err instanceof Anthropic.AuthenticationError) return { message: 'Your Anthropic API key was rejected. Check or replace it in the assistant settings.', retryable: false };
  if (err instanceof Anthropic.PermissionDeniedError) return { message: 'This API key doesn’t have permission to use the selected model.', retryable: false };
  if (err instanceof Anthropic.NotFoundError) return { message: 'The selected model isn’t available for this API key. Choose another model in the assistant settings.', retryable: false };
  if (err instanceof Anthropic.RateLimitError) return { message: 'Anthropic is rate-limiting this key. Wait a moment, then retry.', retryable: true };
  if (err instanceof Anthropic.BadRequestError) {
    const m = err.message || '';
    if (/credit|billing|balance/i.test(m)) return { message: 'Your Anthropic account has no remaining credit. Add credit in the Anthropic Console, then retry.', retryable: false };
    return { message: `Anthropic rejected the request: ${m}`, retryable: false };
  }
  if (err instanceof Anthropic.APIConnectionError) return { message: 'Couldn’t reach Anthropic. Check your internet connection and retry.', retryable: true };
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529 || err.status === 503) return { message: 'Anthropic is overloaded right now. Try again in a minute.', retryable: true };
    if ((err.status ?? 0) >= 500) return { message: 'Anthropic had a server error. Retry in a moment.', retryable: true };
    return { message: err.message, retryable: true };
  }
  return { message: err instanceof Error ? err.message : String(err), retryable: true };
}
