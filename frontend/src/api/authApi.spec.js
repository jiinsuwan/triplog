import { describe, it, expect, vi, beforeEach } from 'vitest'

const postMock = vi.hoisted(() => vi.fn())

vi.mock('./instance', () => ({
  default: {
    post: postMock,
  },
}))

import { confirmPasswordReset, requestPasswordReset } from './authApi'

describe('authApi password reset', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  it('requests a password reset and unwraps the ApiResponse payload', async () => {
    postMock.mockResolvedValueOnce({
      data: { code: 'SUCCESS', data: { demoResetUrl: 'http://localhost:5173/reset-password?token=t' } },
    })

    await expect(requestPasswordReset('me@example.com')).resolves.toEqual({
      demoResetUrl: 'http://localhost:5173/reset-password?token=t',
    })

    expect(postMock).toHaveBeenCalledWith('/auth/password-reset/request', { email: 'me@example.com' })
  })

  it('confirms a password reset', async () => {
    postMock.mockResolvedValueOnce({ data: { code: 'SUCCESS', data: null } })

    await expect(confirmPasswordReset('token', 'new-password123')).resolves.toEqual({
      code: 'SUCCESS',
      data: null,
    })

    expect(postMock).toHaveBeenCalledWith('/auth/password-reset/confirm', {
      token: 'token',
      newPassword: 'new-password123',
    })
  })
})
