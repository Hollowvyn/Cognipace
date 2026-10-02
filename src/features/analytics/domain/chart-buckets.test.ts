import { classifyLineContinuity } from './chart-buckets'
import { describe, expect, it } from 'vitest'

describe('chart buckets', () => {
  it('classifies solid adjacency', () => {
    expect(classifyLineContinuity([0.8, 0.84])).toEqual([
      { kind: 'solid', fromIndex: 0, toIndex: 1 },
    ])
  })

  it('classifies a permitted two-bucket hole as a bridge', () => {
    expect(classifyLineContinuity([0.8, null, null, 0.84])).toEqual([
      { kind: 'bridge', fromIndex: 0, toIndex: 3 },
    ])
  })

  it('bridges any gap between measured points', () => {
    expect(classifyLineContinuity([0.8, null, null, null, 0.84])).toEqual([
      { kind: 'bridge', fromIndex: 0, toIndex: 4 },
    ])
  })

  it('ignores leading and trailing nulls without synthesizing points or mutating values', () => {
    const values = [null, 0.8, 0.84, null]

    expect(classifyLineContinuity(values)).toEqual([
      { kind: 'solid', fromIndex: 1, toIndex: 2 },
    ])
    expect(values).toEqual([null, 0.8, 0.84, null])
  })
})
