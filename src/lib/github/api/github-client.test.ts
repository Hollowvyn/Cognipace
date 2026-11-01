import { describe, expect, it, vi } from 'vitest'

import { createHttpClient, type HttpClient } from '@/platform/http'

import {
  createGitHubGistClient,
  githubGistBackupCapabilities,
} from './github-client'

describe('GitHub Gist client', () => {
  it('validates a token through the authenticated user endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        login: 'octocat',
        extra: 'allowed by GitHub response passthrough',
      }),
    )
    const client = createGitHubGistClient({
      token: 'ghp_secret',
      httpClient: createFetchHttpClient(fetchMock),
    })

    await expect(client.validateToken()).resolves.toEqual({
      ok: true,
      login: 'octocat',
    })

    const [url, init] = getFetchCall(fetchMock, 0)
    expect(url).toBe('https://api.github.com/user')
    expect(init.method).toBe('GET')
    expect(headerValue(init.headers, 'Accept')).toBe(
      'application/vnd.github+json',
    )
    expect(headerValue(init.headers, 'Authorization')).toBe('Bearer ghp_secret')
    expect(headerValue(init.headers, 'X-GitHub-Api-Version')).toBe('2026-03-10')
  })

  it('creates a private CogniPace sync gist with sync file content', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'gist_123',
        html_url: 'https://gist.github.com/octocat/gist_123',
        updated_at: '2026-05-26T12:00:00Z',
        files: {
          'cognipace-sync.json': {
            content: '{"version":1}',
            raw_url:
              'https://gist.githubusercontent.com/octocat/gist_123/raw/cognipace-sync.json',
          },
        },
      }),
    )
    const client = createGitHubGistClient({
      token: 'ghp_secret',
      httpClient: createFetchHttpClient(fetchMock),
    })

    await expect(client.createSyncGist('{"version":1}')).resolves.toEqual({
      id: 'gist_123',
      htmlUrl: 'https://gist.github.com/octocat/gist_123',
      updatedAt: '2026-05-26T12:00:00Z',
      remoteVersion: null,
      content: '{"version":1}',
      contentTruncated: false,
      rawUrl:
        'https://gist.githubusercontent.com/octocat/gist_123/raw/cognipace-sync.json',
    })

    const [url, init] = getFetchCall(fetchMock, 0)
    expect(url).toBe('https://api.github.com/gists')
    expect(init.method).toBe('POST')
    expect(headerValue(init.headers, 'Accept')).toBe(
      'application/vnd.github+json',
    )
    expect(headerValue(init.headers, 'Authorization')).toBe('Bearer ghp_secret')
    expect(headerValue(init.headers, 'X-GitHub-Api-Version')).toBe('2026-03-10')
    if (typeof init.body !== 'string') {
      throw new Error('Expected request body to be a string.')
    }

    expect(JSON.parse(init.body)).toEqual({
      description: 'CogniPace sync data',
      public: false,
      files: {
        'cognipace-sync.json': {
          content: '{"version":1}',
        },
      },
    })
  })

  it('gets an encoded gist path and maps the latest history version', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'gist/123',
        html_url: 'https://gist.github.com/octocat/gist_123',
        updated_at: '2026-05-26T12:00:00Z',
        history: [
          { version: 'remote_2', committed_at: '2026-05-26T12:00:00Z' },
          { version: 'remote_1', committed_at: '2026-05-25T12:00:00Z' },
        ],
        files: {
          'cognipace-sync.json': {
            content: '{"version":2}',
            raw_url:
              'https://gist.githubusercontent.com/octocat/gist_123/raw/cognipace-sync.json',
          },
        },
      }),
    )
    const client = createGitHubGistClient({
      token: 'ghp_secret',
      httpClient: createFetchHttpClient(fetchMock),
    })

    await expect(client.getGist('gist/123')).resolves.toEqual({
      id: 'gist/123',
      htmlUrl: 'https://gist.github.com/octocat/gist_123',
      updatedAt: '2026-05-26T12:00:00Z',
      remoteVersion: 'remote_2',
      content: '{"version":2}',
      contentTruncated: false,
      rawUrl:
        'https://gist.githubusercontent.com/octocat/gist_123/raw/cognipace-sync.json',
    })

    const [url, init] = getFetchCall(fetchMock, 0)
    expect(url).toBe('https://api.github.com/gists/gist%2F123')
    expect(init.method).toBe('GET')
  })

  it('patches the encoded gist path with sync file content', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'gist/123',
        updated_at: '2026-05-26T12:00:00Z',
        files: {
          'cognipace-sync.json': {
            content: '{"version":3}',
          },
        },
      }),
    )
    const client = createGitHubGistClient({
      token: 'ghp_secret',
      httpClient: createFetchHttpClient(fetchMock),
    })

    await expect(
      client.updateSyncGist('gist/123', '{"version":3}'),
    ).resolves.toMatchObject({
      id: 'gist/123',
      content: '{"version":3}',
      contentTruncated: false,
      rawUrl: null,
    })

    const [url, init] = getFetchCall(fetchMock, 0)
    expect(url).toBe('https://api.github.com/gists/gist%2F123')
    expect(init.method).toBe('PATCH')
    expect(parseJsonBody(init)).toEqual({
      files: {
        'cognipace-sync.json': {
          content: '{"version":3}',
        },
      },
    })
  })

  it('returns null content when the sync file is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'gist_123',
        updated_at: '2026-05-26T12:00:00Z',
        files: {
          'notes.txt': {
            content: 'not sync data',
          },
        },
      }),
    )
    const client = createGitHubGistClient({
      token: 'ghp_secret',
      httpClient: createFetchHttpClient(fetchMock),
    })

    await expect(client.getGist('gist_123')).resolves.toMatchObject({
      id: 'gist_123',
      content: null,
      contentTruncated: false,
      rawUrl: null,
    })
  })

  it('does not expose partial content when the sync file is truncated', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 'gist_123',
        updated_at: '2026-05-26T12:00:00Z',
        files: {
          'cognipace-sync.json': {
            content: '{"partial"',
            truncated: true,
            raw_url:
              'https://gist.githubusercontent.com/octocat/gist_123/raw/cognipace-sync.json',
          },
        },
      }),
    )
    const client = createGitHubGistClient({
      token: 'ghp_secret',
      httpClient: createFetchHttpClient(fetchMock),
    })

    await expect(client.getGist('gist_123')).resolves.toMatchObject({
      id: 'gist_123',
      content: null,
      contentTruncated: true,
      rawUrl:
        'https://gist.githubusercontent.com/octocat/gist_123/raw/cognipace-sync.json',
    })
  })

  it('maps auth failures without leaking tokens', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          message: 'Bad credentials for ghp_secret',
        },
        { status: 401 },
      ),
    )
    const client = createGitHubGistClient({
      token: 'ghp_secret',
      httpClient: createFetchHttpClient(fetchMock),
    })

    const error = await captureError(() => client.validateToken())

    expect(error).toMatchObject({
      name: 'HttpRequestError',
      status: 401,
      message: 'Bad credentials for [redacted]',
    })
    expect(String(error)).not.toContain('ghp_secret')
    expect(JSON.stringify(error)).not.toContain('ghp_secret')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

function createFetchHttpClient(fetchMock: typeof fetch): HttpClient {
  return createHttpClient({ fetch: fetchMock })
}

function jsonResponse(
  body: unknown,
  init: ResponseInit = { status: 200 },
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
}

function getFetchCall(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
  index: number,
): [string, RequestInit] {
  const call = fetchMock.mock.calls.at(index)

  if (!call) {
    throw new Error(`Expected fetch call ${index}.`)
  }

  const url = call[0]
  const init = call[1]

  if (typeof url !== 'string') {
    throw new Error('Expected fetch URL to be a string.')
  }

  if (!isRequestInit(init)) {
    throw new Error('Expected fetch init.')
  }

  return [url, init]
}

function headerValue(headers: RequestInit['headers'], name: string): string {
  return new Headers(headers).get(name) ?? ''
}

function parseJsonBody(init: RequestInit): unknown {
  if (typeof init.body !== 'string') {
    throw new Error('Expected request body to be a string.')
  }

  return JSON.parse(init.body)
}

function isRequestInit(value: unknown): value is RequestInit {
  return typeof value === 'object' && value !== null
}

async function captureError(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action()
  } catch (error) {
    return error
  }

  throw new Error('Expected action to throw.')
}

it('advertises no complete backup verification for the PATCH-only Gist adapter', () => {
  const client = createGitHubGistClient({ token: 'test-token' })
  expect(githubGistBackupCapabilities.verifiedFullBackup).toBe(false)
  expect(client.verifyCompleteBackup).toBeUndefined()
})
