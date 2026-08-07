---
name: capstone-docs
description: Produce documentation deliverables for the ZGSU26GP09 Metadata Manage Center capstone — Mermaid diagrams rendered to print-quality PNG/SVG (use case, class, sequence, ER, architecture, deployment, activity, state, component) and Excel workbooks (traceability matrix, test cases, defect log, sprint backlog, task assignment, entity/API catalogs). Use this skill whenever the user asks for project documentation, a report chapter, a UML or architecture picture, "vẽ diagram", a test case sheet, a backlog/timeline spreadsheet, or hands over a .docx/.xlsx report file to fill in or update — even when they don't name the diagram type or say the word "Excel".
---

# Capstone documentation for ZGSU26GP09

This skill produces the documentation deliverables for the Metadata Manage Center capstone
(`com.zgp9.fe`, SAP490 / group SAP09): diagrams and spreadsheets that describe **this** system,
not a generic web app.

## The one rule that matters

**Every box, arrow, row and cell must trace back to something in the repository.** A capstone
document is graded against a demo of the running system, so a plausible-looking diagram
containing a component that does not exist is worse than no diagram — it is a defect the reviewer
finds in front of you.

So: before drawing, read. `references/project-facts.md` holds the architecture facts already
verified against the code, each with the file to re-check it in. Read it first — it will answer
most questions without a single grep, and it tells you where to look for the rest.

When the facts file does not cover something, find it in the code before drawing it:

```bash
grep -rn "onRunScan" webapp/controller webapp/services
```

If a fact cannot be established from the repo — backend ABAP internals, sprint dates, who did
what — ask the user rather than inventing it. Backend CDS/ABAP objects live in a different
repository and are only visible here through the OData paths the frontend calls.

## Workflow

1. **Identify the deliverable.** Which document, which chapter, which diagram type. If the user
   sent a file, open it first and match its existing structure, numbering and language — a
   diagram in a different visual dialect than the rest of the report reads as copy-paste.
2. **Ground it.** Read `references/project-facts.md`; grep for anything it does not cover.
3. **Draft.** For diagrams see `references/diagrams.md` (catalog of which diagram answers which
   question, plus a project-specific starter for each). For spreadsheets see
   `references/workbooks.md` (standard sheet layouts and the spec format).
4. **Produce.** Render or build with the scripts below. Never hand over raw Mermaid text when the
   destination is a Word report — it has to be an image there.
5. **Report honestly.** Say what you generated, and list anything you assumed or left blank for
   the user to fill (dates, names, test results you did not run).

## Diagrams

Author Mermaid in `docs/diagrams/*.mmd`, one diagram per file, kebab-case named after what it
shows (`registry-create-sequence.mmd`, not `diagram3.mmd`). Text sources are diffable, reviewable
and cheap to regenerate when the code changes — which is the whole reason not to draw these by
hand in draw.io.

Render everything:

```bash
node .claude/skills/capstone-docs/scripts/render.mjs
```

Render one file, or a subset:

```bash
node .claude/skills/capstone-docs/scripts/render.mjs docs/diagrams/use-case.mmd
```

Output lands in `docs/diagrams/out/` as both `.png` (scale 3, white background — sized for
pasting into Word at print quality) and `.svg` (for anything that needs rescaling later).
The first run installs the renderer, which takes a few minutes; later runs are seconds.

**Look at what you rendered.** Read the PNG back with the Read tool before handing it over.
Mermaid silently produces overlapping labels, clipped text and unreadable tangles on dense
graphs, and none of that shows up in the source. If it is unreadable, split it into two diagrams
rather than shrinking the font — a use case diagram covering 4 actors and 20 use cases is a grey
smear at Word's page width.

`references/diagrams.md` also carries the layout habits that keep these legible (direction, when
to use subgraphs, how many nodes before splitting).

## Excel workbooks

Build from a JSON spec — describing a sheet as data and letting the script handle column widths,
header styling, freeze panes, autofilter and dropdowns is far more reliable than driving a
spreadsheet library by hand each time:

```bash
node .claude/skills/capstone-docs/scripts/xlsx.mjs build spec.json out.xlsx
```

Inspect a workbook the user sends, before touching it:

```bash
node .claude/skills/capstone-docs/scripts/xlsx.mjs dump "path/to/their.xlsx"
```

Append rows to an existing sheet, preserving what is already there:

```bash
node .claude/skills/capstone-docs/scripts/xlsx.mjs append book.xlsx "Test Cases" rows.json
```

`references/workbooks.md` documents the spec format and the standard sheet layouts (test cases,
traceability, backlog, defect log, entity catalog). Run `xlsx.mjs` with no arguments for the
usage summary.

## When the user sends a document to update

This is the common case — the report template comes from the team, not from us.

- **Read the whole file before editing it.** Match its heading numbering, caption style
  ("Figure 3.2: ..."), terminology and language (Vietnamese or English — follow the document,
  do not switch).
- **Preserve, don't regenerate.** Editing the file the user sent keeps their formatting,
  reviewer comments and section numbering. Rebuilding it from scratch loses all of that even
  when the text matches.
- **`.xlsx`** → `xlsx.mjs dump` to see it, then `append`, or edit with a small `exceljs` script.
  Note that `exceljs` round-trips cell values, styles and formulas but **drops charts and pivot
  tables** — if `dump` reports either, tell the user before writing, and consider adding your
  content as a new sheet instead of resaving the whole book.
- **`.docx`** → try the bundled `anthropic-skills:docx` skill first. It expects Python, which is
  **not installed on this machine**, so if it cannot run, fall back to editing the OOXML directly
  (a `.docx` is a zip; `Expand-Archive` / `Compress-Archive` in PowerShell handles it without any
  dependency), or deliver the text as Markdown plus the rendered PNGs and tell the user which
  section each belongs in. Say which route you took.

## Setup

Both scripts self-install their dependencies into `.claude/skills/capstone-docs/scripts/`
on first use — no global install, nothing added to the app's own `package.json`, and
`node_modules/` there is gitignored. Node 18+ is the only prerequisite.

The renderer needs a Chromium; it uses the puppeteer cache if one is present and otherwise
downloads one during that first install.

## Conventions

| Thing | Convention |
| --- | --- |
| Diagram sources | `docs/diagrams/<what-it-shows>.mmd` |
| Rendered output | `docs/diagrams/out/<name>.png` and `.svg` |
| Workbook specs | `docs/workbooks/<name>.spec.json`, output beside it as `.xlsx` |
| Naming in diagrams | The real identifier — `RegistryService.createRegistry()`, `ZGP9_AI_CFG`, `/ScanJob` — not a paraphrase |
| Language | Match the document being updated; default English (the repo's docs are English) |
| Dates | Absolute (`2026-08-07`), never "last week" |

Keep generated `.mmd` and `.spec.json` sources in the repo. They are the reason the next
regeneration takes a minute instead of an afternoon, and they let a teammate correct a diagram
without redrawing it.
