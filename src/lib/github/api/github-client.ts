import { createHttpClient, type HttpClient } from '@/platform/http'

import {
  createGitHubGist,
  getGitHubGist,
  updateGitHubGistFile,
  validateGitHubToken,
} from './gist-requests'

export type BackupCapabilities = Readonly<{ verifiedFullBackup: boolean }>

// PATCH success is not a complete post-upload readback, including truncated files.
export const githubGistBackupCapabilities: BackupCapabilities = Object.freeze({
  verifiedFullBackup: false,
})

export interface GitHubGistClient {
  /** Trusted transport completion: complete readback must match these exact bytes.
   * The current Gist adapter deliberately does not implement this capability. */
  verifyCompleteBackup?: (gistId: string, content: string) => Promise<void>

  validateToken(): Promise<Awaited<ReturnType<typeof validateGitHubToken>>>
  getGist(gistId: string): Promise<Awaited<ReturnType<typeof getGitHubGist>>>
  createSyncGist(
    content: string,
  ): Promise<Awaited<ReturnType<typeof createGitHubGist>>>
  updateSyncGist(
    gistId: string,
    content: string,
  ): Promise<Awaited<ReturnType<typeof updateGitHubGistFile>>>
}

export function createGitHubGistClient(input: {
  token: string
  httpClient?: HttpClient | undefined
}): GitHubGistClient {
  const httpClient = input.httpClient ?? createHttpClient()

  return {
    validateToken: () =>
      validateGitHubToken({ httpClient, token: input.token }),
    getGist: (gistId) =>
      getGitHubGist({ httpClient, token: input.token, gistId }),
    createSyncGist: (content) =>
      createGitHubGist({ httpClient, token: input.token, content }),
    updateSyncGist: (gistId, content) =>
      updateGitHubGistFile({ httpClient, token: input.token, gistId, content }),
  }
}
