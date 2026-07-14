#!/usr/bin/env node
// scripts/changelog.mjs
//
// Generates a player-facing CHANGELOG.md from conventional-commit git history.
// Zero dependencies — plain Node ESM using only node:child_process / node:fs / node:path.
//
// Usage: node scripts/changelog.mjs
//
// Behavior:
//   1. Finds the most recent git tag (if any) via `git describe --tags --abbrev=0`.
//   2. Parses `git log <tag>..HEAD` (or the whole history if there's no tag).
//   3. Buckets conventional-commit subjects (feat/fix/perf/polish/...) into
//      player-facing sections, translating raw dev subjects into on-brand copy.
//   4. Writes CHANGELOG.md at the repo root.

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const FIELD_SEP = "\x1f"; // unit separator, safe against commit text

// ---------------------------------------------------------------------------
// 1. Locate the most recent tag (tolerate failure — this repo currently has none).
// ---------------------------------------------------------------------------
function getLatestTag() {
  try {
    return execSync("git describe --tags --abbrev=0", {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. Pull the commit log (machine-parseable format).
// ---------------------------------------------------------------------------
function getCommits(tag) {
  const range = tag ? `${tag}..HEAD` : "";
  const cmd = `git log ${range} --pretty=format:%H${FIELD_SEP}%ad${FIELD_SEP}%s --date=short`;
  const raw = execSync(cmd, { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
  if (!raw) return [];
  return raw.split("\n").map((line) => {
    const [hash, date, subject] = line.split(FIELD_SEP);
    return { hash, date, subject };
  });
}

// ---------------------------------------------------------------------------
// 3. Conventional-commit parsing.
// ---------------------------------------------------------------------------
const CONVENTIONAL_RE =
  /^(feat|fix|perf|docs|polish|refactor|chore|style|test)(\([^)]*\))?!?:\s*(.+)$/i;

// Types that are internal / not player-facing — excluded from the player changelog.
const SKIP_TYPES = new Set(["docs", "chore", "test", "style", "refactor"]);

// Player-facing section headings, in display order.
const SECTION_ORDER = ["feat", "fix", "perf", "polish"];
const SECTION_META = {
  feat: { heading: "🏈 New on the Field" },
  fix: { heading: "🚩 Penalty Flags Picked Up" },
  perf: { heading: "⚡ Faster Snap Counts" },
  polish: { heading: "✨ Stadium Polish" },
};

// ---------------------------------------------------------------------------
// 4. Curated dictionary — marquee commits get hand-written, on-brand copy.
//    Matched by case-insensitive substring against the raw commit subject.
// ---------------------------------------------------------------------------
const CURATED = [
  {
    match: /THE GAUNTLET/i,
    text:
      "The Gauntlet is here — a nightly siege on your stadium where your defense finally earns its keep. Hold the line.",
  },
  {
    match: /THE SILENCING/i,
    text:
      "Raids now play out the away-game fantasy for real: roll into their house, run your plays, and leave the crowd dead silent.",
  },
  {
    match: /MARCHING BAND WIN MOMENT/i,
    text: "When you silence the crowd, the band takes their field — a full win moment worth sticking around for.",
  },
  {
    match: /quantize all heavy sprites/i,
    text:
      "The game downloads way faster now — we trimmed the art down from 221MB to about 15MB with zero visual downgrade.",
  },
  {
    match: /ISOMETRIC RAIDS/i,
    text: "Raids got a full isometric field upgrade, complete with defense-level roads and new Scouting story photos.",
  },
  {
    match: /DEFENSE PLAYS LADDER/i,
    text: "A whole ladder of new defense plays has arrived, plus restored formation-preview art.",
  },
  {
    match: /wall art tiers/i,
    text: "Your Blocking Sleds now wear the era your Stadium has earned — wall art levels up right alongside you.",
  },
  {
    match: /Gatorade Station/i,
    text: "The Gatorade Station has joined the lineup, along with Level-10 signature plays and fresh tier-1 defense art.",
  },
  {
    match: /FILM ROOM/i,
    text: "The strategy room has been reborn as the Film Room — a 3-tier story from chalk talk all the way up to full movie-palace theater.",
  },
  {
    match: /Stadium tiers 1-4/i,
    text: "Your Stadium's full five-era glow-up is complete — every tier, freshly generated.",
  },
  {
    match: /dual-deck scoreboard/i,
    text: "A new dual-deck scoreboard shows live stats right on the big screens.",
  },
  {
    match: /Club Dashboard/i,
    text: "The new Club Dashboard gives you a SimCity-style advisor panel, right off the jumbotron.",
  },
  {
    match: /jumbotron shows a REAL display/i,
    text: "The jumbotron now shows a real LED readout with your club name and live stats.",
  },
  {
    match: /campus stage-up celebration/i,
    text: "Leveling up your campus now kicks off a full celebration — banner, prop reveal, and a crowd roar.",
  },
  {
    match: /profiles \+ cloud saves/i,
    text: "Cloud saves and profiles are live — your program follows you, not just your device.",
  },
  {
    match: /deep-dive correctness batch.*cloud saves, replays, gauntlet, economy/i,
    text:
      "A big round of fixes across cloud saves, replays, the Gauntlet, and the economy — smoother sailing all around.",
  },
  {
    match: /Castle-Clash-grade battle deploy bar/i,
    text: "The raid deploy bar got a Castle-Clash-grade rebuild — deploying your squad feels sharper than ever.",
  },
  {
    match: /phone deploy bar.*scrollable card tray/i,
    text: "On phones, the deploy bar is now a single smooth scrollable tray of your squad.",
  },
  {
    match: /Training Field 5-tier story/i,
    text: "The Training Field now tells a full 5-tier story, from sandlot to pro facility.",
  },
  {
    match: /Rehab Center 3-tier story/i,
    text: "The Rehab Center got its own 3-tier glow-up — the ice bath never leaves.",
  },
  {
    match: /Scouting Dept 'Draft Board' progression/i,
    text: "The Scouting Dept's Draft Board now tells one continuous story across all 5 tiers.",
  },
  {
    match: /full-fan-capacity layout/i,
    text: "Your Stadium editor now previews the full-fan-capacity endgame layout.",
  },
];

// Fallback vocabulary substitutions — keep everything strictly on-brand
// (Design Bible §3: no HP/damage/kill/destroy/attack/war/weapon language).
const VOCAB_SUBS = [
  [/\bHP\b/gi, "Down Meter"],
  [/\bdamage\b/gi, "yards"],
  [/\bdestroyed?\b/gi, "sacked"],
  [/\battack(s|ed|ing)?\b/gi, "raid$1"],
  [/\bweapons?\b/gi, "gear"],
  [/\bwars?\b/gi, "rivalries"],
  [/\bkill(s|ed|ing)?\b/gi, "sack$1"],
  [/\bbullets?\b/gi, "footballs"],
];

function titleCase(subject) {
  const trimmed = subject.trim();
  if (!trimmed) return trimmed;
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

function applyVocab(text) {
  let out = text;
  for (const [pattern, replacement] of VOCAB_SUBS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function humanize(rawSubject) {
  for (const entry of CURATED) {
    if (entry.match.test(rawSubject)) return entry.text;
  }
  // Generic fallback: strip the "type(scope)!: " prefix, capitalize, apply vocab.
  const m = CONVENTIONAL_RE.exec(rawSubject);
  const body = m ? m[3] : rawSubject;
  let cleaned = body.replace(/\s+—\s+/g, " — ").trim();
  cleaned = titleCase(cleaned);
  cleaned = applyVocab(cleaned);
  if (!/[.!?]$/.test(cleaned)) cleaned += ".";
  return cleaned;
}

// Internal / dev-only subjects that should never surface to players even if
// they carry a player-facing type prefix.
const INTERNAL_NOISE_RE = /(unsweep dev-only files|\bTODO\b|vega300)/i;

// ---------------------------------------------------------------------------
// 5. Build the grouped, deduped entry list.
// ---------------------------------------------------------------------------
function buildSections(commits) {
  const sections = new Map(SECTION_ORDER.map((t) => [t, []]));
  const seenText = new Set();

  for (const { hash, date, subject } of commits) {
    const m = CONVENTIONAL_RE.exec(subject.trim());
    if (!m) continue;
    const type = m[1].toLowerCase();
    if (SKIP_TYPES.has(type)) continue;
    if (!sections.has(type)) continue;
    if (INTERNAL_NOISE_RE.test(subject)) continue;

    const text = humanize(subject);
    const dedupeKey = `${type}::${text}`;
    if (seenText.has(dedupeKey)) continue;
    seenText.add(dedupeKey);

    sections.get(type).push({ hash: hash.slice(0, 7), date, text });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// 6. Render Markdown.
// ---------------------------------------------------------------------------
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function render(sections, tag) {
  const lines = [];
  lines.push("# Football Headquarters — Changelog");
  lines.push("");
  lines.push(
    "Straight from the sideline: here's what's new on the field, patched up in the locker room, and polished for game day."
  );
  lines.push("");
  lines.push(`## Unreleased — ${todayISO()}`);
  if (tag) {
    lines.push("");
    lines.push(`_Changes since \`${tag}\`._`);
  }
  lines.push("");

  let any = false;
  for (const type of SECTION_ORDER) {
    const entries = sections.get(type);
    if (!entries || entries.length === 0) continue;
    any = true;
    lines.push(`### ${SECTION_META[type].heading}`);
    lines.push("");
    for (const entry of entries) {
      lines.push(`- ${entry.text}`);
    }
    lines.push("");
  }

  if (!any) {
    lines.push("_No player-facing changes yet — check back after the next drive._");
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const tag = getLatestTag();
  const commits = getCommits(tag);
  const sections = buildSections(commits);
  const markdown = render(sections, tag);

  const outPath = path.join(REPO_ROOT, "CHANGELOG.md");
  writeFileSync(outPath, markdown, "utf8");

  const totalEntries = SECTION_ORDER.reduce(
    (sum, type) => sum + (sections.get(type)?.length ?? 0),
    0
  );
  console.log(
    `Wrote ${outPath} — ${totalEntries} entries from ${commits.length} commits${
      tag ? ` since ${tag}` : " (full history, no tags found)"
    }.`
  );
}

main();
