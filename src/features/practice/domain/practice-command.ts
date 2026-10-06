export type ReviewCommandConflictReason =
  | 'stale-review'
  | 'backdated'
  | 'unsupported-legacy'
  | 'stale-generation'
  | 'command-conflict'

/** Expected rejection that lets a caller retain its draft and refresh context. */
export class ReviewCommandConflictError extends Error {
  constructor(
    readonly reason: ReviewCommandConflictReason,
    message: string,
  ) {
    super(message)
    this.name = 'ReviewCommandConflictError'
  }
}
