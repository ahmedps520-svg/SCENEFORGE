import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { resolveTheme, updateSettings, useSettings } from '@/lib/data/settings';

export function ThemeToggle() {
  const settings = useSettings();
  const current = settings ? resolveTheme(settings.theme) : 'dark';
  return (
    <IconButton
      label={current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => void updateSettings({ theme: current === 'dark' ? 'light' : 'dark' })}
    >
      {current === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </IconButton>
  );
}
