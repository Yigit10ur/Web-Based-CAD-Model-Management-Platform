'use client';

import { useState } from 'react';

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

type Row = { kind: 'one'; node: TreeNode } | { kind: 'repeat'; name: string; nodes: TreeNode[] };

/**
 * Collapse siblings that are the same part used more than once.
 *
 * A fastener appearing twenty-four times is twenty-four rows that cannot be
 * told apart, and they push everything else off the screen. Grouped, the tree
 * shows what the assembly is made of; the instances are still there, one
 * expansion away, because hiding a single screw is a real thing to want.
 *
 * Order is preserved: the group takes the position of the first instance.
 */
function toRows(children: TreeNode[]): Row[] {
  const byName = new Map<string, TreeNode[]>();
  for (const child of children) {
    byName.set(child.name, [...(byName.get(child.name) ?? []), child]);
  }

  const emitted = new Set<string>();
  const rows: Row[] = [];

  for (const child of children) {
    if (emitted.has(child.name)) continue;
    emitted.add(child.name);

    const siblings = byName.get(child.name) ?? [child];
    rows.push(
      siblings.length > 1
        ? { kind: 'repeat', name: child.name, nodes: siblings }
        : { kind: 'one', node: child },
    );
  }

  return rows;
}

function Checkbox({
  parts,
  label,
  title,
}: {
  parts: string[];
  label: string;
  title: string;
}) {
  const hiddenCount = useViewerStore(
    (state) => parts.filter((id) => state.hidden.has(id)).length,
  );
  const setVisibility = useViewerStore((state) => state.setVisibility);

  return (
    <input
      type="checkbox"
      checked={hiddenCount === 0}
      ref={(element) => {
        // Neither on nor off when only some of the parts are hidden. Rounding
        // to whichever is closer would throw the distinction away.
        if (element) element.indeterminate = hiddenCount > 0 && hiddenCount < parts.length;
      }}
      onChange={(event) => setVisibility(parts, event.target.checked)}
      className="size-3.5 shrink-0 accent-blue-600"
      aria-label={label}
      title={title}
    />
  );
}

function Rows({
  nodes,
  allPartIds,
  depth,
}: {
  nodes: TreeNode[];
  allPartIds: string[];
  depth: number;
}) {
  return (
    <ul>
      {toRows(nodes).map((row) =>
        row.kind === 'one' ? (
          <Node key={row.node.id} node={row.node} allPartIds={allPartIds} depth={depth} />
        ) : (
          <RepeatGroup
            key={row.nodes[0].id}
            name={row.name}
            nodes={row.nodes}
            allPartIds={allPartIds}
            depth={depth}
          />
        ),
      )}
    </ul>
  );
}

function RepeatGroup({
  name,
  nodes,
  allPartIds,
  depth,
}: {
  name: string;
  nodes: TreeNode[];
  allPartIds: string[];
  depth: number;
}) {
  // Collapsed to start: the point of grouping is that the assembly fits on
  // screen without them.
  const [open, setOpen] = useState(false);
  const parts = nodes.flatMap(partsUnder);

  return (
    <li>
      <div
        className="group flex items-center gap-1.5 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-100"
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <Checkbox
          parts={parts}
          label={`Show all ${nodes.length} of ${name}`}
          title={`Show all ${nodes.length}`}
        />

        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() => setOpen(!open)}
          title={name}
        >
          <span className="w-2 shrink-0 text-[10px] text-slate-400">{open ? '▾' : '▸'}</span>
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <span className="shrink-0 pr-1 text-xs text-slate-400">× {nodes.length}</span>
        </button>
      </div>

      {open && (
        <ul>
          {nodes.map((node, index) => (
            <Node
              key={node.id}
              node={node}
              allPartIds={allPartIds}
              depth={depth + 1}
              // The instances are identical by name, so the only honest label
              // is which one it is.
              displayName={`#${index + 1}`}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function Node({
  node,
  allPartIds,
  depth,
  displayName,
}: {
  node: TreeNode;
  allPartIds: string[];
  depth: number;
  displayName?: string;
}) {
  const parts = partsUnder(node);

  const anyHidden = useViewerStore((state) => parts.some((id) => state.hidden.has(id)));
  const isSelected = useViewerStore((state) => state.selected === node.id);
  const select = useViewerStore((state) => state.select);
  const isolate = useViewerStore((state) => state.isolate);

  const isLeaf = node.children.length === 0;
  const label = displayName ?? node.name;

  return (
    <li>
      <div
        className={`group flex items-center gap-1.5 rounded px-1.5 py-1 text-sm ${
          isSelected ? 'bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-100'
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <Checkbox
          parts={parts}
          label={`Show ${node.name}`}
          title={isLeaf ? 'Show this part' : 'Show every part in this assembly'}
        />

        <button
          type="button"
          className={`min-w-0 flex-1 truncate text-left ${anyHidden ? 'text-slate-400' : ''}`}
          onClick={() => select(isLeaf ? node.id : null)}
          disabled={!isLeaf}
          title={node.name}
        >
          {label}
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

      {!isLeaf && <Rows nodes={node.children} allPartIds={allPartIds} depth={depth + 1} />}
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

      <div className="flex-1 overflow-y-auto py-1">
        <Rows nodes={metadata.tree} allPartIds={allPartIds} depth={0} />
      </div>
    </aside>
  );
}
