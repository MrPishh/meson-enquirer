/**
 * `npm run check-explorer` — check from the terminal whether the Meson explorer's status function still matches our port (`explorerStatus` in src/meson.js), the same check the bot runs daily.
 *
 *   npm run check-explorer           match / changed, with the fingerprints
 *   npm run check-explorer -- --show also print the explorer's current function, for re-porting
 *
 * Exit code 1 when the function changed or cannot be found.
 */
import { checkExplorerStatus, PORTED_FINGERPRINT } from '../src/explorer-check.js'

try {
  const r = await checkExplorerStatus()
  console.log(`explorer chunk  ${r.chunk}`)
  console.log(`fingerprint     ${r.fingerprint}${r.matches ? '  — matches the port' : `  — CHANGED (port matches ${PORTED_FINGERPRINT})`}`)
  if (!r.matches) console.log('\nRe-port explorerStatus in src/meson.js (CONTEXT.md § Status derivation), re-check it on real swaps, then set PORTED_FINGERPRINT in src/explorer-check.js.')
  if (process.argv.includes('--show') || !r.matches) console.log(`\n${r.code}`)
  process.exit(r.matches ? 0 : 1)
} catch (err) {
  console.error(`check failed — ${err.message}`)
  process.exit(1)
}
