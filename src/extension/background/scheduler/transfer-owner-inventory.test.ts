import { expect, it, vi } from 'vitest'
import { createTransferOwnerInventory } from './transfer-owner-inventory'
it('uses only an exact own-extension documentIds inventory and treats authoritative absence narrowly', async () => {
  const getContexts = vi.fn(() => Promise.resolve([]))
  expect(await createTransferOwnerInventory(getContexts)('actual-owner')).toBe(
    true,
  )
  expect(getContexts).toHaveBeenCalledExactlyOnceWith({
    documentIds: ['actual-owner'],
  })
})
it.each([
  undefined,
  () => Promise.reject(new Error('unsupported')),
  () => Promise.resolve(undefined),
  () => Promise.resolve({}),
  () => Promise.resolve([{}]),
  () => Promise.resolve([{ documentId: 'other' }]),
])(
  'keeps sessions on unsupported, failed, malformed or ambiguous inventory',
  async (getContexts) => {
    expect(
      await createTransferOwnerInventory(getContexts)('actual-owner'),
    ).toBe(false)
  },
)
it('keeps a well formed active document', async () => {
  expect(
    await createTransferOwnerInventory(() =>
      Promise.resolve([
        {
          contextId: 'context',
          contextType: 'TAB',
          documentId: 'actual-owner',
          documentOrigin: 'chrome-extension://id',
          documentUrl: 'chrome-extension://id/dashboard.html',
          frameId: 0,
          tabId: 1,
          windowId: 1,
          incognito: false,
        },
      ]),
    )('actual-owner'),
  ).toBe(false)
})
