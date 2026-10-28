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

### Code layout conventions

- **Sections.** Inside each file, related code sits together under a boxed header — a `// ` + 77 `=` bar, a `//   Name` line, another bar (the index builder matches exactly that shape); everything until the next header belongs to that section.
  Put new code in the section it belongs to (or add a header for a new group) — never append it at the bottom of an unrelated section.
- **Comments.** A comment paragraph is one line, however long — the reader scrolls.
  Only a paragraph over ~200 characters is split, one sentence per line.
  Don't hard-wrap comments at 80 columns.
  Lists, aligned tables and example commands inside comments keep their own lines.
- **Contents blocks and `CODE_INDEX.md` are generated** by `scripts/build-index.mjs` — never edit them by hand.
  They are rebuilt automatically: after every Edit/Write of a code file (Claude Code hook in `.claude/settings.json` → `scripts/index-hook.mjs`) and before every `npm start`.
  When editing by hand in an editor, keep `npm run index:watch` running — it rebuilds on every save.
  `npm run index` rebuilds once; `npm run index -- --check` only reports what is stale (exit 1).
- **Purpose text** in `CODE_INDEX.md` is the first sentence of the comment directly above each definition — keep those comments accurate.

## Quick reference

### File map

| File | Owns |
| --- | --- |
| `src/index.js` | Entry point only: Discord client, event wiring, startup log, crash guards (client `error`, `unhandledRejection`) |
| `src/config.js` | Every `.env` setting, parsed once → `config` |
| `src/tickets.js` | Ticket auto-reply: `onTicketMessage` → `handleTicketMessage` → `postSwap` / `postWalletSwaps` |
| `src/watch.js` | Follow-up after a swap is posted: ⏳ / closing message, background re-checks, embed edits |
| `src/ticket-state.js` | Per-ticket memory: swaps shown, known IDs/hashes, serial numbers, "closing soon" rule |
| `src/commands.js` | Slash command definitions (`COMMANDS`) + handlers |
| `src/discord-util.js` | `canReply` (the "is this a ticket?" check), `isStaff`, `messageText`, `quietReply`, `CHANNEL_GONE` |
| `src/meson.js` | Meson API calls, status derivation, swap → display object, wallet listing |
| `src/extract.js` | Finds swap IDs / hashes / links / wallet addresses in free text, in priority order |
| `src/render.js` | Every embed and message text the bot posts |
| `src/decode.js` | 32-byte encoded-swap decoder + amount formatting |
| `src/presets.js` | Chain / token names and per-chain explorer URLs |
| `src/presets.json` | **Generated** by `npm run refresh-presets` — never hand-edit |
| `scripts/register-commands.mjs` | `npm run register` — sends `COMMANDS` to Discord |
| `scripts/lookup.mjs` | `npm run lookup` — one swap from the terminal (smoke test) |
| `scripts/lookup-address.mjs` | `npm run lookup-address` — a wallet's swaps from the terminal |
| `scripts/refresh-presets.mjs` | `npm run refresh-presets` — rebuilds `presets.json` |
| `scripts/build-index.mjs` | `npm run index` — rebuilds every file's Contents block + `CODE_INDEX.md` |
| `scripts/index-hook.mjs` | Claude Code hook: runs the index build after a code file is edited |
| `.claude/settings.json` | Registers that hook (PostToolUse on Edit/Write/MultiEdit) |
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
| Change follow-ups, polling speed, when watching stops | `watchSwap`, `watchDelay` in `src/watch.js` |
| Change how a status is worked out | `deriveStatus` in `src/meson.js` (+ `CONTEXT.md` § Status derivation) |
| Change serial numbers / "ticket will be closed soon" | `serialOf`, `outcomeOpts` in `src/ticket-state.js` |
| Add or change a slash command | `COMMANDS` + `onInteraction` + a `handle<Name>` function in `src/commands.js`, then `npm run register` |
| Add a setting | `src/config.js` (section `Settings`) + `.env.example` + `.env` + README § Settings — every setting must be in `.env`; there are no defaults in code |
| Unknown chain / `token#NN` showing | `npm run refresh-presets` (not a code change) |

### Ticket flow (what happens to one message)

1. `onTicketMessage` (`src/tickets.js`) — skip unless the channel is under a `REPLY_CATEGORY_IDS` category and the bot may post there (`canReply`: View, Send Messages, Embed Links, Read Message History) and the author is neither this bot nor staff.
   Other bots (Ticket Tool's form) are read only for the first `AUTO_SCAN_MESSAGES` bot messages; the user's own messages for the whole ticket.
   Messages are queued so each ticket handles one at a time.
2. `handleTicketMessage` — `extractCandidates` finds every swap-shaped value and orders them: **1 Meson explorer link (its swap ID) → 2 swap ID / encoded swap → 3 source explorer link (its hash) → 4 bare source hash** (Tron/BTC hex, Solana signature).
   Meson-specific before chain-level, and a link (which says what it is) before a bare value.
   `lookupSwap` sends every one through Meson's search, which resolves them all the same way — so the order decides only which is tried first, never what is found.
   (A "swap ID before hash" two-pass lookup was tried and removed: it changed nothing.) Values already known to the ticket are skipped without a lookup; each new swap found is posted (`postSwap`); one already shown is ignored.
3. **5 · Wallet fallback** (`postWalletSwaps`) — only if nothing swap-shaped resolved *and* the ticket shows no swap yet, once per address.
   Lists the wallet's swaps that are not Done or Cancelled.
   If the user's pasted ID was not found, the wallet embed says so (no separate ❓).
4. **❓ "couldn't find"** — only for the user's own message (never the form, which is full of Discord IDs), only if nothing in it resolved and the wallet fallback did not run.
5. `postSwap` → details embed (reply to the user's message, or plain send for the form).
   From the 2nd swap on, embeds are titled `#n` (#1 is re-rendered).
   Then `watchSwap` (`src/watch.js`): closing message if already finished, else ⏳ (only if `status.ok`), then background re-checks that edit the embed on change and reply with the closing message once Done / Cancelled.

### Statuses

Worked out by `deriveStatus` (`src/meson.js`) — the API has no status field.

| Status | Meaning | ⏳ line | Closing message | In wallet list | Watched |
| --- | --- | --- | --- | --- | --- |
| Pending / Posted / Bonded / Locked / Executed / Releasing | still moving | yes | — | yes | yes |
| Done | released to the recipient | — | ✅ Transaction Completed | no | stops |
| Cancelled | funds returned to the initiator | — | ↩️ Transaction Cancelled | no | stops |
| Expired | past deadline; shown as just "not completed in time" — support may still cancel/refund or complete it, so the bot promises nothing | no | — (↩️ if later cancelled) | yes | yes — waits for the cancel |
| Unlocked | LP lock undone, refund pending | no | — (↩️ if later cancelled) | yes | yes — waits for the cancel |
| Failed | an on-chain step reverted (explorer-only, not a Meson status) | no | — | yes | stops — staff handle it |

"Finished" (`isFinished`) = Done or Cancelled. "Ticket will be closed soon" is only added once every *other* swap in the ticket is finished too.

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
npm run index               # rebuild Contents blocks + CODE_INDEX.md (also automatic)
npm run index -- --check    # report stale navigation, change nothing
npm run index:watch         # rebuild on every save while editing by hand
```

There is no test suite.
`npm run lookup` / `npm run lookup-address` against a real swap/address is the smoke test; both hit the live API without connecting to Discord, but still load `.env`.

## Things to know before editing

- **Amounts are `BigInt` in 6-decimal units**, for every token including BTC. Never convert to `Number` — format with `formatAmount` (`src/decode.js`).
- **Upstream reports "not found" as HTTP 400 *or* 404 with an `error` body.** `getJson` checks the body, not the status code.
- **Meson's host has hiccups: it can briefly return an HTML error page, even with HTTP 200, on a correct API path.** This happened in production (a ticket went unanswered).
  `getJson` therefore retries network errors, 5xx *and* non-JSON bodies (`MESON_RETRIES`, waiting 1s, 2s, 4s), and `queueMessage` retries a whole ticket message `TICKET_RETRIES` more times, `TICKET_RETRY_SECONDS` apart, if Meson still errors.
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
- **Nothing may crash the process** — a crash restarts the bot and drops every watch. `index.js` logs Discord client errors and unhandled rejections; `onInteraction` catches a failed reply (e.g. Discord's 3-second window missed). Keep new handlers from throwing.
- **Replies use `quietReply`** (no ping; posts normally if the replied-to message was deleted). Use it for any new reply.
- **Never derive a "took X" duration from `expireTs`** for a swap with no `released` time — the API has no failure timestamp and `expireTs` can be over an hour off.
  Show "expires <relative>" instead (`addressRowValue`).
- **The address endpoint has no total count and `size` ≤ 20.** `list.length === size` is the only "maybe more" signal; it has no status or date filter (checked), so filtering is done locally and bounded by `ADDRESS_LOOKBACK_DAYS` / `ADDRESS_MAX_PAGES`.
- **Releasing never becomes Expired** (Expired applies only before release), so a stuck release is ended only by `SWAP_WATCH_MAX_HOURS` — keep it generous.
- **Never publish secrets.** `.env` (bot token, server/channel/role IDs) and every `.env.*` variant except `.env.example` are git-ignored — keep it that way, keep the token and every ID out of `.env.example` (only non-secret values like `AUTO_SCAN_MESSAGES=6`), and never paste real IDs or tokens into code or docs.
  Throwaway test scripts go in a temp folder, not the project.
- **All state is in memory** (`ticket-state.js`, `watch.js`). A restart forgets every ticket and stops every watch; nothing is re-attached.

## Deliberate choices

- Uses `explorer.meson.fi/api/v1/*`, not the documented `relayer.meson.fi` API, whose swap endpoints return status only — no chains, amount or addresses. See `CONTEXT.md`.
- No API key anywhere; every endpoint used is public.
- Addresses and hashes are shown **in full**, not truncated — staff copy them.
- The details embed is edited in place (silent); the closing message is a new reply (notifies the user). Embeds are never deleted and re-posted.
- User-facing follow-ups (⏳, ✅, ↩️, ❓) are plain text, not embeds.
