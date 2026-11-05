// Order in which a formatted note draws its diagrams. A drawing starts before Mermaid
// is loaded, and a Mermaid failure marks only that diagram. This file stays free of
// the drawing and diagram libraries so a test can run the order on its own.

export type MountLang = 'mermaid' | 'excalidraw';

export interface DiagramJob {
  index: number;
  lang: MountLang;
  source: string;
}

export interface MermaidDrawer {
  render: (id: string, source: string) => Promise<string>;
}

// `card` runs for every block before anything is awaited, so the source is already
// replaced when Mermaid starts loading. `draw` is started in that same stretch.
export async function mountDiagramJobs<T extends DiagramJob, C>(
  jobs: T[],
  hooks: {
    card: (job: T) => C;
    draw: (card: C, source: string) => Promise<void>;
    loadMermaid: () => Promise<MermaidDrawer>;
    show: (card: C, svg: string) => void;
    fail: (card: C) => void;
  },
): Promise<void> {
  const drawings: { card: C; source: string }[] = [];
  const diagrams: { card: C; index: number; source: string }[] = [];
  for (const job of jobs) {
    const card = hooks.card(job);
    if (job.lang === 'excalidraw') drawings.push({ card, source: job.source });
    else diagrams.push({ card, index: job.index, source: job.source });
  }
  const drawn = Promise.all(drawings.map((job) => hooks.draw(job.card, job.source).catch(() => hooks.fail(job.card))));
  if (diagrams.length) {
    try {
      const mermaid = await hooks.loadMermaid();
      for (const job of diagrams) {
        try {
          const id = `mk${job.index}${Math.random().toString(36).slice(2, 7)}`;
          hooks.show(job.card, await mermaid.render(id, job.source));
        } catch { hooks.fail(job.card); }
      }
    } catch {
      for (const job of diagrams) hooks.fail(job.card);
    }
  }
  await drawn;
}
