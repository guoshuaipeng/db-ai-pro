import { describe, expect, it } from 'vitest'
import {
  AI_ENDPOINT_PRESETS,
  aiModelReadiness,
  aiModelStatusBody,
  aiModelStatusLabel,
  matchEndpointPreset,
  modelSuggestionsFor,
  validateAiModelDraft,
} from './aiModelSettings'

describe('aiModelSettings', () => {
  it('classifies readiness', () => {
    expect(aiModelReadiness({ baseUrl: '', model: '', hasKey: false, apiKeyDraft: '' })).toBe('preview')
    expect(
      aiModelReadiness({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        hasKey: true,
        apiKeyDraft: '',
      }),
    ).toBe('ready')
    expect(
      aiModelReadiness({
        baseUrl: '',
        model: '',
        hasKey: true,
        apiKeyDraft: '',
      }),
    ).toBe('incomplete')
    expect(
      aiModelReadiness({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        hasKey: false,
        apiKeyDraft: 'sk-test',
      }),
    ).toBe('ready')
  })

  it('validates draft', () => {
    expect(
      validateAiModelDraft({
        baseUrl: 'not-a-url',
        model: 'x',
        apiKeyDraft: '',
        hasKey: false,
      }),
    ).toContain('http')
    expect(
      validateAiModelDraft({
        baseUrl: '',
        model: '',
        apiKeyDraft: 'sk',
        hasKey: false,
      }),
    ).toContain('接口地址')
    expect(
      validateAiModelDraft({
        baseUrl: 'https://api.openai.com/v1',
        model: '',
        apiKeyDraft: '',
        hasKey: true,
      }),
    ).toContain('模型')
    expect(
      validateAiModelDraft({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKeyDraft: '',
        hasKey: true,
      }),
    ).toBeNull()
  })

  it('exposes presets and status copy', () => {
    expect(AI_ENDPOINT_PRESETS.length).toBeGreaterThanOrEqual(3)
    expect(matchEndpointPreset('https://api.deepseek.com/v1')?.id).toBe('deepseek')
    expect(modelSuggestionsFor('https://api.deepseek.com/v1')).toContain('deepseek-chat')
    expect(aiModelStatusLabel('ready')).toContain('就绪')
    expect(aiModelStatusBody('preview')).toContain('本地预览')
  })
})
