import Anthropic from '@anthropic-ai/sdk';

export type ConnectionResult = { ok: true; model: string } | { ok: false; message: string };

/**
 * Make one tiny request with the user's key to confirm it works with the
 * chosen model. Only ever called when the user presses "Test connection".
 */
export async function testConnection(apiKey: string, model: string): Promise<ConnectionResult> {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: 'Enter an API key first.' };
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 30_000 });
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
    });
    return { ok: true, model: res.model };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, message: 'The API key was rejected. Check that it was copied completely and hasn’t been revoked.' };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, message: 'This key doesn’t have permission to use that model.' };
    if (e instanceof Anthropic.NotFoundError) return { ok: false, message: `The model “${model}” isn’t available to this key. Try another model.` };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, message: 'The key works, but it’s currently rate limited. Try again in a minute.' };
    if (e instanceof Anthropic.BadRequestError) return { ok: false, message: `The request was refused: ${e.message}` };
    if (e instanceof Anthropic.InternalServerError) return { ok: false, message: 'Anthropic’s service had a problem. The key may be fine — try again shortly.' };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, message: 'Couldn’t reach api.anthropic.com. Check your internet connection, VPN or content blockers.' };
    if (e instanceof Anthropic.APIError) return { ok: false, message: `Anthropic API error ${e.status ?? ''}: ${e.message}` };
    return { ok: false, message: e instanceof Error ? e.message : 'Unknown error' };
  }
}
