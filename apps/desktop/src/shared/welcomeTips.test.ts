import { describe, expect, it } from 'vitest'
import { WELCOME_TIPS, welcomeRecentEmptyBody, welcomeTipsHeading } from './welcomeTips'

describe('welcomeTips', () => {
  it('ships three actionable tips', () => {
    expect(WELCOME_TIPS).toHaveLength(3)
    expect(WELCOME_TIPS.map((tip) => tip.action).sort()).toEqual(['palette', 'sample', 'shortcuts'].sort())
    expect(welcomeTipsHeading()).toContain('上手')
    expect(welcomeRecentEmptyBody()).toContain('示例库')
  })
})
