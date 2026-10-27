import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, toastError } from '@/components/ui';
import { db, requestPersistentStorage } from '@/lib/db';
import { updateSettings } from '@/lib/data/settings';

/**
 * Opens the sample film, creating it first if this device doesn't have one.
 * The sample module is loaded on demand; it is optional for the rest of the app.
 */
export function useSampleLauncher() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const launch = async () => {
    setBusy(true);
    try {
      await updateSettings({ onboardingComplete: true });
      const existing = (await db.projects.toArray()).find((p) => p.isSample);
      if (existing) {
        navigate(`/p/${existing.id}/overview`);
        return;
      }
      let create: (() => Promise<{ id: string; title: string }>) | undefined;
      try {
        create = (await import('@/lib/sample/sample')).createSampleProject;
      } catch {
        create = undefined;
      }
      if (!create) throw new Error('The sample film isn’t available in this build.');
      const project = await create();
      void requestPersistentStorage();
      toast(`Opened the sample film “${project.title}”`, { detail: 'It’s clearly marked as sample content and can be removed at any time.' });
      navigate(`/p/${project.id}/overview`);
    } catch (e) {
      toastError(e, 'Couldn’t open the sample film');
    } finally {
      setBusy(false);
    }
  };
  return { launch, busy };
}
