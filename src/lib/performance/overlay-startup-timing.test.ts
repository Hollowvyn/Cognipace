import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  markOverlayStartup,
  timeOverlayStartup,
  timeOverlayStartupSync,
} from './overlay-startup-timing'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('overlay startup timing', () => {
  it('marks a fixed startup stage label', () => {
    const mark = vi.spyOn(performance, 'mark')

    markOverlayStartup('content-mount')

    expect(mark).toHaveBeenCalledWith('cognipace.overlay.content-mount')
  })

  it('returns synchronous work and measures its elapsed time', () => {
    const measure = vi.spyOn(performance, 'measure')

    expect(timeOverlayStartupSync('page.snapshot', () => 7)).toBe(7)
    expect(measure).toHaveBeenCalledWith(
      'cognipace.overlay.page.snapshot',
      expect.objectContaining({
        start: expect.any(Number),
        end: expect.any(Number),
      }),
    )
  })

  it('measures synchronous work when it throws and propagates the error', () => {
    const measure = vi.spyOn(performance, 'measure')
    const error = new Error('offline')

    expect(() =>
      timeOverlayStartupSync('page.metadata', () => {
        throw error
      }),
    ).toThrow(error)
    expect(measure).toHaveBeenCalledWith(
      'cognipace.overlay.page.metadata',
      expect.objectContaining({
        start: expect.any(Number),
        end: expect.any(Number),
      }),
    )
  })

  it('returns asynchronous work and measures its elapsed time', async () => {
    const measure = vi.spyOn(performance, 'measure')

    await expect(
      timeOverlayStartup('page.preview', async () => 7),
    ).resolves.toBe(7)
    expect(measure).toHaveBeenCalledWith(
      'cognipace.overlay.page.preview',
      expect.objectContaining({
        start: expect.any(Number),
        end: expect.any(Number),
      }),
    )
  })

  it('measures asynchronous work when it rejects and propagates the error', async () => {
    const measure = vi.spyOn(performance, 'measure')
    const error = new Error('offline')

    await expect(
      timeOverlayStartup('page.upsert', async () => {
        throw error
      }),
    ).rejects.toThrow(error)
    expect(measure).toHaveBeenCalledWith(
      'cognipace.overlay.page.upsert',
      expect.objectContaining({
        start: expect.any(Number),
        end: expect.any(Number),
      }),
    )
  })
})
