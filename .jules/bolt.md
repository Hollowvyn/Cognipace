## 2024-11-20 - Intl.DateTimeFormat caching
**Learning:** `new Intl.DateTimeFormat` instantiation is a huge performance bottleneck in React when used directly inside render functions or formatting helpers (e.g. table cells and custom tooltips), taking roughly 4.9 seconds for 10,000 instantiations versus 14ms when cached.
**Action:** Always hoist `Intl.DateTimeFormat` instantiations to module-level constants to avoid excessive cost on every render cycle, especially within components that render lists, grids, or respond to hover states.

## 2024-05-23 - Intl.DateTimeFormat instantiation bottleneck
**Learning:** Instantiating `Intl.DateTimeFormat` within loop bodies/hot paths is very expensive in V8 engines. Benchmarks proved it takes ~1.7s for 10k instantiations compared to ~70ms for 10k reused formatting iterations.
**Action:** Always extract and reuse `Intl.DateTimeFormat` (or map-cache them by specific dynamic keys, like `timeZone`) instead of locally instantiating them every function call, particularly in functions that get evaluated iteratively or reactively.
