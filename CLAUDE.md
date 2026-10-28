# CLAUDE.md

Meson Enquirer — Discord bot for a Meson support server.
A user opens a Ticket Tool ticket and puts a swap ID / transaction hash / explorer link (or just a wallet address) in the form; the bot looks it up on Meson, posts the details into the ticket and follows the swap until it completes.
Anyone can look up a swap with `/meson-query` inside the support ticket categories (who may use it is restricted in Discord's Integrations settings, not in code).

## How to navigate — read this first

1. **Find the area** in the [Quick reference](#quick-reference) below (file map, task map, flows, statuses). That is usually enough to know which file and function to open.
2. **Find the exact line** in [`CODE_INDEX.md`](CODE_INDEX.md) — a generated, line-accurate table of every event, slash command, setting, function and constant, with the section each belongs to.
   Grep it for the symbol, then `Read` that file at that line with a small `limit`.
   Do not read whole files to find something.
3. **Or open the file's own Contents block** — every code file starts (right after its header comment) with a generated list of its sections and their functions/constants, each with its line number.
   Reading the first ~30 lines of a file is enough to know where everything in it is.
4. **Read `CONTEXT.md` only when touching anything that talks to Meson** — endpoints, the encoded-swap layout, status meanings, and which obvious approaches do not work.
   Its first lines (like `README.md`'s) are a generated Contents block listing every section with its line — read that, then only the section you need.

### Code layout conventions

- **Sections.** Inside each file, related code sits together under a boxed header — a `// ` + 77 `=` bar, a `//   Name` line, another bar (the index builder matches exactly that shape); everything until the next header belongs to that section.
  Put new code in the section it belongs to (or add a header for a new group) — never append it at the bottom of an unrelated section.
- **Comments.** A comment paragraph is one line, however long — the reader scrolls.
  Only a paragraph over ~200 characters is split, one sentence per line.
  Don't hard-wrap comments at 80 columns.
  Lists, aligned tables and example commands inside comments keep their own lines.
- **Contents blocks and `CODE_INDEX.md` are generated** by `scripts/build-index.mjs` — never edit them by hand. That includes the heading Contents block (an HTML comment) at the top of every root doc of 150+ lines except `CLAUDE.md`, which is always read whole.
  They are rebuilt automatically: after every Edit/Write of a code file or root doc (Claude Code hook in `.claude/settings.json` → `scripts/index-hook.mjs`), when Claude finishes a turn (`scripts/stop-hook.mjs`) and before every `npm start`.
  When editing by hand in an editor, keep `npm run index:watch` running — it rebuilds on every save.
  `npm run index` rebuilds once; `npm run index -- --check` changes nothing and exits 1 if anything is stale or a doc-drift error is found.
- **The hand-written docs are checked too** (`scripts/doc-checks.mjs`, part of every index run): the file map lists exactly the files in `src/` and `scripts/`; each "Where to look for…" row names functions that are defined in the files that row names; every backticked code name in `CLAUDE.md` / `README.md` exists; settings match across `src/config.js`, `.env.example`, `.env` and README § Settings; slash commands match their table; every npm script is documented and every documented one exists; no hand-written line numbers (point to a heading or name — `CODE_INDEX.md` has the lines); links and #anchors resolve; no unused imports or private definitions.
  Warnings (not failures): a definition without a purpose comment or outside any section, an export no other file uses.
  **When Claude finishes a turn that changed files, the Stop hook runs `--check` and, on drift, sends Claude back once to fix it** — so a change is only finished when its docs are. A turn that changed nothing is never held up.
- **Purpose text** in `CODE_INDEX.md` is the first sentence of the comment directly above each definition — keep those comments accurate.

## Quick reference

### File map

| File | Owns |
| --- | --- |
| `src/index.js` | Entry point only: Discord client, event wiring, startup log + `recoverTickets` + `startExplorerCheck`, crash guards (client `error`, `unhandledRejection`) |
| `src/config.js` | Every `.env` setting, parsed once → `config` |
| `src/tickets.js` | Ticket auto-reply: `onTicketMessage` → `admitMessage` → `handleTicketMessage` → `postSwap` / `postWalletSwaps`; retrying a message while Meson is down (`queueMessage`, `retryDelay`, `worthRetrying`) |
| `src/watch.js` | Follow-up after a swap is posted: ⏳ / closing message, the shared batched check round (`runRound`), embed edits; `syncFollowUps` keeps earlier ⏳ / closing messages labelled |
| `src/ticket-state.js` | Per-ticket memory: swaps shown, known IDs/hashes, serial numbers, "closing soon" rule |
| `src/recover.js` | Restart recovery: on startup rebuilds every ticket from the bot's own messages, resumes its watches, handles messages missed while down |
| `src/commands.js` | Slash command definitions (`COMMANDS`) + handlers |
| `src/explorer-check.js` | Daily check that the explorer's status function still matches our port (`checkExplorerStatus`, `PORTED_FINGERPRINT`); a change is logged as a warning |
| `src/discord-util.js` | `canReply` (the "is this a ticket?" check), `isStaff`, `messageText`, `quietReply`, `CHANNEL_GONE` |
| `src/meson.js` | Meson API calls (incl. batched `getSwaps`, `jitter`), chain health for the ⚠️ network notice, status derivation, swap → display object, wallet listing |
| `src/extract.js` | Finds swap IDs / hashes / links / wallet addresses in free text, in priority order |
| `src/render.js` | Every embed and message text the bot posts, and the readers that recognise them again after a restart |
| `src/decode.js` | 32-byte encoded-swap decoder + amount formatting |
| `src/presets.js` | Chain / token names, Meson network IDs (`chainId`) and per-chain explorer URLs |
| `src/presets.json` | **Generated** by `npm run refresh-presets` — never hand-edit |
| `scripts/register-commands.mjs` | `npm run register` — sends `COMMANDS` (from `src/commands.js`) to Discord |
| `scripts/lookup.mjs` | `npm run lookup` — one swap from the terminal (smoke test) |
| `scripts/lookup-address.mjs` | `npm run lookup-address` — a wallet's swaps from the terminal |
| `scripts/refresh-presets.mjs` | `npm run refresh-presets` — rebuilds `presets.json` |
| `scripts/check-explorer.mjs` | `npm run check-explorer` — the explorer status check from the terminal (`--show` prints the explorer's function for re-porting) |
| `scripts/build-index.mjs` | `npm run index` — rebuilds every file's Contents block, long docs' heading Contents blocks + `CODE_INDEX.md`, then runs the doc checks |
| `scripts/doc-checks.mjs` | The doc-drift checks `build-index.mjs` runs (`checkDocs`): file map, task table, code names, settings, commands, npm scripts, line numbers, links, unused code |
| `scripts/index-hook.mjs` | Claude Code hook: runs the index build after a code file or root doc is edited |
| `scripts/stop-hook.mjs` | Claude Code hook: when Claude finishes a turn that changed files, runs `--check` and sends Claude back once to fix doc drift |
| `.claude/settings.json` | Registers both hooks (PostToolUse on Edit/Write/MultiEdit; Stop) |
| `CODE_INDEX.md` | **Generated** line-level index — never hand-edit |
| `ecosystem.config.cjs` | pm2 definition of the `meson-bot` process |
| `CONTEXT.md` | How the Meson side was reverse-engineered; status meanings |

### Where to look for…

| Task | Go to |
| --- | --- |
| Change any wording the user sees (embeds, ⏳, ✅, ↩️, ❓) | `src/render.js` |
| Change where the bot replies / whose ticket messages are ignored (staff) | `canReply`, `isStaff` in `src/discord-util.js` (`REPLY_CATEGORY_IDS`, `STAFF_ROLE_IDS`) |
| Change what counts as a swap ID / encoding / hash / wallet | `extractCandidates`, `extractAddressCandidates` in `src/extract.js` |
| Change what happens when a ticket message arrives | `handleTicketMessage` in `src/tickets.js` |
| Change the wallet fallback (which swaps, how far back) | `postWalletSwaps` (`src/tickets.js`), `listUnfinishedSwapsForAddress` (`src/meson.js`), `buildUnfinishedAddressEmbeds` (`src/render.js`) |
| Change follow-ups, polling speed, when watching stops, when the ⏳ appears | `watchSwap`, `watchDelay`, `runRound` (the shared check round), `applyCheck`, `postProcessing` in `src/watch.js` (`PROCESSING_MESSAGE_DELAY_SECONDS`) |
| Change what happens while Meson is down (retries, back-off, random spacing) | `getJson` (quick retries), `jitter` in `src/meson.js`; `queueMessage`, `retryDelay`, `worthRetrying` in `src/tickets.js`; `claim` in `src/recover.js` (`MESON_*`, `TICKET_RETRY_*`, `JITTER_PERCENT`) |
| Change the explorer status check (when, how it compares) | `checkExplorerStatus`, `startExplorerCheck`, `PORTED_FINGERPRINT` in `src/explorer-check.js` (`EXPLORER_CHECK_HOURS`) |
| Change how a status is worked out | `explorerStatus` (port of the explorer's — re-port, don't tune) and `deriveStatus` in `src/meson.js` (+ `CONTEXT.md` § Status derivation) |
| Change the ⚠️ network notice (when it shows, wording) | `troubledChainIds`, `addChainHealth` in `src/meson.js` (`CHAIN_HEALTH_CACHE_SECONDS`); `buildChainNotice` in `src/render.js` |
| Change the transaction hashes list (step order, names, what is hidden) | `STEP_ORDER`, `txSteps`, `txValue` in `src/render.js` |
| Change what happens after a restart | `recoverTicket` in `src/recover.js`; the readers `readSwapEmbed`, `readWalletEmbed`, `followUpKind` in `src/render.js` (keep them in step with the message builders) |
| Change serial numbers / "ticket will be closed soon" | `serialOf`, `outcomeOpts` in `src/ticket-state.js`; re-rendering earlier ⏳ / closing messages: `syncFollowUps` in `src/watch.js` |
| Add or change a slash command | `COMMANDS` + `onInteraction` + a `handle<Name>` function in `src/commands.js`, then `npm run register` |
| Add a setting | `src/config.js` (section `Settings`) + `.env.example` + `.env` + README § Settings — every setting must be in `.env`; there are no defaults in code |
| Change the navigation index or what the doc checks enforce | `withToc`, `withMdToc`, `buildCodeIndex` in `scripts/build-index.mjs`; `checkDocs` in `scripts/doc-checks.mjs`; the Stop hook in `scripts/stop-hook.mjs` |
| Unknown chain / `token#NN` showing | `npm run refresh-presets` (not a code change) |

### Ticket flow (what happens to one message)

0. On startup (`recoverTickets`, `src/recover.js`) every ticket is first rebuilt from its history — see "All state is in memory" below; messages missed while down then enter at step 1 (`admitMessage`, `src/tickets.js`).
1. `onTicketMessage` (`src/tickets.js`) — skip unless the channel is under a `REPLY_CATEGORY_IDS` category and the bot may post there (`canReply` in `src/discord-util.js`: View, Send Messages, Embed Links, Read Message History); then `admitMessage` skips this bot's own messages and staff.
   Other bots (Ticket Tool's form) are read only for the first `AUTO_SCAN_MESSAGES` bot messages; the user's own messages for the whole ticket.
   Messages are queued so each ticket handles one at a time.
2. `handleTicketMessage` — `extractCandidates` finds every swap-shaped value and orders them: **1 Meson explorer link (its swap ID) → 2 swap ID / encoded swap → 3 chain explorer link (its hash — source or destination chain) → 4 bare chain hash** (Tron/BTC hex, Solana signature).
   Meson-specific before chain-level, and a link (which says what it is) before a bare value.
   `lookupSwap` sends every one through Meson's search, which resolves them all the same way — so the order decides only which is tried first, never what is found.
   (A "swap ID before hash" two-pass lookup was tried and removed: it changed nothing.) Values already known to the ticket are skipped without a lookup; each new swap found is posted (`postSwap`); one already shown is ignored.
3. **5 · Wallet fallback** (`postWalletSwaps`) — only if nothing swap-shaped resolved *and* the ticket shows no swap yet, once per address.
   Lists the wallet's swaps that are not finished (Done, Released or Cancelled).
   If the user's pasted ID was not found, the wallet embed says so (no separate ❓).
4. **❓ "couldn't find"** — only for the user's own message (never the form, which is full of Discord IDs), only if nothing in it resolved and the wallet fallback did not run (or ran and Meson rejected the address).
5. `postSwap` → details embed (reply to the user's message, or plain send for the form).
   From the 2nd swap on, embeds, ⏳ lines and closing messages carry `#n` — #1's embed, ⏳ and closing message are re-rendered, so every swap's messages are always labelled alike.
   Each new swap also re-renders the earlier closing messages (`syncFollowUps`, `src/watch.js`): "ticket will be closed soon" is dropped from them while the new swap is open.
   Then `watchSwap` (`src/watch.js`): closing message if already finished, else ⏳ (only if `status.ok`; straight away by default, or — if `PROCESSING_MESSAGE_DELAY_SECONDS` is set — held back and posted by a check round only if the swap is still unfinished then), then background re-checks — one shared round for every watched swap in every ticket, batched into one Meson request per 20 swaps (`runRound`, `getSwaps`) — that edit the embed on change and reply with the closing message once finished (Done / Released / Cancelled), deleting the ⏳ line.

### Statuses

The API has no status field. **The heading is always what the Meson explorer shows**: `explorerStatus` (`src/meson.js`) is a line-for-line port of the explorer's own status function; `deriveStatus` title-cases it and adds what the bot does with it. Don't hand-tune statuses — re-port from the explorer (CONTEXT.md § Status derivation).
`src/explorer-check.js` compares the explorer's live status function with our port at startup and every `EXPLORER_CHECK_HOURS` (fingerprint with minified names blanked, so a redeploy alone does not trip it) and logs `!! Meson's explorer changed its status function` when it differs — then re-port, re-verify on real swaps and update `PORTED_FINGERPRINT`.
The explorer's `*` (e.g. "Expired*") is kept: it is `status.star`, shown after `status.label` wherever a status is displayed — code checks only `status.label`.

| Status | Meaning | ⏳ line | Closing message | In wallet list | Watched |
| --- | --- | --- | --- | --- | --- |
| Pending / Requesting / Posted / Bonded / Locked | still moving (whatever the explorer shows before executed confirms) | yes (after `PROCESSING_MESSAGE_DELAY_SECONDS` if set) | — | yes | yes |
| Releasing | executed has confirmed (even past the deadline), or a release is requested / confirming / being retried | yes (after `PROCESSING_MESSAGE_DELAY_SECONDS` if set) | — | yes | yes |
| Done | released to the recipient | — | ✅ Transaction Completed | no | stops |
| Released | released, LP has not executed yet — complete for the user | — | ✅ Transaction Completed | no | stops |
| Cancelled | funds returned to the initiator | — | ↩️ Transaction Cancelled | no | stops |
| Expired | past deadline before executed; shown as "not completed in time — our support team will look into it" — support may still cancel/refund or complete it, so nothing is promised about the outcome | no | — (✅/↩️ once resolved) | yes | yes |
| Unlocked | LP lock undone; shown as "did not go through — our support team will look into it" | no | — (✅/↩️ once resolved) | yes | yes |
| Failed | only failed attempts so far (rare: any other step outranks it); shown as "a step of this transaction failed — our support team will look into it" | no | — (✅/↩️ once resolved) | yes | yes |

"Finished" (`isFinished`) = Done, Released or Cancelled. "Ticket will be closed soon" goes only on the closing message of the swap that finishes last — when every *other* swap in the ticket is finished too; earlier closing messages lose it when a new swap joins and never get it back.

### Slash commands

| Command | Who | What |
| --- | --- | --- |
| `/meson-query swap:<…> [private]` | everyone, but only in `REPLY_CATEGORY_IDS` channels (elsewhere: private 🚫 refusal); restrict *who* in Discord: Server Settings → Integrations (deliberately no role check in code) | One swap's details embed from a swap ID, source/destination hash, or Meson / chain explorer link |

A `/meson-history` command (page through a wallet's history with count / date / status filters) was built and then dropped as unnecessary — do not re-add it unasked.

## Commands

The bot runs under **pm2** as `meson-bot` (defined in `ecosystem.config.cjs`), alongside the machine's other bots. After changing code, restart it there — do not start a second copy with `npm start`:

```bash
pm2 restart meson-bot       # pick up code / .env changes
pm2 logs meson-bot          # live log (startup line, posted swaps, errors)
pm2 save                    # after adding/removing pm2 apps, so reboots restore them
```

Start-on-reboot: the Windows scheduled task "PM2 Resurrect on Login" runs `pm2 resurrect` at login, restoring everything last `pm2 save`d.

```bash
npm install
npm start                   # run in the foreground (testing only — stop meson-bot in pm2 first)
npm run register            # register slash commands (needs APPLICATION_ID)
npm run lookup -- <swap id | tx hash | explorer link | ticket text>
npm run lookup-address -- <address | explorer link> [page] [--unfinished]
npm run refresh-presets     # after Meson adds a chain or token
npm run check-explorer      # does the explorer's status logic still match our port? (-- --show prints it)
npm run index               # rebuild Contents blocks + CODE_INDEX.md (also automatic)
npm run index -- --check    # report stale navigation and doc drift, change nothing (exit 1)
npm run index:watch         # rebuild on every save while editing by hand
```

There is no test suite.
`npm run lookup` / `npm run lookup-address` against a real swap/address is the smoke test; both hit the live API without connecting to Discord, but still load `.env`.

## Things to know before editing

- **Amounts are `BigInt` in 6-decimal units**, for every token including BTC. Never convert to `Number` — format with `formatAmount` (`src/decode.js`).
- **Upstream reports "not found" as HTTP 400 *or* 404 with an `error` body.** `getJson` checks the body, not the status code.
- **Meson's host has hiccups: it can briefly return an HTML error page, even with HTTP 200, on a correct API path.** This happened in production (a ticket went unanswered).
  `getJson` therefore retries network errors, 429, 5xx *and* non-JSON bodies (`MESON_RETRIES`, waiting about 1s, 2s, 4s), and `queueMessage` (and restart recovery) retries a whole ticket message **until it works** if Meson still errors — waiting `TICKET_RETRY_SECONDS`, doubling up to `TICKET_RETRY_MAX_SECONDS` (`retryDelay`); it stops only when the ticket is gone or Discord refused the bot's request (4xx, e.g. Missing Permissions) — `worthRetrying`.
  Never add a give-up limit: a ticket must always be answered, however late. The same goes for `watchSwap`: a failed re-check never ends a watch.
  Swaps are always re-checked in batches (`getSwaps`, also in restart recovery), never one request per swap — keep it that way.
  The batch is the primary path. It is undocumented, so `getSwaps` looks up on its own any swap the batch failed to deliver (left out, or the batch request failed — e.g. an HTML 404 if the route is removed). If those single lookups find swaps, the batch has stopped working: it is skipped for an hour (`BATCH_PAUSE_MS`, logged), then tried again — so it is back as soon as Meson restores it. A real outage fails the single lookups too, so it never pauses the batch.
  Every repeated wait goes through `jitter` (`src/meson.js`, `JITTER_PERCENT`) so requests never come at a fixed beat — use it for any new timer that calls Meson.
  Only "not found" is final.
  Don't make non-JSON "fatal" again.
- **An unknown or malformed wallet address is not an error** — the address endpoint returns an empty list (HTTP 200).
- **`src/presets.json` is generated.** Fix the extractor, not the JSON. It must keep "later definitions win" (see `CONTEXT.md`) or tokens get mislabelled on re-indexed chains.
- **Solana wallets vs signatures.** Wallet addresses are base58, 32–44 chars; transaction signatures 86–88.
  `SOLANA_SIGNATURE` in `src/extract.js` starts at 80 so a wallet is never looked up as a swap — keep that gap.
- **`allowFallback: false`** when scanning tickets for addresses — without it any sentence "matches" as an address. The CLI is the only caller that wants the fallback.
- **Where auto-reply runs: channels under a `REPLY_CATEGORY_IDS` category** (threads count by their parent channel's category), and only where the bot has View / Send / Embed / Read History. `canReply` skips any other channel before any lookup. `/meson-query` uses the same category check (`inReplyCategory`) but not the permission check — interaction replies need no Send Messages.
  In a private category the bot's role must be a support role on the Ticket Tool panel — ticket channels get the panel's overwrites, not the category's.
- **`.env` must be complete — the code has no defaults.** `src/config.js` stops the process if a line is missing or invalid. That applies to everything that loads it: the bot, `npm run register`, the lookup CLIs (via `src/meson.js`) and `npm run index` (it imports `src/commands.js`).
  A new setting therefore goes into `src/config.js`, `.env.example`, `.env` and README § Settings together.
- **MESSAGE CONTENT privileged intent is required** to read Ticket Tool's embed. Without it the bot silently never replies in tickets.
- **Nothing may crash the process** — a crash restarts the bot; recovery resumes the watches, but anything mid-send is lost and the restart costs a burst of startup requests. `index.js` logs Discord client errors and unhandled rejections; `onInteraction` catches a failed reply (e.g. Discord's 3-second window missed). Keep new handlers from throwing.
- **Replies use `quietReply`** (no ping; posts normally if the replied-to message was deleted). Use it for any new reply.
- **Only the request time is shown** — on the details embed and in the wallet list. Expiry, completion time and "took X" were removed at the support team's request; don't re-add them unasked.
  Never derive a "took X" duration from `expireTs` — the API has no failure timestamp and `expireTs` can be over an hour off.
- **The address endpoint has no total count and `size` ≤ 20.** `list.length === size` is the only "maybe more" signal; it has no status or date filter (checked — `failed=true` is accepted but only filters for Meson's admins), so filtering is done locally and bounded by `ADDRESS_LOOKBACK_DAYS` / `ADDRESS_MAX_PAGES`.
- **The ⚠️ network notice is only a hint.** `fetchChainHealth` swallows every error (logged) and returns "no known problems"; a health failure must never fail or delay a swap lookup. One cached request (`CHAIN_HEALTH_CACHE_SECONDS`) serves every lookup.
- **Releasing never becomes Expired** (the explorer checks EXECUTED before the deadline), so a stuck release is ended only by `SWAP_WATCH_MAX_HOURS` — keep it generous.
- **Never publish secrets.** `.env` (bot token, server/channel/role IDs) and every `.env.*` variant except `.env.example` are git-ignored — keep it that way, keep the token and every ID out of `.env.example` (only non-secret values like `AUTO_SCAN_MESSAGES=6`), and never paste real IDs or tokens into code or docs.
  Throwaway test scripts go in a temp folder, not the project.
- **All state is in memory** (`ticket-state.js`, `watch.js`), and **Discord is the backup**: on startup `recover.js` reads every ticket channel, rebuilds each ticket from the bot's own messages (details embeds in posting order = `#n`; ⏳ / ✅ / ↩️ by the embed they reply to; wallet embeds), resumes every unfinished swap (`watchSwap` `resumed` — no second ⏳, and a ⏳ still held back at the restart is not posted; a swap that finished while down gets its closing message) and handles messages posted after the bot's last one as if new. Live messages wait in the ticket queue until its recovery is done.
  So **the bot's message formats are its saved state**: changing a title, a URL, a follow-up's first characters or the reply-to structure means changing the readers in `render.js` § Recognising our own messages too, or tickets stop being recovered. The bot writes no file anywhere (only the dev tooling writes: the generated index files and the Stop hook's fingerprint in `.git/`).

## Deliberate choices

- Uses `explorer.meson.fi/api/v1/*`, not the documented `relayer.meson.fi` API, whose swap endpoints carry event hashes, chains, tokens and amounts but no wallet addresses, failed attempts or pending flags — not enough for the details embed or the explorer's status. Other public Meson endpoints (limits, pool liquidity, chain RPC health) are listed in `CONTEXT.md` § Other public endpoints.
- No API key anywhere; every endpoint used is public.
- Addresses and hashes are shown **in full**, not truncated — staff copy them.
- The details embed is edited in place (silent); the closing message is a new reply (notifies the user). Embeds are never deleted and re-posted.
  The ⏳ line is the one message the bot deletes — once the closing message is up (also after a restart, via recovery).
  ⏳ and closing messages are edited only to renumber them or drop "closed soon" when another swap joins the ticket (silent edits).
- User-facing follow-ups (⏳, ✅, ↩️, ❓) are plain text, not embeds.
