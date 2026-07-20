export const meta = {
  name: 'cv-pipeline-improve',
  description: 'Backlog-driven improvement cycle for the CV pipeline microsaas: plan against research+backlog, dev, adversarial QA (security/correctness/product-fit), fix, persist backlog.',
  phases: [
    { title: 'Plan' },
    { title: 'Dev' },
    { title: 'QA' },
    { title: 'Fix' },
    { title: 'Persist' },
  ],
}

const REPO = '/Users/fource/bytecats/easycv'
const BACKLOG = `${REPO}/backlog.json`
const maxTasks = (args && args.maxTasks) || 2
const focusIds = (args && args.focusIds) || null
const excludeIds = (args && args.excludeIds) || null

const COMMON = `Repo: ${REPO}, a git repo. Python env via uv (Python 3.13 pinned) — uv only, never pip or bare python3. Tests: uv run python -m unittest test_pipeline -v (currently green — keep it green; add unittest-style tests for whatever you add, matching test_pipeline.py's existing conventions: TestCase classes, @patch for mocking I/O/subprocess/LLM calls, tempfile.TemporaryDirectory, no real network/pdflatex calls in tests). Commit your own finished work with a clear message (do not amend or push). Never touch resources/, consolidated_info.md, resume_2026.md, or any other personal data files — those are gitignored on purpose.`

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          brief: { type: 'string' },
          rationale: { type: 'string' },
        },
        required: ['id', 'title', 'brief'],
      },
    },
    skipped_reason: { type: 'string' },
  },
  required: ['tasks'],
}

phase('Plan')
const plan = await agent(`Read ${BACKLOG} — a JSON backlog for a resume-consolidation microsaas. It has:
product_goal (the actual target product), sequencing_constraints (hard rules — respect them),
research_findings[] (evidence of what customers actually pay for), backlog[] (items with
id/title/rationale/source/priority/status), open_issues[], completed_cycles[].

Pick up to ${maxTasks} items with status "pending" (never "done" or "deferred" — deferred items are
explicitly off-limits until a human un-defers them).${focusIds ? ` This cycle is scoped to ONLY these backlog ids, in this order of preference: ${JSON.stringify(focusIds)}. Ignore all other pending items even if higher priority — the human running this cycle deliberately restricted scope (usually to avoid file conflicts with other concurrent work).` : ''}${excludeIds ? ` Do NOT pick any of these ids this cycle, regardless of priority: ${JSON.stringify(excludeIds)}.` : ''}
Otherwise prioritize in this order: (1) priority:"critical",
(2) items whose rationale is directly backed by a research_findings entry, (3) everything else by
priority. If a chosen item's rationale looks like internal polish with no line back to product_goal or
research_findings, either skip it or say so in its brief and pick something better instead — be
skeptical of scope creep, per sequencing_constraints.

For each chosen item, write a concrete, self-contained implementation brief: read the ACTUAL current
state of the relevant files in ${REPO} first (do not guess), then specify exact files, current
relevant code/line numbers, and the precise requirement, so a fresh engineer with no other context
could execute it correctly.

If nothing eligible is pending, return an empty tasks array and explain why in skipped_reason.
Return via the required schema.`, {schema: PLAN_SCHEMA, label: 'plan'})

if (!plan || !plan.tasks || plan.tasks.length === 0) {
  log(`Plan: no eligible tasks (${plan && plan.skipped_reason || 'unknown reason'}) — stopping cycle.`)
  return { skipped: true, reason: (plan && plan.skipped_reason) || 'no eligible backlog tasks' }
}

log(`Plan: this cycle will work on ${plan.tasks.map(t => t.id).join(', ')}`)

phase('Dev')
const devResults = []
for (const task of plan.tasks) {
  log(`Dev: ${task.title}`)
  const result = await agent(`${COMMON}

TASK: ${task.title}
${task.brief}

Rationale (for your judgment only, don't over-scope beyond it): ${task.rationale || 'n/a'}

When done: run the full test suite, confirm it is green, report exactly which files changed and what
you built.`, { label: `dev:${task.id}`, phase: 'Dev' })
  devResults.push({ task, result })
}

phase('QA')
const LENSES = [
  {
    key: 'security',
    prompt: 'Hunt for injection (LaTeX/shell/path traversal), unsafe handling of LLM-derived or otherwise untrusted data, and secrets handling. Read the actual diff/code yourself (git diff, git log -p, or read the files directly) — do not just trust the self-report. Try to construct a concrete input that breaks it.',
  },
  {
    key: 'correctness',
    prompt: 'Run the full test suite yourself (uv run python -m unittest test_pipeline -v) and confirm it is actually green. Smoke-test the feature end-to-end with a quick manual repro. Flag anything reported as done that is not actually wired up or does not handle missing/null/empty structured-data fields.',
  },
  {
    key: 'product-fit',
    prompt: `Re-read ${BACKLOG} for product_goal and research_findings. Be skeptical by default: does this specific change actually move a paying customer closer to the download-gated MVP, or is it internal CLI polish nobody will ever see? If it's scope creep relative to product_goal, say so explicitly — a false "OK" here is worse than a false alarm.`,
  },
]

const qaResults = await parallel(
  devResults.flatMap((d, i) => LENSES.map(lens => () =>
    agent(`Repo: ${REPO}, a git repo with recent uncommitted or just-committed changes from a dev agent.
The dev agent's own self-report of what it did for task "${d.task.title}" (id: ${d.task.id}):
"""
${d.result}
"""

${lens.prompt}

Report in under 200 words: a clear verdict — either "OK" or "ISSUES FOUND" — and if issues found, the
specific file, area, and concrete problem (not vague concern). Include a proof-of-concept input/behavior
if you constructed one.`, { label: `qa:${lens.key}:${i}`, phase: 'QA' })
      .then(report => ({ taskId: d.task.id, lens: lens.key, report }))
  ))
)
const qaFlat = qaResults.filter(Boolean)
log(`QA complete: ${qaFlat.length} reviews collected across ${devResults.length} task(s)`)

phase('Fix')
const byTask = {}
for (const r of qaFlat) {
  if (/issues found/i.test(r.report) && !/no issues found/i.test(r.report)) {
    byTask[r.taskId] = byTask[r.taskId] || []
    byTask[r.taskId].push(`[${r.lens}] ${r.report}`)
  }
}
const fixes = []
for (const [taskId, reports] of Object.entries(byTask)) {
  log(`Fix: ${taskId} has flagged issues`)
  const fix = await agent(`${COMMON}

Adversarial QA flagged issues in task "${taskId}", done earlier in this same session:
"""
${reports.join('\n---\n')}
"""

Verify each claim against the actual current code before acting — do not assume the report is fully
accurate. Fix anything that is a real, confirmed problem. Leave a one-line note for anything you
determined was a false positive and why. Run the full test suite when done and confirm it is green.
Report what you fixed.`, { label: `fix:${taskId}`, phase: 'Fix' })
  fixes.push({ taskId, fix })
}

phase('Persist')
const issuesFoundCount = Object.keys(byTask).length
const persistSummary = await agent(`${COMMON}

Update ${BACKLOG} (it's a JSON file — read it, modify in memory, write it back, keep it valid JSON):
1. For each of these backlog item ids, set status to "done" ONLY if you can see from the fix results
   below that it's actually confirmed green with no unresolved flagged issues; otherwise leave it
   "in_progress" and add a short "note" explaining what's still open: ${JSON.stringify(plan.tasks.map(t => t.id))}
2. Append one entry to completed_cycles: {cycle_id: a short unique-ish string you choose, description,
   tasks_done: [...ids actually marked done], issues_found: ${issuesFoundCount}, issues_fixed: ${fixes.length}}.
   Leave the "date" field for a human to fill in if you don't have a reliable current date — do not
   guess a date.
3. If any QA report below surfaced a genuinely new, concrete follow-up idea worth tracking (not just
   restating an existing backlog item), append it to backlog[] as a new item with status "pending" and
   source "qa". Use judgment — do not mechanically copy every QA report as a new item.

QA reports:
"""
${qaFlat.map(r => `[${r.taskId}/${r.lens}] ${r.report}`).join('\n')}
"""

Fix results:
"""
${fixes.map(f => `[${f.taskId}] ${f.fix}`).join('\n')}
"""

Report back a short summary of what you changed in backlog.json.`, { label: 'persist', phase: 'Persist' })

return { plan, devResults, qaResults: qaFlat, fixes, persistSummary, issuesFound: issuesFoundCount }
