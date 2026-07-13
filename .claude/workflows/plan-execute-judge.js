// ═══════════════════════════════════════════════════════════════════════════════
//  PLAN · EXECUTE · JUDGE — a goal-driven loop with model tiering.
//
//  Your best model (Fable 5) is the PLANNER and the JUDGE. It never does the grunt
//  work. It decomposes the goal, routes each task to the CHEAPEST capable model,
//  reads the executors' output, and reviews it against acceptance criteria. Cheaper
//  models (Sonnet / Haiku) are the EXECUTORS. The loop repeats — plan → execute →
//  judge → re-plan the failures — until Fable declares the goal complete.
//
//  WHY the top model doesn't waste time on small tasks:
//   • Fable classifies each task trivial | standard | complex and picks the executor
//     tier (trivial → Haiku, else → Sonnet). Fable NEVER executes.
//   • Trivial tasks the executor self-verifies are accepted without a Fable review;
//     only standard/complex work gets the top-model judgment.
//   • Review is ONE batched Fable call per round, not one per task.
//
//  RUN IT:
//    Workflow({ name: 'plan-execute-judge', args: 'YOUR GOAL HERE' })
//    Workflow({ name: 'plan-execute-judge', args: {
//      goal: 'YOUR GOAL',        // required — the job to drive to completion
//      topModel: 'fable',        // PLANNER + JUDGE model (default 'fable'); set 'opus'
//                                //   when Fable 5 is rate-limited. Executors stay cheap.
//      maxRounds: 4,             // safety cap on plan→execute→judge cycles (default 4)
//      execTier: 'sonnet',       // default executor for standard/complex ('sonnet'|'haiku')
//      parallel: false,          // true ONLY if the round's tasks touch disjoint files
//      autoCommit: false,        // executors may commit their own work when true
//    }})
//  Watch live progress with /workflows.
// ═══════════════════════════════════════════════════════════════════════════════

export const meta = {
  name: 'plan-execute-judge',
  description: 'Fable 5 plans and judges; cheaper models execute; loops until the goal is complete',
  whenToUse: 'A multi-step goal where your best model should PLAN and REVIEW but never do the grunt work. Fable 5 decomposes the goal, routes each task to the cheapest capable model, executors do it, Fable reviews the batch, and it repeats until the goal is met.',
  phases: [
    { title: 'Plan', detail: 'Fable 5 decomposes the goal + routes each task to a model tier', model: 'fable' },
    { title: 'Execute', detail: 'Haiku / Sonnet do the grunt work' },
    { title: 'Judge', detail: 'Fable 5 reviews the batch against acceptance criteria', model: 'fable' },
  ],
}

// ── inputs (accept a bare string goal, a config object, OR a JSON-encoded string) ──
let input
if (typeof args === 'string') {
  const s = args.trim()
  // Some callers hand the whole config object through as a JSON string — parse it so
  // the goal doesn't end up as raw JSON. A plain-text goal is used verbatim.
  if (s.startsWith('{')) { try { input = JSON.parse(s) } catch { input = { goal: args } } }
  else input = { goal: args }
} else {
  input = args || {}
}
const GOAL = (input.goal || '').trim()
const MAX_ROUNDS = Number.isFinite(input.maxRounds) ? input.maxRounds : 4
const STD_TIER = input.execTier === 'haiku' ? 'haiku' : 'sonnet'
// The PLANNER + JUDGE model — your best system. Defaults to Fable 5; override with
// topModel:'opus' when Fable is rate-limited so the loop still runs on a top-tier model.
// Executors are NEVER this model — they stay Sonnet/Haiku.
const TOP_MODEL = input.topModel || 'fable'
const PARALLEL = !!input.parallel
const AUTO_COMMIT = !!input.autoCommit
const MIN_RESERVE = 40_000 // stop starting new rounds once the token budget is this low

if (!GOAL) {
  return { error: 'No goal provided. Pass args as a goal string, or { goal: "..." }.' }
}

// ── structured contracts between the tiers ─────────────────────────────────────
const PLAN_SCHEMA = {
  type: 'object',
  required: ['goalComplete', 'summary', 'tasks'],
  additionalProperties: false,
  properties: {
    goalComplete: { type: 'boolean', description: 'true when nothing remains to be done for the goal' },
    summary: { type: 'string', description: 'one-line status of where the goal stands' },
    tasks: {
      type: 'array',
      description: 'the NEXT batch of independent tasks (fixes first). Empty iff goalComplete.',
      items: {
        type: 'object',
        required: ['id', 'title', 'description', 'complexity', 'tier', 'acceptance'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'short stable id, e.g. t1' },
          title: { type: 'string' },
          description: { type: 'string', description: 'exactly what to do, incl. files/paths/commands' },
          complexity: { type: 'string', enum: ['trivial', 'standard', 'complex'] },
          tier: { type: 'string', enum: ['haiku', 'sonnet'], description: 'executor model: haiku for trivial, else sonnet' },
          acceptance: { type: 'string', description: 'objective, checkable definition of done' },
        },
      },
    },
  },
}

const EXEC_SCHEMA = {
  type: 'object',
  required: ['taskId', 'status', 'summary', 'selfCheck'],
  additionalProperties: false,
  properties: {
    taskId: { type: 'string' },
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    summary: { type: 'string', description: 'what you actually did' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'string', description: 'commands run + their result, or how you verified it works' },
    selfCheck: { type: 'boolean', description: 'true only if you verified the acceptance criteria yourself' },
    notes: { type: 'string', description: 'anything the judge should know (assumptions, risks, follow-ups)' },
  },
}

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['goalComplete', 'summary', 'verdicts'],
  additionalProperties: false,
  properties: {
    goalComplete: { type: 'boolean', description: 'true only if the ENTIRE goal is now met and verified' },
    summary: { type: 'string', description: 'reviewer’s status of the goal after this round' },
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['taskId', 'verdict', 'reason'],
        additionalProperties: false,
        properties: {
          taskId: { type: 'string' },
          verdict: { type: 'string', enum: ['accept', 'revise', 'reject'] },
          reason: { type: 'string' },
          requiredFixes: { type: 'string', description: 'precise, actionable fixes when not accepted' },
        },
      },
    },
  },
}

// ── prompt builders ────────────────────────────────────────────────────────────
const planPrompt = (round, accepted, rework) => `You are the PLANNER and lead architect (the top model). You do NOT write code or run
commands yourself — you decompose the goal into tasks that CHEAPER executor models will
carry out, then you route each to the cheapest model that can do it well.

GOAL (drive this to completion):
${GOAL}

You are operating inside the current repository. Round ${round} of at most ${MAX_ROUNDS}.

Already ACCEPTED in earlier rounds (do NOT repeat these):
${accepted.length ? accepted.map(a => `  ✓ ${a}`).join('\n') : '  (nothing yet)'}

REWORK required from the last review (turn these into the FIRST tasks this round):
${rework || '  (none)'}

Produce the NEXT batch of tasks — only what genuinely remains, fixes first. For each:
  • Keep tasks INDEPENDENT and small enough to verify. ${PARALLEL ? 'They will run in parallel, so they MUST touch disjoint files.' : 'They will run one at a time.'}
  • complexity: trivial (mechanical, low-risk) | standard | complex (design judgment / cross-cutting).
  • tier: 'haiku' for trivial, 'sonnet' otherwise. (Executors are Sonnet/Haiku only — never you.)
  • acceptance: an OBJECTIVE, checkable definition of done (a command that passes, a file that contains X, behavior observed).
Investigate the repo as needed (read files, grep) before planning so tasks are concrete.
Set goalComplete=true and return an empty task list ONLY when the goal is fully met.`

const execPrompt = (task) => `You are an EXECUTOR subagent. Do this ONE task completely and correctly. Your final
output is DATA for the reviewer, not a message to a human.

OVERALL GOAL (context): ${GOAL}

YOUR TASK — ${task.title} [${task.id}, ${task.complexity}]
${task.description}

DEFINITION OF DONE (you must satisfy this): ${task.acceptance}

Rules:
  • Actually make the change in the working tree (edit files, run the build/tests/commands needed).
  • VERIFY your own work against the definition of done before you finish; set selfCheck=true only if you did.
  • Keep strictly to this task — do not refactor unrelated code or start other tasks.
  • ${AUTO_COMMIT ? 'You MAY git add + commit your own work with a clear message.' : 'Do NOT commit — leave changes staged/unstaged for review.'}
  • If you are blocked, set status='blocked' and explain precisely what stopped you.
Report exactly what you did, the files you touched, and the evidence (commands + results).`

const judgePrompt = (executed) => `You are the JUDGE (the top model). Independently REVIEW the executors' work against
each task's acceptance criteria. Do not take their word for it — open the files, run the
checks, confirm the behavior. Be skeptical and specific.

OVERALL GOAL: ${GOAL}

EXECUTED THIS ROUND (task + what the executor claims):
${JSON.stringify(executed.map(e => ({ task: { id: e.task.id, title: e.task.title, acceptance: e.task.acceptance }, result: e.exec })), null, 2)}

For each task return a verdict:
  • accept — acceptance criteria genuinely met (you verified it).
  • revise — close, but concrete fixes are needed (give them in requiredFixes).
  • reject — not done, wrong, or unverifiable (say why + what's required).
Then judge the WHOLE goal: set goalComplete=true ONLY if the entire goal is now met and
verified end-to-end — not merely that this round's tasks passed. Verify before you trust.`

// ── the loop ───────────────────────────────────────────────────────────────────
const accepted = []            // titles accepted across rounds (planner's "don't repeat" list)
const ledger = []              // full per-task record for the final report
let rework = ''                // failures carried into the next plan
let report = ''                // Fable's latest status summary
let round = 0
let stopReason = 'reached max rounds'

while (round < MAX_ROUNDS) {
  if (budget.total && budget.remaining() < MIN_RESERVE) { stopReason = 'token budget nearly exhausted'; break }
  round++

  // 1) PLAN — top model, one call
  phase('Plan')
  const plan = await agent(planPrompt(round, accepted, rework), {
    model: TOP_MODEL, effort: 'high', agentType: 'general-purpose',
    schema: PLAN_SCHEMA, phase: 'Plan', label: `plan:r${round}`,
  })
  if (!plan) { stopReason = 'planner returned nothing'; round--; break }
  report = plan.summary || report
  if (plan.goalComplete || !plan.tasks || plan.tasks.length === 0) {
    stopReason = 'goal complete'; round--; break
  }
  log(`round ${round}: planned ${plan.tasks.length} task(s) → [${plan.tasks.map(t => `${t.id}:${t.tier}`).join(', ')}]`)

  // 2) EXECUTE — cheaper models. Sequential by default (safe for shared-file edits);
  //    parallel only when the caller promises the tasks are file-disjoint.
  phase('Execute')
  const runOne = (task) => agent(execPrompt(task), {
    model: task.tier === 'haiku' ? 'haiku' : STD_TIER,
    effort: task.complexity === 'complex' ? 'high' : task.complexity === 'trivial' ? 'low' : 'medium',
    agentType: 'general-purpose', schema: EXEC_SCHEMA, phase: 'Execute', label: `exec:${task.id}`,
  }).then(exec => ({ task, exec }))

  let executed
  if (PARALLEL) {
    executed = (await parallel(plan.tasks.map(t => () => runOne(t)))).filter(Boolean)
  } else {
    executed = []
    for (const t of plan.tasks) executed.push(await runOne(t))
  }
  executed = executed.filter(e => e && e.exec) // drop dead executors

  if (!executed.length) { stopReason = 'all executors failed this round'; break }

  // Trivial + self-verified work is auto-accepted so the top model isn't spent on it.
  const autoOk = executed.filter(e => e.task.complexity === 'trivial' && e.exec.selfCheck && e.exec.status === 'done')
  const toReview = executed.filter(e => !autoOk.includes(e))
  autoOk.forEach(e => { accepted.push(e.task.title); ledger.push({ round, id: e.task.id, title: e.task.title, verdict: 'accept', by: 'self (trivial)' }) })
  if (autoOk.length) log(`  ${autoOk.length} trivial task(s) self-verified — skipping top-model review`)

  // 3) JUDGE — top model, ONE batched call over the non-trivial work.
  let goalComplete = false
  if (toReview.length) {
    phase('Judge')
    const judgement = await agent(judgePrompt(toReview), {
      model: TOP_MODEL, effort: 'high', agentType: 'general-purpose',
      schema: JUDGE_SCHEMA, phase: 'Judge', label: `judge:r${round}`,
    })
    if (!judgement) { stopReason = 'judge returned nothing'; break }
    report = judgement.summary || report
    goalComplete = !!judgement.goalComplete
    const byId = new Map((judgement.verdicts || []).map(v => [v.taskId, v]))
    const fails = []
    for (const e of toReview) {
      const v = byId.get(e.task.id) || { verdict: 'reject', reason: 'no verdict returned', requiredFixes: 'Re-do and report evidence.' }
      ledger.push({ round, id: e.task.id, title: e.task.title, verdict: v.verdict, by: 'fable', reason: v.reason })
      if (v.verdict === 'accept') accepted.push(e.task.title)
      else fails.push(`- [${e.task.id}] ${e.task.title}: ${v.verdict.toUpperCase()} — ${v.reason}. Fix: ${v.requiredFixes || 'address the reason above.'}`)
    }
    rework = fails.join('\n')
    log(`  round ${round} review: ${toReview.length - fails.length} accepted, ${fails.length} need rework`)
  } else {
    rework = ''
  }

  // Done when the judge says the whole goal is met and nothing is queued for rework.
  if (goalComplete && !rework) { stopReason = 'goal complete'; break }
}

// ── final report — one last top-model pass to summarize outcome ─────────────────
phase('Judge')
const finalReport = await agent(
  `You are the lead reviewer. Summarize the outcome of this goal-driven loop for the user.

GOAL: ${GOAL}
Stopped because: ${stopReason} (after ${round} full round(s)).
Task ledger (round · verdict · task):
${ledger.map(l => `  r${l.round} · ${l.verdict.padEnd(6)} · ${l.title}${l.reason ? ` — ${l.reason}` : ''}`).join('\n') || '  (no tasks executed)'}

Write a tight status report: what got done and verified, what remains (if anything), and
the single most important follow-up. Be honest about unfinished or unverified work.`,
  { model: TOP_MODEL, effort: 'high', agentType: 'general-purpose', phase: 'Judge', label: 'final-report' },
)

return {
  goal: GOAL,
  stopReason,
  rounds: round,
  acceptedCount: accepted.length,
  ledger,
  report: finalReport || report,
}
