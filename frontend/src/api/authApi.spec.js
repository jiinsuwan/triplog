import { describe, it, expect, vi, beforeEach } from 'vitest'

const postMock = vi.hoisted(() => vi.fn())
const deleteMock = vi.hoisted(() => vi.fn())
const assignMock = vi.hoisted(() => vi.fn())

vi.mock('./instance', () => ({
  default: {
    post: postMock,
    delete: deleteMock,
  },
}))

import { confirmPasswordReset, oauthAuthorizeUrl, requestPasswordReset, startOAuthLogin, withdraw } from './authApi'

describe('authApi password reset', () => {
  beforeEach(() => {
    postMock.mockReset()
    deleteMock.mockReset()
    assignMock.mockReset()
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

  it('withdraws the current user with password confirmation', async () => {
    deleteMock.mockResolvedValueOnce({ data: { code: 'SUCCESS', data: null } })

    await expect(withdraw('password123')).resolves.toEqual({
      code: 'SUCCESS',
      data: null,
    })

    expect(deleteMock).toHaveBeenCalledWith('/users/me', {
      data: { password: 'password123' },
    })
  })

  it('withdraws the current social-only user without password confirmation', async () => {
    deleteMock.mockResolvedValueOnce({ data: { code: 'SUCCESS', data: null } })

    await expect(withdraw(null)).resolves.toEqual({
      code: 'SUCCESS',
      data: null,
    })

    expect(deleteMock).toHaveBeenCalledWith('/users/me', {
      data: { password: null },
    })
  })

  it('builds OAuth authorize URLs through the backend', () => {
    expect(oauthAuthorizeUrl('google', '/profile')).toBe(
      'http://localhost:8080/auth/oauth/google/authorize?redirect=%2Fprofile',
    )
  })

  it('starts OAuth login by navigating to the backend authorize URL', () => {
    const originalAssign = window.location.assign
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    })

    startOAuthLogin('naver', '/trips')

    expect(assignMock).toHaveBeenCalledWith(
      'http://localhost:8080/auth/oauth/naver/authorize?redirect=%2Ftrips',
    )

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: originalAssign },
    })
  })
})
