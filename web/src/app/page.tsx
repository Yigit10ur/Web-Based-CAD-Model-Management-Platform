import { Viewer } from '@/components/viewer/Viewer';

export default function Home() {
  return (
    <main className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h1 className="text-sm font-medium text-slate-900">
          CAD Model Viewer
        </h1>
        <span className="text-xs text-slate-500">
          placeholder geometry — converter not wired up yet
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <Viewer />
      </div>
    </main>
  );
}
