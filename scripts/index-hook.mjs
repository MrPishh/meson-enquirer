/**
 * Claude Code PostToolUse hook (.claude/settings.json): after an Edit/Write to a .js/.mjs file under src/ or scripts/, rebuild the Contents blocks and CODE_INDEX.md so their line numbers match the edited code.
 *
 * Reads the hook payload (JSON) from stdin; does nothing for other files.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

let raw = ''
process.stdin.on('data', (c) => { raw += c })
process.stdin.on('end', () => {
  let file = ''
  try { file = JSON.parse(raw).tool_input?.file_path ?? '' } catch {}
  if (!/[\\/](src|scripts)[\\/][^\\/]+\.m?js$/.test(file)) return
  const root = fileURLToPath(new URL('../', import.meta.url))
  // Quiet on success; errors still reach stderr so a broken index is noticed.
  execFileSync(process.execPath, ['scripts/build-index.mjs'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
})
