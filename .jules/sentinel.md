## 2024-06-07 - Add DOMPurify to mitigate DOM-based XSS in LeetCode problem reader
**Vulnerability:** Raw HTML from a GraphQL response (`contentHtml`) was being assigned directly to `contentDocument.body.innerHTML` without sanitization.
**Learning:** External API responses containing HTML content must always be sanitized before being injected into the DOM, even if the source is trusted (e.g., LeetCode API), to prevent DOM-based XSS vulnerabilities.
**Prevention:** Use a robust sanitization library like `DOMPurify` to sanitize HTML content before injecting it using `innerHTML`.

## 2024-09-13 - Mitigate CSS Injection/XSS in Chart Component
**Vulnerability:** The `id` prop provided to `ChartContainer` was directly incorporated into a CSS string inside `<style dangerouslySetInnerHTML>` without sanitization.
**Learning:** Interpolating user-controlled dynamic properties (such as component IDs) into CSS selectors within `<style dangerouslySetInnerHTML>` can lead to CSS injection and cross-site scripting (XSS) vulnerabilities if not properly sanitized.
**Prevention:** Always sanitize dynamic inputs by stripping unsafe characters (e.g., using `.replace(/[^a-zA-Z0-9_-]/g, '')`) before interpolating them into CSS selectors used within `dangerouslySetInnerHTML`.