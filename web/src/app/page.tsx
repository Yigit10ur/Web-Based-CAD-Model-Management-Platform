import { ModelWorkspace } from '@/components/viewer/ModelWorkspace';

export default function Home() {
  return (
    <main className="flex h-dvh flex-col bg-slate-50">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <h1 className="text-sm font-medium text-slate-900">CAD Model Viewer</h1>
        <span className="text-xs text-slate-500">assembly.step — converter sample</span>
      </header>
      <ModelWorkspace />
    </main>
  );
}
