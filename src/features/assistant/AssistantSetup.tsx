import { ArrowLeft, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { Button, Field, Input, Select, Switch, toast, useConfirm } from '@/components/ui';
import { AI_MODELS } from '@/lib/constants';
import { createClient, describeError } from '@/lib/ai/client';
import { updateSettings } from '@/lib/data/settings';
import type { AppSettings } from '@/lib/types';

function maskKey(k: string) {
  if (k.length < 12) return '••••••••';
  return `${k.slice(0, 7)}…${k.slice(-4)}`;
}

/**
 * Configure the optional assistant. Checking a key lists the available
 * models (GET /v1/models), which costs nothing.
 */
export function AssistantSetup({ settings, onDone }: { settings: AppSettings; onDone?: () => void }) {
  const confirm = useConfirm();
  const configured = !!settings.ai.apiKey;
  const [key, setKey] = useState('');
  const [model, setModel] = useState(settings.ai.model || AI_MODELS[0].value);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const candidate = key.trim();
  const looksWrong = candidate && !candidate.startsWith('sk-ant-');

  const verify = async (k: string) => {
    setChecking(true);
    setCheck(null);
    try {
      const page = await createClient(k).models.list({ limit: 50 });
      const ids = page.data.map((m) => m.id);
      const hasModel = ids.includes(model);
      setCheck({ ok: true, message: hasModel || !ids.length ? 'Key works.' : `Key works, but ${model} isn’t listed for it. Choose another model.` });
      return true;
    } catch (e) {
      const msg = e instanceof Anthropic.AuthenticationError ? 'This key was rejected by Anthropic.' : describeError(e).message;
      setCheck({ ok: false, message: msg });
      return false;
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    if (!configured && !candidate) {
      setError('Paste your Anthropic API key to turn on the assistant.');
      return;
    }
    setError(null);
    await updateSettings({ ai: { enabled: true, apiKey: candidate || settings.ai.apiKey, model } });
    toast('Assistant ready');
    setKey('');
    onDone?.();
  };

  return (
    <div className="space-y-5">
      {configured && onDone && (
        <button onClick={onDone} className="flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft className="size-3.5" /> Back to conversation
        </button>
      )}
      {!configured && (
        <div className="space-y-3">
          <div className="eyebrow">Optional</div>
          <h3 className="display text-[26px] text-ink">A collaborator that knows your film</h3>
          <p className="text-[13px] leading-relaxed text-muted">
            The assistant reads this project — script, scenes, characters, shots and schedule — to brainstorm, review continuity, improve dialogue and draft shot lists or schedules. Anything it suggests arrives as a card you can apply or dismiss; it never changes your project on its own.
          </p>
          <p className="text-[13px] leading-relaxed text-muted">Everything else in SCENEFORGE works without it.</p>
        </div>
      )}

      <div className="space-y-4 rounded-md border border-line bg-surface p-4">
        <Field
          label={configured ? 'Replace API key' : 'Anthropic API key'}
          hint={looksWrong ? 'Anthropic keys usually start with “sk-ant-”.' : configured ? `Current key: ${maskKey(settings.ai.apiKey)}` : 'Create one at console.anthropic.com → API keys.'}
          error={error}
        >
          <div className="flex gap-2">
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setCheck(null);
                setError(null);
              }}
            />
            <Button variant="secondary" disabled={!(candidate || settings.ai.apiKey) || checking} onClick={() => void verify(candidate || settings.ai.apiKey)} icon={checking ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}>
              Check
            </Button>
          </div>
        </Field>
        {check && <p className={check.ok ? 'text-[12px] text-success' : 'text-[12px] text-danger'}>{check.message}</p>}
        <Field label="Model" hint={AI_MODELS.find((m) => m.value === model)?.hint}>
          <Select value={model} onChange={(e) => setModel(e.target.value)}>
            {AI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" className="w-full" onClick={() => void save()}>
          {configured ? 'Save' : 'Turn on assistant'}
        </Button>
      </div>

      <div className="flex gap-2.5 text-[12px] leading-relaxed text-faint">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" />
        <p>
          Your key is stored only in this browser’s local database and is sent only to api.anthropic.com. When you ask a question, the relevant project details are sent to Anthropic to generate the reply. Usage is billed to your Anthropic account.
        </p>
      </div>

      {configured && (
        <div className="space-y-3 border-t border-line pt-4">
          <Switch
            checked={settings.ai.enabled}
            onChange={(v) => void updateSettings({ ai: { ...settings.ai, enabled: v } })}
            label="Assistant enabled"
            description="Turn off to hide the assistant without removing your key."
          />
          <Button
            variant="danger-ghost"
            size="sm"
            onClick={async () => {
              const ok = await confirm({ title: 'Remove API key?', message: 'The assistant will be turned off. Your conversations stay saved.', confirmLabel: 'Remove key', danger: true });
              if (!ok) return;
              await updateSettings({ ai: { enabled: false, apiKey: '', model: settings.ai.model } });
              toast('API key removed');
            }}
          >
            Remove API key
          </Button>
        </div>
      )}
    </div>
  );
}
