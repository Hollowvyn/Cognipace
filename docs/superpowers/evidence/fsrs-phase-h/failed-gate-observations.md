# Phase H Failed-Gate Output Excerpts

These sanitized excerpts were captured from the disposable probe's terminal output. Separate raw stdout files were not saved. The temporary package/worker setup was removed after Gate 1; the preserved sources are partial and cannot be rerun with the final docs-only branch's ordinary `npm ci` alone.

## Same-day scheduler parity

Command: `rtk npm run test -- src/lib/fsrs/optimizer/official-binding.test.ts`

The initial trained-vector codec and four-day state checks passed (2/2). After adding the same-day Again comparison in the [preserved test source](./parity-repro-source.txt), the focused run reported:

```text
Tests 1 failed | 2 passed
expected 2.25843238 to be close to 45, received difference is 42.74156762, but expected 0.0005
```

The test compares the authoritative daily `ts-fsrs` preview (2.25843238) with `FSRSBinding.nextStates` (45) at elapsed day zero, stability 45 and difficulty 8.5. This is a state/prediction parity failure for the tested release and input. It does not by itself measure trained-weight benefit.

## Ordinary clean install

Commands: `rtk npm install --save-exact @open-spaced-repetition/binding@0.5.0 @open-spaced-repetition/binding-wasm32-wasi@0.5.0`; later `rtk npm ci` with both direct dependencies in the disposable lockfile.

Both ordinary install paths returned:

```text
npm error code EBADPLATFORM
Unsupported platform for @open-spaced-repetition/binding-wasm32-wasi@0.5.0: wanted {"cpu":"wasm32"} (current: {"cpu":"arm64"})
Valid cpu: wasm32
Actual cpu: arm64
```

`--force` installed the dependency only for the disposable packaged Chrome probe. The final `package.json` and lockfile contain neither optimizer package. An alternative packaging approach was not tested.

## Cancellation measurement limit

The [packaged report](./packaged-chrome-synthetic.json) records `workerTargetsDuringCancel: 0`, `workersAtCancelRequest: 5`, `cancelResult.status: "unsettled"` after a 10-second driver deadline, and one generic `Uncaught (in promise)` exception. The latter count was a Set of created Worker objects, not live workers. The [dashboard probe](./dashboard-probe-source.txt) references an out-of-scope `cardCount` in its `catch`, and the [driver](./packaged-driver-source.txt) does not catch a rejected run Promise. The observed timeout is therefore inconclusive about binding cancellation behavior.
