## 2024-06-07 - Add DOMPurify to mitigate DOM-based XSS in LeetCode problem reader
**Vulnerability:** Raw HTML from a GraphQL response (`contentHtml`) was being assigned directly to `contentDocument.body.innerHTML` without sanitization.
**Learning:** External API responses containing HTML content must always be sanitized before being injected into the DOM, even if the source is trusted (e.g., LeetCode API), to prevent DOM-based XSS vulnerabilities.
**Prevention:** Use a robust sanitization library like `DOMPurify` to sanitize HTML content before injecting it using `innerHTML`.

## 2024-10-18 - Fix CSS injection vulnerability in Chart component
**Vulnerability:** Unsanitized `id` string was being used in template literals and eventually assigned to a `<style dangerouslySetInnerHTML={{...}}>` block in `ChartContainer`, which opened up a CSS injection vulnerability where a user could specify an ID containing style rules.
**Learning:** Even innocuous-looking fields like `id` must be sanitized if they are dynamically interpolated into raw HTML or CSS structures.
**Prevention:** Sanitize the user input by stripping non-alphanumeric characters (e.g., using `.replace(/[^a-zA-Z0-9_-]/g, '')`) before utilizing them in sensitive contexts like generating IDs bound to DOM nodes or CSS styles.
