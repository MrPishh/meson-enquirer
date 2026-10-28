# Context: how Meson swap data was sourced

Everything here was established empirically against live Meson endpoints on 2026-10-27 and verified field-by-field against the rendered explorer page.
This file exists so nobody has to repeat the reverse-engineering.

## The problem

A support ticket needs: transaction hash, from chain, to chain, amount, wallet address, explorer link. No single Meson endpoint returns all of that.

## What the documented API does and does not give you

The official docs at <https://meson.dev> describe a relayer API:

| Endpoint | Returns |
| --- | --- |
| `GET relayer.meson.fi/api/v1/swap?hash=<tx>` | event hashes + `expired` only |
| `GET relayer.meson.fi/api/v1/swap/<swapIdOrEncoded>` | event hashes + `expired` only |
| `GET relayer.meson.fi/api/v1/list` | chains + token symbols/decimals/addresses |

The two `swap` endpoints are **status-only**.
They return a map like `{BONDED, LOCKED, EXECUTED, RELEASED}` of transaction hashes plus an `expired` flag — no chains, no amount, no addresses.
So the documented API alone cannot answer a support ticket.

`/api/v1/list` returns 43 chains with real token symbols (it correctly reports that `usdt` on BNB displays as `BSC-USD`), but it carries **no `tokenIndex` and no `slip44`**, which are exactly the two numbers an encoded swap contains — so it cannot decode a swap, and the bot does not use it.

## What the explorer API gives you

The explorer is a Next.js app.
The swap page is *not* server-rendered with data — the HTML contains only the swap ID — so the data comes from client-side calls on the explorer's own origin.
All work unauthenticated, with no API key:

```
GET https://explorer.meson.fi/api/v1/search?q=<anything>
    -> {"result":{"swapId":"0x…"}}

GET https://explorer.meson.fi/api/v1/swap/<swapId>
    -> {"result":{ _id, encoded, events[], srFee, lpFee, initiator,
                   fromTo[from,to], created, executed, released, batchTo }}

GET https://explorer.meson.fi/api/v1/address/<address>/swap?page=0&size=10
    -> {"result":{"list":[ <same shape as /api/v1/swap/<id>, repeated> ]}}
```

`search` is the useful discovery: one endpoint resolves **all** of these to a swap ID — swap ID, encoded swap, EVM transaction hash, and Solana signature (base58).
Verified against all four.
Unknown input returns `{"error":{"code":-32602,"message":"Swap not found"}}` with HTTP 400 *or* 404 (`/api/v1/swap/<id>` uses 400), so error handling must look at the body, not the status.

`/api/v1/address/<address>/swap` returns every swap the address took part in on *either* side (sender or recipient), newest first — this is what backs the explorer's "Swaps for Address" page.
It takes `page` (0-based) and `size`.
There is no total-count field in the response; `list.length === size` is the only signal that another page might exist, confirmed against a real address with 14 swaps across two pages of 10.
Each list entry is the exact same record shape as the single-swap endpoint, so the same decode/status logic applies unchanged — `toSwapView()` in `src/meson.js` is shared by both.

Limits of the address endpoint (checked against the live API and the explorer's own front-end code):

- `size` above 20 is rejected: `{"error":{"code":-32602,"message":"Size cannot exceed 20"}}`.
- There is **no status or date filter**.
  The front-end only ever adds `failed=true` or `rewardId=…`; `failed=true` returned a Done swap, so it does not filter either.
  Made-up params (`status=`, `type=`, …) are ignored.
- `/api/v1/address/<address>/export` exists but answers 401 without a login.

So "this wallet's unfinished swaps" can only be found by paging newest-first and filtering locally, which is why the bot bounds it by age and page count.

## The encoded swap

`result.encoded` is Meson's 32-byte packed swap.
The chains, amount and tokens live only in here — the explorer unpacks it in the browser.
Layout (big-endian, offsets inclusive-exclusive), confirmed byte-for-byte:

```
[0,1)   version
[1,6)   amount     always 6 decimals, whatever the token's own decimals are
[6,16)  salt
[16,21) fee        the LP fee, same 6-decimal units
[21,26) expireTs   unix seconds
[26,28) outChain   SLIP-44 coin type, e.g. 0x02ca = 714 = BNB
[28,29) outToken   Meson token index, scoped to outChain
[29,31) inChain
[31,32) inToken
```

Worked example — swap `0x1f399b60…`, encoded `0x01001563e611d80000000000ab47eb9b0000027100006ae0616702ca2201f502`:

| Field | Decoded | Explorer page shows |
| --- | --- | --- |
| amount | 358868497 → 358.868497 | `358.868497 USDT` |
| fee | 160000 → 0.16 | `0.16` |
| inChain / inToken | `0x01f5` (501) / 2 | `Solana` / `USDT` |
| outChain / outToken | `0x02ca` (714) / 34 | `BNB Smart Chain` / `BSC-USD` |

Amounts are 6-decimal **regardless of the token**, including 8-decimal BTC: swap `0x3b1fde45…` decodes to `0.00052 WBTC → 0.000479 BTC`, matching the page.

Received amount = `amount - srFee - lpFee`. The encoded `fee` equals `lpFee`; `srFee` (service fee) is only in the JSON, so use the JSON for the total.

## Chain and token names

Only one published source carries both `shortSlip44` and `tokenIndex`: the explorer's preset table, embedded in a webpack chunk (not served from any endpoint).
`scripts/refresh-presets.mjs` extracts it into `src/presets.json` (87 mainnet chains).

**The bundle ships two preset generations.** The older one has global token indexes (`1=USDC, 2=USDT`); the current one has per-chain indexes where BNB's `34` is `BSC-USD`.
The extractor takes **later definitions win** — getting this backwards silently mislabels every token on chains that were re-indexed.

Testnets share a `shortSlip44` with their mainnet (`bnb-testnet` is also `0x02ca`), so the extractor filters testnets out before keying by slip44.

## Status derivation

The API has no status field. It is derived from `events[]` + `expireTs`:

- any event name containing `FAILED` → Failed (e.g. `EXECUTED:FAILED`)
- `CANCELLED` → Cancelled
- `RELEASED` with `pending: true` → Releasing (destination tx still confirming)
- `RELEASED` → Done
- `UNLOCKED` → Unlocked (LP's target-chain lock undone; refund via a later CANCELLED)
- past `expireTs` with no release → Expired
- otherwise the furthest of POSTED / BONDED / LOCKED / EXECUTED

What each event means, per meson.dev (`/api/endpoints/check-swap`):

| Event | Chain | Meaning |
| --- | --- | --- |
| POSTED | initial | takes the user's incoming funds (into the Meson contract) |
| BONDED | initial | an LP bonds the swap |
| LOCKED | target | LP locks funds for the swap |
| RELEASED | target | funds released to the recipient |
| EXECUTED | initial | the user's posted funds transferred to the LP |
| UNLOCKED | target | LP's lock undone (swap did not go through) |
| CANCELLED | initial | funds returned to the initiator |

So the user's funds leave their wallet at POSTED.
By those descriptions EXECUTED is the LP collecting, which should follow RELEASED — yet the explorer often lists only EXECUTED + RELEASED (no POSTED), so treat event order and presence as observed, not guaranteed.
The `detail` text `deriveStatus` shows for each step uses the wording above.

The bot treats only **Done** and **Cancelled** as finished (`isFinished`): nothing is left to chase. Expired and Unlocked still await a refund (CANCELLED), and Failed needs a human.

**Expired** per the docs: the swap "cannot be executed on the Meson contract thereafter, and funds remain in `fromAddress`" — that is the never-POSTED case.
If it *was* POSTED, the funds are in the contract until a CANCELLED returns them.
The docs say an API-submitted swap expires after 10 minutes if blocked, but the window in `expireTs` varies (≈90 min has been observed).

Because of that, the bot's Expired text says only **"the swap was not completed in time"** — nothing about where the funds are or whether it can still go through.
Support may be able to cancel and refund it, or (if the funds are in the contract) push it to completion, so any stronger wording could be wrong.

**`REQUESTING`** is a further event the explorer returns that the docs do not list — seen alone on an expired swap, with **no `hash`** (asked for, never on-chain).
`deriveStatus` does not map it, so such a swap reads as Pending, or Expired once past `expireTs`; the details embed shows it as "no transaction yet".
Any event can lack a hash, so render code must not assume one.

**Failed is not a Meson status.** The docs list no `:FAILED` events; they come only from the explorer API, meaning one transaction for that step reverted.
Whether Meson retries afterwards is undocumented.

## Per-chain explorer links

`presets.json` carries each chain's `explorer` base and `addressFormat`.
The transaction path differs by format: `/tx/` for most, `/transaction/` for Tron, CKB and TON, `/txn/` for Aptos (which also needs `?network=mainnet`), `/txblock/` for Sui.
Tron's `explorer` value already ends in `/#`.

Source-side events (bonded/executed) are on the **in** chain; `RELEASED` is on the **out** chain. Linking them to the wrong chain is an easy mistake.

## Things that will break this

- The explorer API is not a documented, versioned contract.
  If `/api/v1/search` or `/api/v1/swap/<id>` changes shape, the bot breaks.
  The documented relayer endpoints are the fallback for *status*, but they cannot supply chains/amount/addresses.
- If the explorer bundle's preset layout changes, `refresh-presets.mjs` throws rather than writing a truncated table (it requires ≥40 chains).
- New chains and tokens show up as `Unknown chain (0x…)` / `token#NN` until `npm run refresh-presets` is run.
- The API never reports *when* a swap failed or was cancelled — only `released` (a real completion time) and `expireTs` (when it stops being executable).
  Don't compute a "took X" duration from `expireTs` for a non-released swap (see `addressRowValue` in `src/render.js`); it measures time to expiry, not time to failure, and the two can differ by over an hour.
