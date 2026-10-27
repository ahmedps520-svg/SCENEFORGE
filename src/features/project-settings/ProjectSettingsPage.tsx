import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/app/WorkspaceLayout';
import { Loading, PageContainer, PageHeader, Tabs } from '@/components/ui';
import { useSettings } from '@/lib/data/settings';
import { usePeople } from '@/lib/hooks';
import { DetailsSection } from './DetailsSection';
import { ActivitySection, BackupSection, DangerZone, FeatureStatus, SafetySection } from './OtherSections';
import { TeamSection } from './TeamSection';

const TABS = [
  { value: 'details', label: 'Details' },
  { value: 'team', label: 'Team & access' },
  { value: 'safety', label: 'Emergency & safety' },
  { value: 'activity', label: 'Activity' },
  { value: 'backup', label: 'Backup & export' },
  { value: 'about', label: 'Features & danger zone' },
] as const;

type Tab = (typeof TABS)[number]['value'];

export default function ProjectSettingsPage() {
  const { project } = useWorkspace();
  const people = usePeople(project.id);
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : 'details';
  const setTab = (t: Tab) =>
    setParams((p) => {
      p.set('tab', t);
      return p;
    });

  return (
    <PageContainer>
      <PageHeader eyebrow="Project settings" title={project.title} description="Details, team access, safety information, history and backups for this film." />
      <Tabs value={tab} onChange={setTab} tabs={TABS.map((t) => ({ value: t.value, label: t.label }))} className="mb-8" />
      <div className="max-w-4xl">
        {tab === 'details' && <DetailsSection key={project.id} project={project} />}
        {tab === 'team' && (people ? <TeamSection project={project} people={people} /> : <Loading />)}
        {tab === 'safety' && <SafetySection key={project.id} project={project} />}
        {tab === 'activity' && <ActivitySection project={project} />}
        {tab === 'backup' && <BackupSection project={project} />}
        {tab === 'about' && (
          <div className="space-y-10">
            <FeatureStatus aiConfigured={!!settings?.ai.enabled && !!settings.ai.apiKey} />
            <DangerZone project={project} />
          </div>
        )}
      </div>
    </PageContainer>
  );
}
