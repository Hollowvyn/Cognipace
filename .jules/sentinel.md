## 2024-06-07 - Add DOMPurify to mitigate DOM-based XSS in LeetCode problem reader
**Vulnerability:** Raw HTML from a GraphQL response (`contentHtml`) was being assigned directly to `contentDocument.body.innerHTML` without sanitization.
**Learning:** External API responses containing HTML content must always be sanitized before being injected into the DOM, even if the source is trusted (e.g., LeetCode API), to prevent DOM-based XSS vulnerabilities.
**Prevention:** Use a robust sanitization library like `DOMPurify` to sanitize HTML content before injecting it using `innerHTML`.

## 2024-05-18 - CSS Injection via React dangerouslySetInnerHTML
**Vulnerability:** A CSS injection (and potential XSS) vulnerability existed in `src/components/ui/chart.tsx` where an un-sanitized `id` prop was being directly interpolated into a style selector inside a `<style dangerouslySetInnerHTML>` block.
**Learning:** Even though React handles escaping for standard text nodes, when using `dangerouslySetInnerHTML`, the developer takes full responsibility for preventing injection attacks, especially within `<style>` or `<script>` contexts where standard HTML encoding is insufficient.
**Prevention:** Always sanitize dynamic inputs (like component props) before inserting them into string templates within `dangerouslySetInnerHTML`. For CSS selectors or `id` attributes, a simple regex like `.replace(/[^a-zA-Z0-9_-]/g, '')` is effective.
