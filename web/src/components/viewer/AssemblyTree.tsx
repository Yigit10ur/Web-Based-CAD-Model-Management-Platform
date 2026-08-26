'use client';

import { leafIds, type ModelMetadata, type TreeNode } from '@/lib/metadata';
import { useViewerStore } from '@/store/viewer-store';

/**
 * Every part a node covers.
 *
 * A leaf covers itself; a sub-assembly covers everything under it. Visibility
 * is only ever stored per part, so a group's checkbox is a view of its
 * children rather than a state of its own -- there is nothing to keep in sync
 * because there is nothing duplicated.
 */
function partsUnder(node: TreeNode): string[] {
  return node.children.length === 0 ? [node.id] : node.children.flatMap(partsUnder);
}

function Node({ node, allPartIds, depth }: { node: TreeNode; allPartIds: string[]; depth: number }) {
  const parts = partsUnder(node);

  const hiddenCount = useViewerStore(
    (state) => parts.filter((id) => state.hidden.has(id)).length,
  );
  const isSelected = useViewerStore((state) => state.selected === node.id);
  const select = useViewerStore((state) => state.select);
  const setVisibility = useViewerStore((state) => state.setVisibility);
  const isolate = useViewerStore((state) => state.isolate);

  const isLeaf = node.children.length === 0;
  const visible = hiddenCount === 0;
  // A sub-assembly with some of its parts hidden is neither on nor off, and
  // saying so is more useful than rounding to whichever is closer.
  const partly = hiddenCount > 0 && hiddenCount < parts.length;

  return (
    <li>
      <div
        className={`group flex items-center gap-1.5 rounded px-1.5 py-1 text-sm ${
          isSelected ? 'bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-100'
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <input
          type="checkbox"
          checked={visible}
          ref={(element) => {
            if (element) element.indeterminate = partly;
          }}
          onChange={(event) => setVisibility(parts, event.target.checked)}
          className="size-3.5 shrink-0 accent-blue-600"
          aria-label={`Show ${node.name}`}
          title={isLeaf ? 'Show this part' : 'Show every part in this assembly'}
        />

        <button
          type="button"
          className={`min-w-0 flex-1 truncate text-left ${visible ? '' : 'text-slate-400'}`}
          onClick={() => select(isLeaf ? node.id : null)}
          disabled={!isLeaf}
          title={node.name}
        >
          {node.name}
        </button>

        {isLeaf && (
          <button
            type="button"
            className="shrink-0 rounded px-1 text-xs text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-900"
            onClick={() => isolate(node.id, allPartIds)}
            title="Hide everything else"
          >
            solo
          </button>
        )}
      </div>

      {!isLeaf && (
        <ul>
          {node.children.map((child) => (
            <Node key={child.id} node={child} allPartIds={allPartIds} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function AssemblyTree({ metadata }: { metadata: ModelMetadata }) {
  const showAll = useViewerStore((state) => state.showAll);
  const hiddenCount = useViewerStore((state) => state.hidden.size);
  const allPartIds = leafIds(metadata.tree);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Assembly</h2>
        {hiddenCount > 0 && (
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onClick={showAll}
          >
            show all ({hiddenCount})
          </button>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto py-1">
        {metadata.tree.map((node) => (
          <Node key={node.id} node={node} allPartIds={allPartIds} depth={0} />
        ))}
      </ul>
    </aside>
  );
}
