/** AI side-pane toolbar / intent chrome (M161). */

import type { AiIntent } from './types'

export function aiToolbarKicker(): string {
  return '助手'
}

export function aiToolbarTitle(intent: AiIntent): string {
  if (intent === 'create') return 'AI 建表'
  if (intent === 'alter') return 'AI 改表'
  return '自然语言转 SQL'
}

export function aiIntentLabel(intent: AiIntent): string {
  if (intent === 'create') return '建表'
  if (intent === 'alter') return '改表'
  return '查询'
}

export function aiIntentTitle(intent: AiIntent): string {
  if (intent === 'create') return '根据描述起草 CREATE TABLE'
  if (intent === 'alter') return '根据描述起草 ALTER TABLE'
  return '把自然语言需求转成可运行的 SELECT'
}

export function aiIntentBlurb(intent: AiIntent): string {
  if (intent === 'create') {
    return '可先选参考表以对齐命名与类型风格；确认 SQL 后再执行。'
  }
  if (intent === 'alter') {
    return '建议指定目标表；助手先给预览，确认后再改库。'
  }
  return '会结合当前连接的表结构起草查询；未配置密钥时走本地预览。'
}

export function aiToolbarClearLabel(): string {
  return '清空会话'
}

export function aiToolbarClearTitle(): string {
  return '清空当前助手对话记忆'
}

export function aiToolbarModelReadyLabel(): string {
  return '模型已就绪'
}

export function aiToolbarModelPreviewLabel(): string {
  return '配置模型'
}

export function aiToolbarModelReadyTitle(): string {
  return '已配置 API 密钥，可调用云端模型'
}

export function aiToolbarModelPreviewTitle(): string {
  return '打开模型设置：配置密钥后可使用云端生成'
}

export function aiReferenceTableLabel(): string {
  return '参考表风格'
}

export function aiTargetTableLabel(): string {
  return '目标表'
}

export function aiReferenceAutoOption(): string {
  return '自动推断'
}

export function aiTargetInferOption(): string {
  return '从描述推断'
}

export function aiNoTablesTitle(): string {
  return '对象树里还没有表'
}

export function aiNoTablesBody(intent: AiIntent): string {
  if (intent === 'create') {
    return '可先连接并刷新对象树；没有参考表时仍可直接描述新表结构。'
  }
  if (intent === 'alter') {
    return '请先连接数据库并刷新对象树，或在描述里写明表名后再改表。'
  }
  return '连接并刷新对象树后，助手能更准确引用列名。'
}

export function aiIntentTabsAria(): string {
  return '助手模式'
}
