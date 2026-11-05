// Prints every test of one person (what it checks, each case, pass/fail and why) as one list.
// Reads the JSON reports the workflow saved in <dir>. On GitHub it also writes the same table
// to the run's Summary page.
// Usage: node tests/shared/report.mjs reports/lam "Lam tests: Packing + Photos"
import { readFileSync, readdirSync, appendFileSync, existsSync } from 'node:fs'

const DIR = process.argv[2]
const TITLE = process.argv[3] || DIR
const ICON = { passed: 'PASS', failed: 'FAIL', skipped: 'SKIP' }
const clean = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').find((l) => l.trim()) || ''

// -> [{ title, cases: [{ name, status, why }] }]
function readVitest(report) {
  const out = []
  for (const file of report.testResults) {
    const cases = file.assertionResults.map((t) => ({
      name: t.title,
      status: t.status === 'passed' ? 'passed' : t.status === 'failed' ? 'failed' : 'skipped',
      why: clean(t.failureMessages[0])
    }))
    out.push({ title: file.assertionResults[0]?.ancestorTitles[0] || file.name, cases })
  }
  return out
}

function readPlaywright(report) {
  const out = []
  for (const file of report.suites) {
    for (const suite of file.suites || []) {
      const cases = suite.specs.map((spec) => {
        const t = spec.tests[0]
        const last = t.results[t.results.length - 1] || {}
        const status = t.status === 'skipped' ? 'skipped' : spec.ok ? 'passed' : 'failed'
        const why = status === 'skipped' ? clean(t.annotations[0]?.description) : clean(last.error?.message)
        return { name: spec.title, status, why }
      })
      out.push({ title: suite.title, cases })
    }
  }
  return out
}

const groups = []
if (existsSync(DIR)) {
  for (const f of readdirSync(DIR).sort()) {
    const report = JSON.parse(readFileSync(DIR + '/' + f, 'utf8'))
    groups.push(...(report.testResults ? readVitest(report) : readPlaywright(report)))
  }
}

const total = { passed: 0, failed: 0, skipped: 0 }
const log = ['══ ' + TITLE + ' ══']
const md = ['## ' + TITLE, '']
for (const g of groups) {
  const passed = g.cases.filter((c) => c.status === 'passed').length
  log.push('', `${g.title}   (${passed}/${g.cases.length} passed)`)
  md.push(`### ${g.title}`, '', '| | Case | Result |', '|---|---|---|')
  for (const c of g.cases) {
    total[c.status]++
    log.push(`  ${ICON[c.status]} ${c.name}` + (c.why ? `\n       → ${c.why}` : ''))
    md.push(`| ${ICON[c.status]} | ${c.name} | ${c.why ? c.why.replace(/\|/g, '\\|') : c.status} |`)
  }
  md.push('')
}
if (!groups.some((g) => g.title.startsWith('E2E'))) {
  const note = 'E2E tests did not run (no E2E_USERNAME / E2E_PASSWORD).'
  log.push('', 'SKIP: ' + note)
  md.push('SKIP: ' + note, '')
}
const line = `TOTAL: ${total.passed} passed, ${total.failed} failed, ${total.skipped} skipped`
md.push(`**${line}**`)

console.log(log.join('\n') + '\n\n' + line)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n')
