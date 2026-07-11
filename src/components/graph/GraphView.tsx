"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { NODE_TYPES } from "@/lib/types";
import type { GraphData, GraphNode } from "@/lib/data/graph";

/**
 * Force-directed view of the org's knowledge graph — a native port of
 * graphify's graph.html UX (canvas force layout + search, legend filters,
 * info panel, stats), fed by the app's own RLS-scoped nodes/links instead of
 * graphify's Python pipeline. vis-network is loaded client-side only.
 */

// Node-type colours mirror the design tokens in globals.css (canvas can't read
// CSS variables, so the hexes live here too).
const TYPE_COLOR: Record<string, string> = {
  fact: "#2563eb",
  decision: "#d97706",
  sop: "#16a34a",
  person: "#9333ea",
  client: "#0d9488",
  project: "#db2777",
  meeting: "#6b7280",
  idea: "#ca8a04",
};
const OTHER_COLOR = "#6b7280";
const colorFor = (type: string) => TYPE_COLOR[type] ?? OTHER_COLOR;

// Relation → edge colour (matches the link_rel enum).
const REL_COLOR: Record<string, string> = {
  supports: "#16a34a",
  contradicts: "#dc2626",
  extends: "#2563eb",
  related: "#a1a1aa",
};

type Selected = { id: string; title: string; type: string; degree: number };

/**
 * Centre the view on the graph's bounding-box centre at a scale that fits it
 * with a margin. Replaces network.fit(), which mis-centres on a high-DPR canvas.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function frame(network: any, container: HTMLElement | null) {
  const pos: Record<string, { x: number; y: number }> = network.getPositions();
  const ids = Object.keys(pos);
  if (ids.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const p = pos[id];
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w = container?.clientWidth ?? 1000;
  const h = container?.clientHeight ?? 700;
  const spanX = maxX - minX + 160; // padding for node radius + labels
  const spanY = maxY - minY + 160;
  const scale = Math.min(1.1, Math.min(w / spanX, h / spanY));
  // Instant (no animation): a concurrent physics-off redraw would otherwise
  // interrupt an animated moveTo and leave the view off-centre.
  network.moveTo({
    position: { x: cx, y: cy },
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  });
}

export function GraphView({ data }: { data: GraphData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const networkRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodesDsRef = useRef<any>(null);

  const [selected, setSelected] = useState<Selected | null>(null);
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of data.edges) {
      d.set(e.from, (d.get(e.from) ?? 0) + 1);
      d.set(e.to, (d.get(e.to) ?? 0) + 1);
    }
    return d;
  }, [data.edges]);

  // Types actually present, with counts, for the legend.
  const typeCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const n of data.nodes) c.set(n.type, (c.get(n.type) ?? 0) + 1);
    const known = NODE_TYPES.filter((t) => c.has(t));
    const extra = [...c.keys()].filter((t) => !NODE_TYPES.includes(t as never)).sort();
    return [...known, ...extra].map((t) => ({ type: t, count: c.get(t) ?? 0 }));
  }, [data.nodes]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return data.nodes
      .filter((n) => n.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, data.nodes]);

  // Build the network once.
  useEffect(() => {
    let disposed = false;
    if (!containerRef.current || data.nodes.length === 0) return;

    (async () => {
      const [{ Network }, { DataSet }] = await Promise.all([
        import("vis-network/standalone"),
        import("vis-data"),
      ]);
      if (disposed || !containerRef.current) return;

      const nodesDs = new DataSet(
        data.nodes.map((n) => ({
          id: n.id,
          label: n.title,
          color: {
            background: colorFor(n.type),
            border: colorFor(n.type),
            highlight: { background: "#ffffff", border: colorFor(n.type) },
          },
          value: (degree.get(n.id) ?? 0) + 1,
          shape: "dot",
        })),
      );
      const edgesDs = new DataSet(
        data.edges.map((e, i) => ({
          id: i,
          from: e.from,
          to: e.to,
          color: { color: REL_COLOR[e.rel] ?? REL_COLOR.related, opacity: 0.5 },
          title: e.rel,
        })),
      );
      nodesDsRef.current = nodesDs;

      const network = new Network(
        containerRef.current,
        { nodes: nodesDs, edges: edgesDs },
        {
          nodes: {
            scaling: { min: 6, max: 26, label: { enabled: true, min: 10, max: 22 } },
            font: { color: "#a1a1aa", size: 12, face: "Inter, system-ui, sans-serif" },
            borderWidth: 1.5,
          },
          edges: {
            smooth: { enabled: true, type: "continuous", roundness: 0.4 },
            width: 0.6,
          },
          physics: {
            solver: "forceAtlas2Based",
            forceAtlas2Based: { gravitationalConstant: -45, springLength: 90, springConstant: 0.05 },
            stabilization: { iterations: 180 },
          },
          interaction: { hover: true, tooltipDelay: 120, navigationButtons: false },
        },
      );
      networkRef.current = network;

      network.on("click", (params: { nodes: string[] }) => {
        const id = params.nodes?.[0];
        if (!id) {
          setSelected(null);
          return;
        }
        const n = byId.get(id);
        if (n) setSelected({ id, title: n.title, type: n.type, degree: degree.get(id) ?? 0 });
      });
      const settle = () => {
        // Freeze the layout so it stays framed (drag still works), then frame it.
        // network.fit() mis-centers under a 2× DPR canvas, so centre manually on
        // the node bounding-box centre. Defer a frame so the physics-off redraw
        // has applied before we move the view, else it clobbers the position.
        network.setOptions({ physics: false });
        requestAnimationFrame(() => {
          frame(network, containerRef.current);
          setReady(true);
        });
      };
      let framed = false;
      const once = () => {
        if (framed) return;
        framed = true;
        settle();
      };
      network.once("stabilizationIterationsDone", once);
      // Fallback: small graphs can settle before the listener attaches, so frame
      // anyway shortly after creation.
      setTimeout(once, 1200);
    })();

    return () => {
      disposed = true;
      networkRef.current?.destroy?.();
      networkRef.current = null;
    };
  }, [data, byId, degree]);

  // Apply legend filters by toggling node visibility.
  useEffect(() => {
    const ds = nodesDsRef.current;
    if (!ds) return;
    ds.update(
      data.nodes.map((n) => ({ id: n.id, hidden: hidden.has(n.type) })),
    );
  }, [hidden, data.nodes]);

  function toggleType(type: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function focusNode(n: GraphNode) {
    setSearch("");
    const net = networkRef.current;
    if (!net) return;
    net.selectNodes([n.id]);
    net.focus(n.id, { scale: 1.1, animation: { duration: 500, easingFunction: "easeInOutQuad" } });
    setSelected({ id: n.id, title: n.title, type: n.type, degree: degree.get(n.id) ?? 0 });
  }

  if (data.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
          <p className="text-sm font-medium">No graph yet.</p>
          <p className="mt-1 max-w-xs text-sm text-muted">
            Once you ingest or write nodes and link them with{" "}
            <code className="rounded bg-panel px-1">[[wikilinks]]</code>, they&apos;ll appear here as a
            connected graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Canvas */}
      <div ref={containerRef} className="absolute inset-0 bg-background" />

      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-muted">Laying out the graph…</span>
        </div>
      )}

      {/* Search (top-left) */}
      <div className="absolute left-4 top-4 w-64">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes…"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm shadow-sm outline-none focus:border-zinc-400"
        />
        {matches.length > 0 && (
          <ul className="mt-1 overflow-hidden rounded-md border border-border bg-background shadow-md">
            {matches.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => focusNode(n)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-panel"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: colorFor(n.type) }}
                  />
                  <span className="truncate">{n.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Info panel (top-right) */}
      {selected && (
        <div className="absolute right-4 top-4 w-64 rounded-md border border-border bg-background p-3 shadow-md">
          <p className="text-sm font-medium leading-snug">{selected.title}</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="rounded border px-1.5 py-0.5 text-xs font-medium capitalize"
              style={{ color: colorFor(selected.type), borderColor: colorFor(selected.type) }}
            >
              {selected.type}
            </span>
            <span className="text-xs text-muted">
              {selected.degree} {selected.degree === 1 ? "link" : "links"}
            </span>
          </div>
          <Link
            href={`/nodes/${selected.id}`}
            className="mt-3 inline-block rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90"
          >
            Open node →
          </Link>
        </div>
      )}

      {/* Legend + filters (bottom-left) */}
      <div className="absolute bottom-4 left-4 rounded-md border border-border bg-background/90 p-3 shadow-sm backdrop-blur">
        <p className="mb-2 text-xs font-medium text-muted">Node type — click to filter</p>
        <ul className="space-y-0.5">
          {typeCounts.map(({ type, count }) => {
            const off = hidden.has(type);
            return (
              <li key={type}>
                <button
                  onClick={() => toggleType(type)}
                  className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-panel ${
                    off ? "opacity-40" : ""
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(type) }} />
                  <span className="capitalize">{type}</span>
                  <span className="ml-auto tabular-nums text-muted">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Stats (bottom-right) */}
      <div className="absolute bottom-4 right-4 rounded-md border border-border bg-background/90 px-3 py-1.5 text-xs text-muted shadow-sm backdrop-blur">
        {data.nodes.length} nodes · {data.edges.length} edges
      </div>
    </div>
  );
}
