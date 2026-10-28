/**
 * CLI: look up one swap exactly as a ticket would. Never connects to Discord, but loads `.env` like everything else.
 *
 *   npm run lookup -- 0x1f399b60...        (swap ID)
 *   npm run lookup -- 0x3eaab6f7...        (destination tx hash)
 *   npm run lookup -- https://explorer.meson.fi/swap/0x1f39...
 *   npm run lookup -- "hi my swap 4tki5u7X... is stuck"
 */
import { lookupSwap } from '../src/meson.js'
import { extractCandidates } from '../src/extract.js'
import { chainCount, generatedAt } from '../src/presets.js'

const input = process.argv.slice(2).join(' ').trim()
if (!input) {
  console.error('usage: npm run lookup -- <swap id | tx hash | explorer link | ticket text>')
  process.exit(2)
}

const candidates = extractCandidates(input)
console.log(`presets: ${chainCount} chains (generated ${generatedAt})`)
console.log(`candidates: ${candidates.length ? candidates.join(', ') : '(none — using raw input)'}\n`)

let lastErr
for (const query of candidates.length ? candidates : [input]) {
  try {
    const s = await lookupSwap(query)
    console.log(`matched     ${query}`)
    console.log(`status      ${s.status.label}${s.status.detail ? ` (${s.status.detail})` : ''}`)
    console.log(`swap id     ${s.swapId}`)
    console.log(`from        ${s.from.chain} — ${s.from.amount} ${s.from.token}`)
    console.log(`            ${s.from.address}`)
    console.log(`to          ${s.to.chain} — ${s.to.amount} ${s.to.token}`)
    console.log(`            ${s.to.address}`)
    console.log(`fee         ${s.fee.total} ${s.to.token} (service ${s.fee.service} + LP ${s.fee.lp})`)
    console.log(`requested   ${s.requestedAt?.toISOString() ?? '—'}`)
    console.log(`released    ${s.releasedAt?.toISOString() ?? '—'}`)
    console.log(`expires     ${s.expiresAt?.toISOString() ?? '—'}`)
    console.log(`explorer    ${s.explorerUrl}`)
    for (const e of s.events) console.log(`  ${e.name.padEnd(16)} ${e.url ?? e.hash ?? '(no transaction yet)'}`)
    process.exit(0)
  } catch (err) {
    lastErr = err
  }
}
console.error(`lookup failed: ${lastErr?.message ?? 'unknown error'}`)
process.exit(1)
