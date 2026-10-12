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
    expect(measure).toHaveBeenCalledOnce()
    expect(measure.mock.calls[0]?.[0]).toBe('cognipace.overlay.page.snapshot')
    const options = measure.mock.calls[0]?.[1]
    expect(typeof options).toBe('object')
    if (typeof options !== 'object' || options === null)
      throw new Error('Missing timing options')
    expect(typeof options.start).toBe('number')
    expect(typeof options.end).toBe('number')
  })

  it('measures synchronous work when it throws and propagates the error', () => {
    const measure = vi.spyOn(performance, 'measure')
    const error = new Error('offline')

    expect(() =>
      timeOverlayStartupSync('page.metadata', () => {
        throw error
      }),
    ).toThrow(error)
    expect(measure).toHaveBeenCalledOnce()
    expect(measure.mock.calls[0]?.[0]).toBe('cognipace.overlay.page.metadata')
    const options = measure.mock.calls[0]?.[1]
    expect(typeof options).toBe('object')
    if (typeof options !== 'object' || options === null)
      throw new Error('Missing timing options')
    expect(typeof options.start).toBe('number')
    expect(typeof options.end).toBe('number')
  })

  it('returns asynchronous work and measures its elapsed time', async () => {
    const measure = vi.spyOn(performance, 'measure')

    await expect(
      timeOverlayStartup('page.preview', () => Promise.resolve(7)),
    ).resolves.toBe(7)
    expect(measure).toHaveBeenCalledOnce()
    expect(measure.mock.calls[0]?.[0]).toBe('cognipace.overlay.page.preview')
    const options = measure.mock.calls[0]?.[1]
    expect(typeof options).toBe('object')
    if (typeof options !== 'object' || options === null)
      throw new Error('Missing timing options')
    expect(typeof options.start).toBe('number')
    expect(typeof options.end).toBe('number')
  })

  it('measures asynchronous work when it rejects and propagates the error', async () => {
    const measure = vi.spyOn(performance, 'measure')
    const error = new Error('offline')

    await expect(
      timeOverlayStartup('page.upsert', () => Promise.reject(error)),
    ).rejects.toThrow(error)
    expect(measure).toHaveBeenCalledOnce()
    expect(measure.mock.calls[0]?.[0]).toBe('cognipace.overlay.page.upsert')
    const options = measure.mock.calls[0]?.[1]
    expect(typeof options).toBe('object')
    if (typeof options !== 'object' || options === null)
      throw new Error('Missing timing options')
    expect(typeof options.start).toBe('number')
    expect(typeof options.end).toBe('number')
  })
})
