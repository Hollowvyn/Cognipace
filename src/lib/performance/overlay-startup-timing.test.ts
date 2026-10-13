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

  it('keeps a synchronous result when recording the measure throws', () => {
    vi.spyOn(performance, 'measure').mockImplementation(() => {
      throw new Error('timing unavailable')
    })

    expect(timeOverlayStartupSync('page.app-shell', () => 7)).toBe(7)
  })

  it('keeps the original synchronous work error when recording throws', () => {
    const error = new Error('work failed')
    vi.spyOn(performance, 'measure').mockImplementation(() => {
      throw new Error('timing unavailable')
    })

    expect(() =>
      timeOverlayStartupSync('page.preview', () => {
        throw error
      }),
    ).toThrow(error)
  })

  it('keeps an asynchronous result when recording the measure throws', async () => {
    vi.spyOn(performance, 'measure').mockImplementation(() => {
      throw new Error('timing unavailable')
    })

    await expect(
      timeOverlayStartup('worker.metadata', () => Promise.resolve(7)),
    ).resolves.toBe(7)
  })

  it('keeps the original asynchronous work error when recording throws', async () => {
    const error = new Error('work failed')
    vi.spyOn(performance, 'measure').mockImplementation(() => {
      throw new Error('timing unavailable')
    })

    await expect(
      timeOverlayStartup('worker.upsert', () => Promise.reject(error)),
    ).rejects.toThrow(error)
  })

  it('ignores a failed mark', () => {
    vi.spyOn(performance, 'mark').mockImplementation(() => {
      throw new Error('timing unavailable')
    })

    expect(() => markOverlayStartup('timer-ready')).not.toThrow()
  })

  it('clears only a full measure stage before its 65th entry', async () => {
    vi.resetModules()
    const { timeOverlayStartupSync: time } =
      await import('./overlay-startup-timing')
    const name = 'cognipace.overlay.page.upsert'
    const otherName = 'cognipace.overlay.page.metadata'
    const entries: string[] = []
    const clearMeasures = vi
      .spyOn(performance, 'clearMeasures')
      .mockImplementation((clearedName) => {
        for (let index = entries.length - 1; index >= 0; index -= 1) {
          if (entries[index] === clearedName) entries.splice(index, 1)
        }
      })
    const measure = vi
      .spyOn(performance, 'measure')
      .mockImplementation((stage) => {
        entries.push(stage)
        return {} as PerformanceMeasure
      })

    time('page.metadata', () => undefined)
    for (let index = 0; index < 64; index += 1) {
      time('page.upsert', () => undefined)
    }
    expect(entries.filter((entry) => entry === name)).toHaveLength(64)
    expect(clearMeasures).not.toHaveBeenCalled()

    time('page.upsert', () => undefined)

    expect(clearMeasures).toHaveBeenCalledOnce()
    expect(clearMeasures).toHaveBeenCalledWith(name)
    expect(clearMeasures.mock.invocationCallOrder[0]).toBeLessThan(
      measure.mock.invocationCallOrder.at(-1)!,
    )
    expect(entries.filter((entry) => entry === name)).toHaveLength(1)
    expect(entries).toContain(otherName)
  })

  it('clears only a full mark stage before its 65th entry', async () => {
    vi.resetModules()
    const { markOverlayStartup: mark } =
      await import('./overlay-startup-timing')
    const name = 'cognipace.overlay.url-ready'
    const otherName = 'cognipace.overlay.page-ready'
    const entries: string[] = []
    const clearMarks = vi
      .spyOn(performance, 'clearMarks')
      .mockImplementation((clearedName) => {
        for (let index = entries.length - 1; index >= 0; index -= 1) {
          if (entries[index] === clearedName) entries.splice(index, 1)
        }
      })
    const markEntry = vi
      .spyOn(performance, 'mark')
      .mockImplementation((stage) => {
        entries.push(stage)
        return {} as PerformanceMark
      })

    mark('page-ready')
    for (let index = 0; index < 64; index += 1) mark('url-ready')
    expect(entries.filter((entry) => entry === name)).toHaveLength(64)
    expect(clearMarks).not.toHaveBeenCalled()

    mark('url-ready')

    expect(clearMarks).toHaveBeenCalledOnce()
    expect(clearMarks).toHaveBeenCalledWith(name)
    expect(clearMarks.mock.invocationCallOrder[0]).toBeLessThan(
      markEntry.mock.invocationCallOrder.at(-1)!,
    )
    expect(entries.filter((entry) => entry === name)).toHaveLength(1)
    expect(entries).toContain(otherName)
  })
})
