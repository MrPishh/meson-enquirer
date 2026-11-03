/**
 * With following switched off (SWAP_WATCH_INTERVAL_SECONDS=0). In a file of its own, because settings are read once per process.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { useFakeSettings, stubMeson, makeWorld, swapId, texts, DONE, MOVING } from './helpers.mjs'

useFakeSettings({ SWAP_WATCH_INTERVAL_SECONDS: '0' })
const { watchSwap } = await import('../src/watch.js')
const { getSwaps } = await import('../src/meson.js')
const { getTicket } = await import('../src/ticket-state.js')

test('no ⏳ is posted, because nothing would ever take it down', async () => {
  const id = swapId(1)
  stubMeson({ events: { [id]: MOVING } })
  const world = makeWorld('n1')
  const t = getTicket(world.channel.id)
  const entry = { n: 1, swapId: id, message: world.message(1, world.me), latest: (await getSwaps([id])).get(id) }
  t.swaps.push(entry)
  await watchSwap(t, entry)
  assert.equal(world.posted.length, 0)
})

test('a swap already finished still gets its closing message', async () => {
  const id = swapId(2)
  stubMeson({ events: { [id]: DONE } })
  const world = makeWorld('n2')
  const t = getTicket(world.channel.id)
  const entry = { n: 1, swapId: id, message: world.message(1, world.me), latest: (await getSwaps([id])).get(id) }
  t.swaps.push(entry)
  await watchSwap(t, entry)
  assert.equal(texts(world.posted).filter((x) => x.includes('Transaction Completed')).length, 1)
})
