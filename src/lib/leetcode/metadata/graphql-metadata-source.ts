import { parseLeetCodeDifficulty } from '../domain/difficulty'
import {
  createLeetCodeProblemUrl,
  normalizeLeetCodeSlug,
} from '../domain/problem-url'
import { requestLeetCodeProblemMetadata } from '../api/problem-metadata-request'
import type { LeetCodeGraphQlFetch } from '../core/graphql-client'
import { isObjectRecord, readTrimmedString } from '../core/value-readers'
import type {
  LeetCodeMetadataResult,
  LeetCodeProblemLocation,
  LeetCodeProblemMetadata,
  LeetCodeTopic,
} from '../domain/types'

type ParsedLeetCodeGraphQlQuestion = {
  title: string | null
  titleSlug: string | null
  questionFrontendId: string | null
  difficulty: string | null
  isPaidOnly: boolean | null
  topicTags: LeetCodeTopic[]
}

export async function fetchLeetCodeProblemMetadata(
  location: LeetCodeProblemLocation,
  options: {
    fetch?: LeetCodeGraphQlFetch | undefined
    document?: Document | undefined
    csrfToken?: string | null | undefined
    now?: (() => number) | undefined
  } = {},
): Promise<LeetCodeMetadataResult> {
  const graphQlResult = await requestLeetCodeProblemMetadata({
    locationUrl: location.url,
    slug: location.slug,
    fetch: options.fetch,
    document: options.document,
    csrfToken: options.csrfToken,
  })

  if (!graphQlResult.ok) {
    return graphQlResult
  }

  const parsedQuestionMetadata = readLeetCodeQuestionFromGraphQlPayload(
    graphQlResult.payload,
  )
  const difficulty = parseLeetCodeDifficulty(parsedQuestionMetadata?.difficulty)

  if (!parsedQuestionMetadata?.title || difficulty === 'Unknown') {
    return {
      ok: false,
      error: new Error(
        'LeetCode GraphQL response did not include complete question metadata.',
      ),
    }
  }

  return {
    ok: true,
    metadata: {
      location: createCanonicalLocation(location, parsedQuestionMetadata),
      title: parsedQuestionMetadata.title,
      frontendId: parsedQuestionMetadata.questionFrontendId,
      difficulty,
      isPremium: parsedQuestionMetadata.isPaidOnly,
      topics: parsedQuestionMetadata.topicTags,
      source: 'graphql',
      confidence: 'high',
      capturedAt: options.now?.() ?? Date.now(),
    } satisfies LeetCodeProblemMetadata,
  }
}

function readLeetCodeQuestionFromGraphQlPayload(
  graphQlPayload: unknown,
): ParsedLeetCodeGraphQlQuestion | null {
  if (!isObjectRecord(graphQlPayload) || !isObjectRecord(graphQlPayload.data)) {
    return null
  }

  const questionRecord = graphQlPayload.data.question

  if (!isObjectRecord(questionRecord)) {
    return null
  }

  return {
    title: readTrimmedString(questionRecord.title),
    titleSlug: readTrimmedString(questionRecord.titleSlug),
    questionFrontendId: readTrimmedString(questionRecord.questionFrontendId),
    difficulty: readTrimmedString(questionRecord.difficulty),
    isPaidOnly:
      typeof questionRecord.isPaidOnly === 'boolean'
        ? questionRecord.isPaidOnly
        : null,
    topicTags: readLeetCodeTopicTagsFromGraphQlValue(questionRecord.topicTags),
  }
}

function createCanonicalLocation(
  location: LeetCodeProblemLocation,
  metadata: ParsedLeetCodeGraphQlQuestion,
): LeetCodeProblemLocation {
  const canonicalSlug = metadata.titleSlug
    ? normalizeLeetCodeSlug(metadata.titleSlug)
    : ''

  if (!canonicalSlug || canonicalSlug === location.slug) {
    return location
  }

  return {
    ...location,
    slug: canonicalSlug,
    url: createLeetCodeProblemUrl(canonicalSlug),
  }
}

function readLeetCodeTopicTagsFromGraphQlValue(
  topicTagsValue: unknown,
): LeetCodeTopic[] {
  if (!Array.isArray(topicTagsValue)) {
    return []
  }

  return topicTagsValue
    .map((topicTagRecord) => {
      if (!isObjectRecord(topicTagRecord)) {
        return null
      }

      const topicName = readTrimmedString(topicTagRecord.name)

      if (!topicName) {
        return null
      }

      return {
        name: topicName,
        slug: readTrimmedString(topicTagRecord.slug),
      } satisfies LeetCodeTopic
    })
    .filter((topicTag): topicTag is LeetCodeTopic => Boolean(topicTag))
}
