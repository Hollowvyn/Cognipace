import { expect, it } from 'vitest'

import { allocateImportedTopicId } from './plan-import-problems'

class NonIterableLookupKeys extends Set<string> {
  lookupCount = 0

  override has(value: string) {
    this.lookupCount += 1
    return super.has(value)
  }

  override [Symbol.iterator](): SetIterator<string> {
    throw new Error('Topic ID allocation must not rescan the reserved keys.')
  }
}

it('allocates many deterministic topic IDs against a large key set without rescanning it', () => {
  const occupied = new NonIterableLookupKeys()
  for (let index = 0; index < 50_000; index += 1) {
    occupied.add(`occupied-${index}`)
  }

  const allocationCount = 500
  const allocated = Array.from({ length: allocationCount }, (_, index) =>
    allocateImportedTopicId(`topic-${index}`, occupied),
  )

  expect(allocated.every((id) => id !== null)).toBe(true)
  expect(new Set(allocated).size).toBe(allocationCount)
  expect(occupied.lookupCount).toBe(allocationCount)
  expect(occupied.size).toBe(50_000 + allocationCount)
})
