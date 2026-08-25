"use client";

import { useMemo, useState } from "react";

type Segment = {
  id: number;
  title: string;
  script: string;
  filename: string;
  words: number;
  seconds: number;
  slate: string;
  markedScript: string;
  guidance: string[];
};

const sampleInput = `Segment 1: Intro readout
Welcome everyone. This is the short opening note for the first update. The goal is to sound clear, steady, and useful.

Segment 2: Reminder readout
Here is a concise reminder for the group. Please review the attached material before the session and keep one question ready.

Segment 3: Closing readout
Thank you for joining. The next step is simple: check the shared notes, confirm your action item, and send any corrections by the end of the day.`;

const stopWords = new Set(["the", "and", "for", "with", "this", "that", "from", "your", "you", "are", "was", "were", "will", "into", "before", "after", "please", "everyone", "here"]);

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 44);
  return slug || "segment";
}

function countWords(value: string): number {
  return (value.trim().match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g) ?? []).length;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function extractTitle(block: string, index: number): { title: string; script: string } {
  const lines = block.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const first = lines[0] ?? `Segment ${index + 1}`;
  const titleMatch = first.match(/^segment\s*\d+\s*[:\-]\s*(.+)$/i);
  if (titleMatch) {
    return { title: titleCase(titleMatch[1]), script: lines.slice(1).join(" ") || titleMatch[1] };
  }
  if (first.length <= 56 && lines.length > 1 && !/[.!?]$/.test(first)) {
    return { title: titleCase(first), script: lines.slice(1).join(" ") };
  }
  return { title: `Segment ${index + 1}`, script: lines.join(" ") };
}

function addPauseMarks(script: string): string {
  return script
    .replace(/([.!?])\s+/g, "$1\n[pause]\n")
    .replace(/(;|:)\s+/g, "$1 [beat] ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function makeGuidance(script: string, seconds: number): string[] {
  const words = script.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const repeated = Array.from(words.reduce<Map<string, number>>((map, word) => {
    if (!stopWords.has(word) && word.length > 4) map.set(word, (map.get(word) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries())
    .filter(([, count]) => count > 1)
    .slice(0, 3)
    .map(([word]) => word);
  const hints = [
    seconds > 75 ? "Split if this needs a short voice note." : "Safe as a single short take.",
    script.includes("?") ? "Lift tone on questions; pause before the answer." : "Keep cadence even; avoid rushing the middle.",
  ];
  if (repeated.length) hints.push(`Emphasise repeated anchors: ${repeated.join(", ")}.`);
  return hints;
}

function buildSegments(input: string, wpm: number, prefix: string): Segment[] {
  const blocks = input.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block, index) => {
    const parsed = extractTitle(block, index);
    const words = countWords(parsed.script);
    const seconds = Math.max(4, Math.round((words / wpm) * 60));
    const filename = `${prefix || "readout"}-${String(index + 1).padStart(2, "0")}-${slugify(parsed.title)}.mp3`;
    const slate = `Take ${index + 1}. ${parsed.title}. Target ${formatDuration(seconds)}.`;
    return {
      id: index + 1,
      title: parsed.title,
      script: parsed.script,
      filename,
      words,
      seconds,
      slate,
      markedScript: addPauseMarks(parsed.script),
      guidance: makeGuidance(parsed.script, seconds),
    };
  });
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function buildManifest(segments: Segment[]): string {
  const header = "order,filename,title,words,target_duration,slate";
  const rows = segments.map((segment) => [
    segment.id,
    segment.filename,
    `"${segment.title.replace(/"/g, '""')}"`,
    segment.words,
    formatDuration(segment.seconds),
    `"${segment.slate.replace(/"/g, '""')}"`,
  ].join(","));
  return [header, ...rows].join("\n");
}

function buildMarkdown(segments: Segment[]): string {
  return segments.map((segment) => `## ${segment.id}. ${segment.title}\n\n**File:** ${segment.filename}\n**Slate:** ${segment.slate}\n**Target:** ${formatDuration(segment.seconds)} · ${segment.words} words\n\n${segment.markedScript}\n\n**Direction**\n${segment.guidance.map((hint) => `- ${hint}`).join("\n")}`).join("\n\n---\n\n");
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export default function Home() {
  const [input, setInput] = useState(sampleInput);
  const [prefix, setPrefix] = useState("readout-batch");
  const [wpm, setWpm] = useState(145);
  const [copied, setCopied] = useState("");

  const segments = useMemo(() => buildSegments(input, wpm, slugify(prefix)), [input, prefix, wpm]);
  const totalSeconds = segments.reduce((sum, segment) => sum + segment.seconds, 0);
  const manifest = useMemo(() => buildManifest(segments), [segments]);
  const markdown = useMemo(() => buildMarkdown(segments), [segments]);

  const handleCopy = async (label: string, value: string) => {
    await copyText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  };

  const speakSegment = (segment: Segment) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(segment.script);
    utterance.rate = Math.min(1.2, Math.max(0.75, wpm / 160));
    window.speechSynthesis.speak(utterance);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[2rem] border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur print-card">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-200">Voice generation operations</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">Readout Queue</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-200">Paste multiple scripts once. Get a production-ready spoken asset queue with filenames, slates, pause-marked copy, runtime budget, and exportable render manifest.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="text-3xl font-black">{segments.length}</div>
              <div className="text-sm text-slate-300">clips queued</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="text-3xl font-black">{formatDuration(totalSeconds)}</div>
              <div className="text-sm text-slate-300">total runtime</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="text-3xl font-black">{wpm}</div>
              <div className="text-sm text-slate-300">words/minute</div>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/15 bg-slate-950/55 p-5 shadow-2xl print-card no-print">
          <label className="text-sm font-bold uppercase tracking-[0.2em] text-slate-300" htmlFor="batch-input">Batch scripts</label>
          <textarea id="batch-input" value={input} onChange={(event) => setInput(event.target.value)} className="mt-3 h-80 w-full rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-sm leading-6 text-slate-100 outline-none ring-sky-300/40 focus:ring-4" />
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_170px]">
            <label className="text-sm text-slate-300">Filename prefix
              <input value={prefix} onChange={(event) => setPrefix(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-sky-300" />
            </label>
            <label className="text-sm text-slate-300">Pace: {wpm} wpm
              <input type="range" min="110" max="180" value={wpm} onChange={(event) => setWpm(Number(event.target.value))} className="mt-4 w-full" />
            </label>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {segments.map((segment) => (
            <article key={segment.id} className="print-card rounded-3xl border border-white/15 bg-white/[0.08] p-5 shadow-xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-200">Clip {String(segment.id).padStart(2, "0")}</p>
                  <h2 className="mt-1 text-2xl font-black">{segment.title}</h2>
                  <p className="mt-1 break-all text-sm text-sky-200">{segment.filename}</p>
                </div>
                <div className="flex flex-wrap gap-2 no-print">
                  <button onClick={() => speakSegment(segment)} className="rounded-full bg-sky-300 px-4 py-2 text-sm font-bold text-slate-950">Read aloud</button>
                  <button onClick={() => handleCopy(segment.title, `${segment.slate}\n\n${segment.markedScript}`)} className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white">Copy clip</button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 whitespace-pre-wrap text-sm leading-7 text-slate-100">{segment.markedScript}</div>
                <aside className="rounded-2xl border border-white/10 bg-slate-900/55 p-4">
                  <p className="text-sm font-bold text-slate-200">{segment.words} words · {formatDuration(segment.seconds)}</p>
                  <p className="mt-3 text-sm font-semibold text-sky-200">{segment.slate}</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">
                    {segment.guidance.map((hint) => <li key={hint}>• {hint}</li>)}
                  </ul>
                </aside>
              </div>
            </article>
          ))}
        </div>

        <aside className="no-print h-fit rounded-3xl border border-white/15 bg-slate-950/70 p-5 shadow-xl">
          <h2 className="text-xl font-black">Export pack</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Use the manifest for a render queue, and the Markdown pack for the human production sheet.</p>
          <div className="mt-4 grid gap-3">
            <button onClick={() => handleCopy("manifest", manifest)} className="rounded-2xl bg-violet-300 px-4 py-3 font-black text-slate-950">Copy CSV manifest</button>
            <button onClick={() => handleCopy("markdown", markdown)} className="rounded-2xl bg-sky-300 px-4 py-3 font-black text-slate-950">Copy Markdown pack</button>
            <button onClick={() => window.print()} className="rounded-2xl border border-white/15 px-4 py-3 font-black text-white">Print production sheet</button>
          </div>
          {copied && <p className="mt-3 rounded-xl bg-emerald-300/15 px-3 py-2 text-sm font-bold text-emerald-200">Copied {copied}.</p>}
          <pre className="mt-5 max-h-80 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-5 text-slate-300">{manifest}</pre>
        </aside>
      </section>
    </main>
  );
}
