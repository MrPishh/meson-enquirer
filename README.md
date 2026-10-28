# Meson Enquirer

Meson Enquirer is a Discord bot for a Meson support server.
When someone opens a ticket and puts a swap ID, a transaction hash or an explorer link into the Ticket Tool form, the bot looks the swap up and posts the details straight into the ticket:

- status — always the same one the Meson explorer shows (pending / releasing / done / cancelled / expired, …)
- from chain and sender address, to chain and recipient address
- amount sent → amount received, with tokens
- one transaction hash per step (executed, releasing / released, cancelled, …), each linked to the right chain's explorer
- request time, and the Meson explorer link

It then follows the swap: the details update themselves as the status changes, and the user gets a **✅ Transaction Completed** or **↩️ Transaction Cancelled** message when it finishes.

If the ticket has only a wallet address, the bot lists that wallet's recent swaps that are **not** finished (done, released or cancelled).

In those same ticket channels, anyone can also run `/meson-query` with a swap ID, source/destination hash or explorer link to see one swap's details. To limit who can use it, go to **Server Settings → Integrations → (the bot)**.

No API key is needed — the Meson endpoints it uses are public.

## Running it

Needs **Node.js 20.10 or newer**, [pm2](https://pm2.keymetrics.io/) to keep it running, and [Ticket Tool](https://tickettool.xyz/) for the tickets.

What this bot needs that is easy to miss:

- **MESSAGE CONTENT intent** (Developer Portal → Bot → Privileged Gateway Intents). Without it Ticket Tool's form arrives empty and the bot silently never replies.
- **Invite** with scopes `bot` + `applications.commands` and permissions **View Channel, Read Message History, Embed Links**. Leave out Send Messages here: the bot gets it only in ticket channels (through the category or the Ticket Tool panel), so it cannot post anywhere else.
- **Where it auto-replies:** only in channels (and their threads) under the `REPLY_CATEGORY_IDS` categories, and only where it has View Channel, Send Messages, Embed Links and Read Message History. Every other channel is ignored without looking anything up. In a private category, add the bot's role as a support role on the Ticket Tool panel — ticket channels get the panel's permissions, not the category's.
- `/meson-query` works only in the same `REPLY_CATEGORY_IDS` channels; anywhere else it answers with a private "can only be used in support ticket channels".

```bash
npm install
cp .env.example .env               # then fill in BOT_TOKEN, APPLICATION_ID, GUILD_ID, REPLY_CATEGORY_IDS, STAFF_ROLE_IDS
npm run register                   # once, and again after changing a slash command
pm2 start ecosystem.config.cjs     # runs it as "meson-bot"; then: pm2 save
```

`pm2 restart meson-bot` after changing code or `.env`; `pm2 logs meson-bot` to watch it.
To start it on boot: `pm2 startup` on Linux/macOS; on Windows (where that is not supported) a scheduled task that runs `pm2 resurrect` at login.

## Settings

Every setting is a line in `.env` and only there — the code has no defaults, and the bot refuses to start (naming the line) if one is missing or invalid.
After editing, `pm2 restart meson-bot`.
IDs: turn on Developer Mode in Discord, then right-click the server / role → Copy ID.

| Setting | What it does |
| --- | --- |
| `BOT_TOKEN` | The bot's login. Never share it. |
| `APPLICATION_ID` | Needed by `npm run register`. |
| `GUILD_ID` | Your server: `/meson-query` is registered there and appears at once. Blank = all servers, which can take up to an hour. |
| `REPLY_CATEGORY_IDS` | The ticket categories, comma separated. The bot auto-replies only in channels under them (and threads in those channels). Right-click a category → Copy ID. `/meson-query` is limited to the same channels. |
| `STAFF_ROLE_IDS` | Members with any of these roles are ignored, so IDs staff paste while investigating are not looked up. (Who may use `/meson-query` is set in Discord: Server Settings → Integrations.) |
| `AUTO_SCAN_MESSAGES` | How many messages from other bots (Ticket Tool's form) are read at the start of a ticket. The user's own messages are read for the whole ticket. |

**Wallet address lookups** — a ticket with only a wallet address gets that wallet's swaps that are not finished (done, released or cancelled). Meson cannot filter by status, so the bot reads newest-first, 20 per page, and stops at whichever limit comes first:

| Setting | What it does |
| --- | --- |
| `ADDRESS_LOOKBACK_DAYS` | Stop at swaps older than this many days. |
| `ADDRESS_MAX_PAGES` | Stop after this many pages (10 = the newest 200 swaps). |

**Following a swap until it finishes** — checks slow down the longer a swap stays unfinished:

| Setting | What it does |
| --- | --- |
| `SWAP_WATCH_INTERVAL_SECONDS` | Check this often at first. `0` = don't follow swaps (the closing note is then only posted if the swap was already finished). |
| `SWAP_WATCH_SLOWER_AFTER_MINUTES` / `SWAP_WATCH_SLOWER_INTERVAL_SECONDS` | From this many minutes after posting, check this often instead. |
| `SWAP_WATCH_SLOWEST_AFTER_MINUTES` / `SWAP_WATCH_SLOWEST_INTERVAL_SECONDS` | From this many minutes (not less than the line above), check this often. |
| `SWAP_WATCH_MAX_HOURS` | Stop following after this long. Keep it generous — a swap can sit in "Releasing" for many hours. |

**When Meson's site is down** — it sometimes serves an error page for a moment:

| Setting | What it does |
| --- | --- |
| `MESON_TIMEOUT_SECONDS` | Give up on one request after this long. |
| `MESON_RETRIES` | Retry a failed request this many times, waiting 1s, 2s, 4s, … between tries. |
| `TICKET_RETRIES` / `TICKET_RETRY_SECONDS` | If it still fails, handle the whole ticket message again this many more times, this far apart. The same applies to rebuilding a ticket after a restart. |

## Checking it works without Discord

```bash
npm run lookup -- 0x1f399b606262b630e544f05cf09260f653ddc970aac581cc4c55d988a254a730
npm run lookup -- https://explorer.meson.fi/swap/0x1f399b60...
npm run lookup -- "my swap 0x047b1882... is stuck"

npm run lookup-address -- 0x91ce0e9676397b160e88a6789253d77bbeb87460              # newest 10
npm run lookup-address -- 0x91ce0e9676397b160e88a6789253d77bbeb87460 2            # page 2
npm run lookup-address -- 0x91ce0e9676397b160e88a6789253d77bbeb87460 --unfinished # what a ticket shows
```

Grab a real swap ID or address from <https://explorer.meson.fi>.

## What the user can paste

Anything the explorer's search resolves, alone or buried in a sentence, backticks or bold:

- the swap ID (`0x` + 64 hex) or the encoded swap
- the **source** or **destination** transaction hash (incl. Solana signatures and un-prefixed Tron/Bitcoin hashes)
- a Meson explorer link, or a chain explorer link (Etherscan, Solscan, Tronscan, mempool.space, …)
- a wallet address — used only when nothing above is found

## Behaviour in a ticket

- **What is read:** Ticket Tool's form (the first `AUTO_SCAN_MESSAGES` bot messages) and every later message the user posts. Staff messages are ignored.
- **One embed per swap.** Each new swap gets its own details embed; the same swap again (its ID or either hash) is ignored. With several swaps, embeds are numbered #1, #2, …
- **Follow-ups**, as plain-text replies to the swap's embed (numbered "Swap #n" like the embeds when there are several):
  - ⏳ "being processed" while a swap is moving normally — deleted once the closing message is posted;
  - ✅ Transaction Completed / ↩️ Transaction Cancelled when it finishes — plus "this ticket will be closed soon" once every swap in the ticket is finished (if another swap is added later, the earlier messages get their "Swap #1" and lose "closed soon" until it finishes too);
  - Expired, Unlocked and Failed swaps get no ⏳; the bot keeps watching and posts ✅ / ↩️ once the team resolves them.
- **Transaction hashes:** one entry per step, in process order, with the latest hash — failed attempts are not listed (they stay on the explorer). The release reads releasing → releasing (confirming) → released.
- **Live updates.** The details embed is edited in place as the status changes (timing: the `SWAP_WATCH_*` settings).
- **Wallet only.** If no swap is found and the ticket shows none yet, the bot lists the wallet's unfinished swaps (limits: the `ADDRESS_*` settings). A wallet pasted after a swap is shown is ignored.
- **Not found.** If the user pastes something swap-shaped that Meson does not know, the bot says so. The form never gets this reply — Ticket Tool embeds are full of Discord IDs and other hex-ish noise.
- **Restarts lose nothing.** On startup the bot reads every open ticket, rebuilds it from its own messages, carries on following each unfinished swap (updating the embed, posting ✅ / ↩️, removing ⏳ — including for swaps that finished while it was down) and answers messages users sent while it was offline.

## Maintenance

When a swap shows `Unknown chain (0x…)` or `token#34`, Meson has added a chain or token:

```bash
npm run refresh-presets
```

It rebuilds `src/presets.json` from the live explorer, and refuses to write a truncated table — if Meson changes their bundle layout it fails loudly rather than mislabelling swaps.

## For developers

- `CLAUDE.md` — orientation: file map, "where to look for…", ticket flow, status table, rules to know before editing.
- `CONTEXT.md` — the Meson side: endpoints, the 32-byte encoded-swap layout, status meanings, and why the documented relayer API is not enough.
- `CODE_INDEX.md` and each code file's "Contents" block are generated line-accurate indexes, rebuilt before every `npm start` and after Claude Code edits a code file. When editing by hand, keep `npm run index:watch` running.
- `.env` is git-ignored (so is every `.env.*` except `.env.example`, which holds no token or IDs). Check `git status` before a first push.

## License

[MIT](LICENSE) — anyone may use, copy, modify and share it, as long as the license notice is kept.
Not affiliated with Meson; it only reads Meson's public explorer.
