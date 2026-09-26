import { mkdirSync, writeFileSync } from 'node:fs'
import { format } from 'prettier'
import { z } from 'zod'
import { contentFileSchema } from '../src/features/imports/api/content-file-contracts.ts'

const directory = new URL('../public/import/', import.meta.url)
const schemaPath = new URL('cognipace-content-v1.schema.json', directory)
mkdirSync(directory, { recursive: true })
const schema = z.toJSONSchema(contentFileSchema, {
  target: 'draft-2020-12',
})
writeFileSync(
  schemaPath,
  await format(JSON.stringify(schema), { parser: 'json' }),
)
