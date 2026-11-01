import { expect, it } from 'vitest'
import { utcIsoSortKey } from './utc-iso-sort-key'

it('preserves all accepted UTC precision and normalizes equivalent instants', () => {
  const prefix = '2024-02-29T23:59'
  expect(utcIsoSortKey(`${prefix}Z`)).toBe(`${prefix}:00.`)
  expect(utcIsoSortKey(`${prefix}:00.000Z`)).toBe(`${prefix}:00.`)
  expect(utcIsoSortKey(`${prefix}:00.5Z`)).toBe(
    utcIsoSortKey(`${prefix}:00.500Z`),
  )
  const chronological = [
    '00Z',
    '00.000000001Z',
    '00.5Z',
    '00.5001Z',
    '00.500100001Z',
    '01Z',
  ]
  const keys = chronological.map((seconds) =>
    utcIsoSortKey(`${prefix}:${seconds}`),
  )
  expect([...keys].sort()).toEqual(keys)
})

it.each([
  '2023-02-29T12:00Z',
  '2026-02-30T12:00:00Z',
  '2026-01-01T24:00Z',
  '2026-01-01T12:60Z',
  '2026-01-01T12:00:60Z',
  '2026-01-01T12:00:00+00:00',
  '2026-01-01',
  'garbage',
])('rejects invalid UTC components: %s', (value) => {
  expect(() => utcIsoSortKey(value)).toThrow()
})

it('preserves a long valid fraction and removes only its trailing zeroes', () => {
  const prefix = '2026-10-31T12:00:00.'
  const zeroes = '0'.repeat(100_000)
  const significant = `${zeroes}1`
  const exact = utcIsoSortKey(`${prefix}${significant}Z`)
  const padded = utcIsoSortKey(`${prefix}${significant}${zeroes}Z`)
  expect(exact).toBe(`${prefix}${significant}`)
  expect(padded).toBe(exact)
  expect(utcIsoSortKey(`${prefix}${zeroes}Z`)).toBe(prefix)
  expect(exact > prefix).toBe(true)
  expect(exact < utcIsoSortKey(`${prefix}1Z`)).toBe(true)
})
