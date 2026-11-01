import { z } from 'zod'
const contextSchema = z.object({
  contextId: z.string().min(1),
  contextType: z.enum([
    'TAB',
    'POPUP',
    'BACKGROUND',
    'OFFSCREEN_DOCUMENT',
    'SIDE_PANEL',
    'DEVELOPER_TOOLS',
  ]),
  documentId: z.string().min(1),
  documentOrigin: z.string().min(1),
  documentUrl: z.string().min(1),
  frameId: z.number().int(),
  tabId: z.number().int(),
  windowId: z.number().int(),
  incognito: z.boolean(),
})
// Chrome116+ MV3 getContexts returns active contexts of THIS extension. No
// permission/baseline expansion. Absence permits only unconfirmed spool cleanup;
// this is not a permanent-destruction or BFCache guarantee.
export function createTransferOwnerInventory(
  getContexts:
    | ((filter: { documentIds: string[] }) => Promise<unknown>)
    | undefined,
) {
  return async (documentOwner: string) => {
    if (!getContexts) return false
    try {
      const result = z
        .array(contextSchema)
        .safeParse(await getContexts({ documentIds: [documentOwner] }))
      if (
        !result.success ||
        result.data.some((context) => context.documentId !== documentOwner)
      )
        return false
      return result.data.length === 0
    } catch {
      return false
    }
  }
}
