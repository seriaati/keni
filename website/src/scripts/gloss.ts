// Gloss: renders a line of plain-language input and hangs amber-bracketed labels under the phrases Keni
// understood. Used by the hero (animated typing loop) and the feature examples (static, on scroll).

export interface GlossNote {
  /** Exact substring of the line to bracket (first unused occurrence). */
  match: string;
  /** Kind label, e.g. "Amount" or "Merchant · Category". */
  label: string;
  /** What Keni filled in, e.g. "$38.00". */
  value: string;
  /** Count the value up from zero when it appears. */
  count?: boolean;
}

export interface GlossExample {
  text: string;
  notes: GlossNote[];
}

interface Placed {
  el: HTMLSpanElement;
  note: GlossNote;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Gloss {
  readonly root: HTMLElement;
  private line: HTMLElement;
  private notesEl: HTMLElement;
  private minSize: number;

  constructor(root: HTMLElement, minSize = 20) {
    this.root = root;
    this.line = root.querySelector(".gloss-line") as HTMLElement;
    this.notesEl = root.querySelector(".gloss-notes") as HTMLElement;
    this.minSize = minSize;
  }

  /** Draw the line. With notes, wraps matched phrases so they can be glossed. */
  paint(text: string, notes: GlossNote[] | null, caret = false): Placed[] {
    this.line.textContent = "";
    const placed: Placed[] = [];
    let i = 0;
    for (const { note, s, e } of locate(text, notes ?? [])) {
      if (s > i) this.line.append(text.slice(i, s));
      const span = document.createElement("span");
      span.textContent = text.slice(s, e);
      this.line.append(span);
      placed.push({ el: span, note });
      i = e;
    }
    if (i < text.length) this.line.append(text.slice(i));
    if (caret) {
      const c = document.createElement("span");
      c.className = "gloss-caret";
      this.line.append(c);
    }
    this.fit();
    return placed;
  }

  /** Shrink the line's font until it fits the column. */
  fit() {
    this.root.style.removeProperty("--gs");
    const max = this.root.clientWidth;
    let size = parseFloat(getComputedStyle(this.line).fontSize);
    for (let n = 0; n < 30 && this.line.scrollWidth > max && size > this.minSize; n++) {
      size *= 0.94;
      this.root.style.setProperty("--gs", `${size}px`);
    }
  }

  clear() {
    for (const n of Array.from(this.notesEl.children)) {
      n.classList.add("out");
      setTimeout(() => n.remove(), 260);
    }
    this.notesEl.style.removeProperty("height");
  }

  /** Hang a label under each placed phrase. Labels that would collide drop to a lower row. */
  annotate(placed: Placed[], animate = true) {
    this.notesEl.textContent = "";
    const box = this.root.getBoundingClientRect();
    const width = this.root.clientWidth;
    const row = parseFloat(getComputedStyle(this.root).getPropertyValue("--row")) || 52;
    const rows: number[] = [];
    let maxRow = 0;
    const items = placed
      .map((p) => {
        const r = p.el.getBoundingClientRect();
        return { x: r.left - box.left, w: r.width, note: p.note };
      })
      .sort((a, b) => a.x - b.x);

    const made = items.map((it, k) => {
      const n = document.createElement("div");
      n.className = "gloss-note";
      const lab = document.createElement("div");
      lab.className = "gloss-lab";
      const kind = document.createElement("b");
      kind.textContent = it.note.label;
      const value = document.createElement("span");
      value.textContent = it.note.value;
      lab.append(kind, value);
      const br = document.createElement("div");
      br.className = "gloss-br";
      const lead = document.createElement("div");
      lead.className = "gloss-lead";
      n.append(br, lead, lab);
      n.style.setProperty("--x", `${it.x}px`);
      n.style.setProperty("--w", `${Math.max(it.w, 8)}px`);
      n.style.setProperty("--d", animate ? `${k * 110}ms` : "0ms");
      n.style.setProperty("--d2", animate ? `${k * 110 + 220}ms` : "0ms");
      this.notesEl.append(n);

      const lw = lab.offsetWidth;
      let r = 0;
      while (rows[r] !== undefined && rows[r] > it.x - 18) r++;
      rows[r] = it.x + lw + 16;
      maxRow = Math.max(maxRow, r);
      n.style.setProperty("--lead", `${r * row}px`);
      n.style.setProperty("--shift", `${Math.max(-it.x, Math.min(0, width - (it.x + lw)))}px`);
      if (it.note.count && animate) countUp(value, it.note.value, k * 110 + 220);
      return n;
    });

    this.notesEl.style.height = `${(maxRow + 1) * row + 16}px`;
    if (animate) requestAnimationFrame(() => requestAnimationFrame(() => made.forEach((n) => n.classList.add("in"))));
    else made.forEach((n) => n.classList.add("in"));
  }
}

/** Find each note's phrase in order of appearance, skipping overlaps. */
function locate(text: string, notes: GlossNote[]) {
  const found: { note: GlossNote; s: number; e: number }[] = [];
  for (const note of notes) {
    let from = 0;
    let s = text.indexOf(note.match, from);
    while (s !== -1 && found.some((f) => s < f.e && s + note.match.length > f.s)) {
      from = s + 1;
      s = text.indexOf(note.match, from);
    }
    if (s !== -1) found.push({ note, s, e: s + note.match.length });
  }
  return found.sort((a, b) => a.s - b.s);
}

/** Tween the number inside a formatted value ("$4,200.00", "+NT$640") from zero. */
function countUp(el: HTMLElement, value: string, delay: number) {
  const m = /^(.*?)(\d[\d,]*(?:\.(\d+))?)(.*)$/.exec(value);
  if (!m || reduced()) return;
  const [, pre, num, dec = "", post] = m;
  const target = parseFloat(num.replace(/,/g, ""));
  const digits = dec.length;
  const fmt = (v: number) =>
    pre + v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + post;
  el.textContent = fmt(0);
  setTimeout(() => {
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 700);
      el.textContent = p < 1 ? fmt(target * (1 - Math.pow(1 - p, 4))) : value;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, delay);
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export { reduced };
