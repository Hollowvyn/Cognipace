import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ register: vi.fn(), restrict: vi.fn() }))
vi.mock('wxt/utils/define-background', () => ({
  defineBackground: (input: unknown) => input,
}))
vi.mock('@/extension/background/register-handlers', () => ({
  registerBackgroundHandlers: mocks.register,
}))
vi.mock('@/platform/secrets', () => ({
  restrictSecretStorageAccess: mocks.restrict,
}))
import background from '../entrypoints/background'

beforeEach(() => {
  vi.clearAllMocks()
})
describe('trusted background startup', () => {
  it('registers wake-event listeners synchronously while storage initialization is pending', () => {
    mocks.restrict.mockReturnValue(new Promise(() => {}))
    background.main()
    expect(mocks.register).toHaveBeenCalledTimes(1)
    expect(mocks.restrict).toHaveBeenCalledTimes(1)
    expect(mocks.register.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.restrict.mock.invocationCallOrder[0]!,
    )
  })
  it('keeps listeners registered and logs no raw storage exception on failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.restrict.mockRejectedValue(new Error('raw-secret-in-error'))
    background.main()
    await Promise.resolve()
    expect(mocks.register).toHaveBeenCalledTimes(1)
    expect(log.mock.calls.flat().map(String).join(' ')).not.toContain(
      'raw-secret-in-error',
    )
    log.mockRestore()
  })
})
