/**
 * Claude Code PostToolUse hook (.claude/settings.json): after an Edit/Write to a .js/.mjs file under src/ or scripts/, or to a doc in the project root, rebuild the Contents blocks and CODE_INDEX.md so their line numbers match the edited file.
 * Doc drift is only reported here (mid-change the docs are expected to lag); the Stop hook (scripts/stop-hook.mjs) is what asks for it to be fixed.
 *
 * Reads the hook payload (JSON) from stdin; does nothing for other files.
 */
import { execFileSync } from 'node:child_process'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

let raw = ''
process.stdin.on('data', (c) => { raw += c })
process.stdin.on('end', () => {
  let file = ''
  try { file = JSON.parse(raw).tool_input?.file_path ?? '' } catch {}
  const root = fileURLToPath(new URL('../', import.meta.url))
  // A code file in src/ or scripts/, or a doc in the project root (its heading Contents block).
  const rel = relative(root, file).replace(/\\/g, '/')
  if (!/^(src|scripts)\/[^/]+\.m?js$/.test(rel) && !/^[^/]+\.md$/.test(rel)) return
  // Quiet on success; errors still reach stderr so a broken index is noticed.
  execFileSync(process.execPath, ['scripts/build-index.mjs'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
})
