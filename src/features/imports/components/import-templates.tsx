import { Download } from 'lucide-react'
import { useId } from 'react'
import { browser } from 'wxt/browser'

import { Button } from '@/components/ui/button'

const exampleFiles = [
  { label: 'Minimal questions', filename: 'minimal-problems.json' },
  { label: 'Detailed questions', filename: 'detailed-problems.json' },
  { label: 'Companies', filename: 'companies.json' },
  { label: 'Topics', filename: 'topics.json' },
  { label: 'Tracks', filename: 'track-only.json' },
  { label: 'Combined content', filename: 'combined.json' },
] as const

const schemaPath = '/import/cognipace-content-v1.schema.json'

export function ImportTemplates({
  variant = 'content',
}: {
  variant?: 'content' | 'tracks'
}) {
  const titleId = useId()
  if (variant === 'tracks') {
    return (
      <section
        aria-labelledby={titleId}
        className="grid gap-3 rounded-[var(--cp-control-radius)] border border-border bg-muted/30 p-4"
      >
        <h3
          className="m-0 text-[length:var(--cp-copy-font-size)] font-bold"
          id={titleId}
        >
          1. Start with a template
        </h3>
        <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
          Download the example, then add your track name, ordered groups, and
          LeetCode problem slugs or URLs.
        </p>
        <div>
          <Button asChild size="sm" variant="outline">
            <a
              download="track-only.json"
              href={browser.runtime.getURL('/import/examples/track-only.json')}
            >
              <Download aria-hidden="true" />
              Download track template
            </a>
          </Button>
        </div>
      </section>
    )
  }
  return (
    <section aria-labelledby={titleId} className="grid gap-2">
      <h3
        className="m-0 text-[length:var(--cp-copy-font-size)] font-semibold"
        id={titleId}
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
