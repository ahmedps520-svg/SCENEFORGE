import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ConfirmProvider, Loading, Toaster } from '@/components/ui';
import { applyTheme, loadSettings, useSettings } from '@/lib/data/settings';
import { CommandPaletteHost } from './CommandPaletteHost';
import { ErrorBoundary } from './ErrorBoundary';
import { WorkspaceLayout } from './WorkspaceLayout';

const Dashboard = lazy(() => import('@/features/dashboard/Dashboard'));
const Onboarding = lazy(() => import('@/features/onboarding/Onboarding'));
const CreateProject = lazy(() => import('@/features/create/CreateProject'));
const ImportScreenplay = lazy(() => import('@/features/create/ImportScreenplay'));
const AppSettings = lazy(() => import('@/features/app-settings/AppSettings'));
const Overview = lazy(() => import('@/features/overview/Overview'));
const ScriptPage = lazy(() => import('@/features/script/ScriptPage'));
const StoryboardPage = lazy(() => import('@/features/storyboard/StoryboardPage'));
const ScenesPage = lazy(() => import('@/features/scenes/ScenesPage'));
const ShotListPage = lazy(() => import('@/features/shots/ShotListPage'));
const OnSetPage = lazy(() => import('@/features/shots/OnSetPage'));
const CharactersPage = lazy(() => import('@/features/characters/CharactersPage'));
const LocationsPage = lazy(() => import('@/features/locations/LocationsPage'));
const CastCrewPage = lazy(() => import('@/features/people/CastCrewPage'));
const SchedulePage = lazy(() => import('@/features/schedule/SchedulePage'));
const CallSheetPage = lazy(() => import('@/features/schedule/CallSheetPage'));
const TasksPage = lazy(() => import('@/features/tasks/TasksPage'));
const AssetsPage = lazy(() => import('@/features/assets/AssetsPage'));
const ProjectSettingsPage = lazy(() => import('@/features/project-settings/ProjectSettingsPage'));
const PresentPage = lazy(() => import('@/features/present/PresentPage'));
const NotFound = lazy(() => import('./NotFound'));

function Page({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function ThemeSync() {
  const settings = useSettings();
  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (settings?.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [settings?.theme]);
  return null;
}

export function App() {
  useEffect(() => {
    void loadSettings();
  }, []);
  return (
    <ErrorBoundary>
      <ConfirmProvider>
        <ThemeSync />
        <HashRouter>
          <Routes>
            <Route path="/" element={<Page><Dashboard /></Page>} />
            <Route path="/welcome" element={<Page><Onboarding /></Page>} />
            <Route path="/new" element={<Page><CreateProject /></Page>} />
            <Route path="/import" element={<Page><ImportScreenplay /></Page>} />
            <Route path="/settings" element={<Page><AppSettings /></Page>} />
            <Route path="/p/:projectId/on-set" element={<Page><OnSetPage /></Page>} />
            <Route path="/p/:projectId/present/:kind" element={<Page><PresentPage /></Page>} />
            <Route path="/p/:projectId" element={<WorkspaceLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<Page><Overview /></Page>} />
              <Route path="script" element={<Page><ScriptPage /></Page>} />
              <Route path="storyboard" element={<Page><StoryboardPage /></Page>} />
              <Route path="scenes" element={<Page><ScenesPage /></Page>} />
              <Route path="shots" element={<Page><ShotListPage /></Page>} />
              <Route path="characters" element={<Page><CharactersPage /></Page>} />
              <Route path="locations" element={<Page><LocationsPage /></Page>} />
              <Route path="people" element={<Page><CastCrewPage /></Page>} />
              <Route path="schedule" element={<Page><SchedulePage /></Page>} />
              <Route path="schedule/call-sheet/:eventId" element={<Page><CallSheetPage /></Page>} />
              <Route path="tasks" element={<Page><TasksPage /></Page>} />
              <Route path="assets" element={<Page><AssetsPage /></Page>} />
              <Route path="settings" element={<Page><ProjectSettingsPage /></Page>} />
              <Route path="*" element={<Page><NotFound /></Page>} />
            </Route>
            <Route path="*" element={<Page><NotFound /></Page>} />
          </Routes>
          <CommandPaletteHost />
        </HashRouter>
        <Toaster />
      </ConfirmProvider>
    </ErrorBoundary>
  );
}
