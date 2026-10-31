import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FormEvent } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { openGooglePasswordManager } from '@/platform/chrome/password-manager'

import { PasswordManagerHelper } from './password-manager-helper'

vi.mock('@/platform/chrome/password-manager', () => ({
  openGooglePasswordManager: vi.fn(),
}))

const entry = {
  website: 'https://gist.github.com',
  username: 'CogniPace GitHub sync',
  password: 'test-only-token',
  notes: 'App: CogniPace\nGist ID: test-gist',
}

beforeEach(() => vi.resetAllMocks())

describe('PasswordManagerHelper', () => {
  it('copies individual fields only after clicks without rendering the key or submitting the form', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault())
    const { container } = render(
      <form onSubmit={onSubmit}>
        <PasswordManagerHelper {...entry} />
      </form>,
    )
    expect(writeText).not.toHaveBeenCalled()
    expect(container.innerHTML).not.toContain(entry.password)
    await user.click(screen.getByText('Save in your password manager'))
    for (const [label, value] of [
      ['Website', entry.website],
      ['Username', entry.username],
      ['Password', entry.password],
      ['Notes', entry.notes],
    ]) {
      await user.click(screen.getByRole('button', { name: `Copy ${label}` }))
      expect(writeText).toHaveBeenLastCalledWith(value)
      expect(await screen.findByRole('status')).toHaveTextContent(
        `${label} copied.`,
      )
    }
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.innerHTML).not.toContain(entry.password)
  })

  it('opens the manager without sending or copying the draft values', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    render(<PasswordManagerHelper {...entry} />)
    await user.click(screen.getByText('Save in your password manager'))
    await user.click(
      screen.getByRole('button', { name: 'Open Google Password Manager' }),
    )
    expect(openGooglePasswordManager).toHaveBeenCalledExactlyOnceWith()
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByText(/saved successfully/i)).not.toBeInTheDocument()
  })

  it('cannot copy an empty key and uses the latest replacement draft', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    const { rerender } = render(
      <PasswordManagerHelper {...entry} password="" />,
    )
    await user.click(screen.getByText('Save in your password manager'))
    expect(screen.getByRole('button', { name: 'Copy Password' })).toBeDisabled()
    expect(screen.getByText(/paste the key above/i)).toBeVisible()
    rerender(
      <PasswordManagerHelper {...entry} password="replacement-test-key" />,
    )
    await user.click(screen.getByRole('button', { name: 'Copy Password' }))
    expect(writeText).toHaveBeenCalledExactlyOnceWith('replacement-test-key')
    rerender(<PasswordManagerHelper {...entry} password="" />)
    expect(screen.getByRole('button', { name: 'Copy Password' })).toBeDisabled()
  })

  it('reports controlled clipboard failures and allows retry', async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error(entry.password))
      .mockResolvedValueOnce(undefined)
    render(<PasswordManagerHelper {...entry} />)
    await user.click(screen.getByText('Save in your password manager'))
    await user.click(screen.getByRole('button', { name: 'Copy Password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not copy. Try again or copy the field manually.',
    )
    expect(screen.queryByText(entry.password)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy Password' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Password copied.',
    )
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  it('handles unavailable clipboard and manager failures without exposing raw errors', async () => {
    const user = userEvent.setup()
    await user.click(document.body)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    vi.mocked(openGooglePasswordManager).mockRejectedValue(
      new Error(entry.password),
    )
    render(<PasswordManagerHelper {...entry} />)
    await user.click(screen.getByText('Save in your password manager'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy Notes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not copy.',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Google Password Manager' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Open Google Password Manager from Chrome’s Passwords and autofill menu.',
    )
    expect(screen.queryByText(entry.password)).not.toBeInTheDocument()
  })

  it('acknowledges copy after completion and disables conflicting controls', async () => {
    const user = userEvent.setup()
    let finish!: () => void
    vi.spyOn(navigator.clipboard, 'writeText').mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const { rerender } = render(<PasswordManagerHelper {...entry} />)
    await user.click(screen.getByText('Save in your password manager'))
    await user.click(screen.getByRole('button', { name: 'Copy Password' }))
    expect(screen.queryByText('Password copied.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy Notes' })).toBeDisabled()
    finish()
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Password copied.',
    )
    rerender(<PasswordManagerHelper {...entry} disabled />)
    for (const button of screen.getAllByRole('button'))
      expect(button).toBeDisabled()
  })
})
