/** Client-side AI model / endpoint settings helpers (M138). */

export type AiModelReadiness = 'incomplete' | 'preview' | 'ready'

export type AiModelDraftFields = {
  baseUrl: string
  model: string
  /** Current password-field draft; empty means “leave key unchanged”. */
  apiKeyDraft: string
  hasKey: boolean
}

export type AiEndpointPreset = {
  id: string
  label: string
  baseUrl: string
  models: readonly string[]
}

/** Common OpenAI-compatible endpoints for quick fill (not an exhaustive catalog). */
export const AI_ENDPOINT_PRESETS: readonly AiEndpointPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'ollama',
    label: 'Ollama 本地',
    baseUrl: 'http://127.0.0.1:11434/v1',
    models: ['llama3.2', 'qwen2.5', 'deepseek-r1'],
  },
]

export function effectiveHasKey(fields: Pick<AiModelDraftFields, 'hasKey' | 'apiKeyDraft'>): boolean {
  if (fields.apiKeyDraft.trim()) return true
  return fields.hasKey
}

export function aiModelReadiness(
  fields: Pick<AiModelDraftFields, 'baseUrl' | 'model' | 'hasKey' | 'apiKeyDraft'>,
): AiModelReadiness {
  const baseUrl = fields.baseUrl.trim()
  const model = fields.model.trim()
  const keyed = effectiveHasKey(fields)
  if (keyed) {
    if (!baseUrl || !model) return 'incomplete'
    return 'ready'
  }
  if (baseUrl || model) return 'preview'
  return 'preview'
}

export function aiModelStatusLabel(readiness: AiModelReadiness): string {
  switch (readiness) {
    case 'ready':
      return '模型已就绪'
    case 'incomplete':
      return '配置不完整'
    default:
      return '本地预览模式'
  }
}

export function aiModelStatusBody(readiness: AiModelReadiness): string {
  switch (readiness) {
    case 'ready':
      return '助手将走已配置的 OpenAI 兼容接口。可随时改地址、模型或轮换密钥。'
    case 'incomplete':
      return '已保存密钥，但仍需填写接口地址与模型名称，否则无法调用远程模型。'
    default:
      return '未配置密钥时使用本地预览：可体验流程，复杂库检索效果有限。填写兼容接口即可升级。'
  }
}

export function aiModelStatusKicker(readiness: AiModelReadiness): string {
  switch (readiness) {
    case 'ready':
      return '状态'
    case 'incomplete':
      return '待补全'
    default:
      return '预览'
  }
}

/** Returns a Chinese error, or null when the draft can be saved. */
export function validateAiModelDraft(fields: AiModelDraftFields): string | null {
  const baseUrl = fields.baseUrl.trim()
  const model = fields.model.trim()
  const keyed = effectiveHasKey(fields)

  if (baseUrl) {
    if (!/^https?:\/\/\S+/i.test(baseUrl)) {
      return '接口地址需以 http:// 或 https:// 开头'
    }
  }

  if (keyed) {
    if (!baseUrl) return '使用远程模型时请填写接口地址'
    if (!model) return '使用远程模型时请填写模型名称'
  }

  if (!keyed && model && !baseUrl) {
    return '已填模型名称时请一并填写接口地址，或清空模型以保持纯本地预览'
  }

  return null
}

export function aiModelBaseUrlHint(): string {
  return 'OpenAI 兼容 Chat Completions 根路径，例如 https://api.openai.com/v1'
}

export function aiModelNameHint(): string {
  return '与接口提供方一致的模型 ID；可点下方常用项快速填入。'
}

export function aiModelKeyHint(hasKey: boolean): string {
  return hasKey
    ? '已密封保存在本机。留空保存则不改动；点「清除密钥」可删除。'
    : '粘贴后仅写入系统密钥环，不会以明文落盘。'
}

export function aiModelClearKeyLabel(): string {
  return '清除密钥'
}

export function matchEndpointPreset(baseUrl: string): AiEndpointPreset | null {
  const normalized = baseUrl.trim().replace(/\/$/, '')
  if (!normalized) return null
  return (
    AI_ENDPOINT_PRESETS.find((p) => p.baseUrl.replace(/\/$/, '') === normalized) ?? null
  )
}

export function modelSuggestionsFor(baseUrl: string): readonly string[] {
  const preset = matchEndpointPreset(baseUrl)
  if (preset) return preset.models
  return ['gpt-4o-mini', 'deepseek-chat', 'llama3.2']
}
