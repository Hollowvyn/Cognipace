import { browser } from 'wxt/browser'

const exampleFiles = [
  { label: 'Minimal questions', filename: 'minimal-problems.json' },
  { label: 'Detailed questions', filename: 'detailed-problems.json' },
  { label: 'Companies', filename: 'companies.json' },
  { label: 'Topics', filename: 'topics.json' },
  { label: 'Tracks', filename: 'track-only.json' },
  { label: 'Combined content', filename: 'combined.json' },
] as const

const schemaPath = '/import/cognipace-content-v1.schema.json'

export function ImportTemplates() {
  return (
    <section aria-labelledby="import-template-title" className="grid gap-2">
      <h3
        className="m-0 text-[length:var(--cp-copy-font-size)] font-semibold"
        id="import-template-title"
      >
        Start with a template
      </h3>
      <nav
        aria-label="Packaged import files"
        className="flex flex-wrap gap-x-3 gap-y-1"
      >
        {exampleFiles.map(({ filename, label }) => (
          <a
            className="text-[length:var(--cp-copy-font-size)] text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            download={filename}
            href={browser.runtime.getURL(`/import/examples/${filename}`)}
            key={filename}
          >
            {label}
          </a>
        ))}
        <a
          className="text-[length:var(--cp-copy-font-size)] text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          download="cognipace-content-v1.schema.json"
          href={browser.runtime.getURL(schemaPath)}
        >
          JSON schema
        </a>
      </nav>
      <details className="text-[length:var(--cp-copy-font-size)]">
        <summary className="cursor-pointer font-semibold">
          How importing works
        </summary>
        <ul className="m-0 grid gap-1 pl-5 pt-2 text-muted-foreground">
          <li>
            Use stable question slugs or LeetCode URLs, topic and company
            labels, and track slugs with group and question references.
          </li>
          <li>
            Optional sections can be omitted or combined in the same file; null
            values are ignored.
          </li>
          <li>
            Imports add missing catalog entries and relationships while
            preserving existing content and progress.
          </li>
          <li>
            Version 1 accepts the packaged JSON format and supported fields.
            Files may be up to 5 MiB of UTF-8 bytes and include up to 50,000
            total entries across all arrays, including nested arrays. Invalid
            entries are reported and skipped when safe; fatal format errors
            block the file.
          </li>
          <li>Companies are labels linked to questions, not tracks.</li>
        </ul>
      </details>
    </section>
  )
}
