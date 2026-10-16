/** Welcome / onboarding tip cards (M129). */

export type WelcomeTipAction = 'palette' | 'shortcuts' | 'sample'

export type WelcomeTip = {
  id: string
  title: string
  body: string
  shortcut?: string
  action: WelcomeTipAction
  actionLabel: string
}

export const WELCOME_TIPS: readonly WelcomeTip[] = [
  {
    id: 'palette',
    title: '命令与对象搜索',
    body: '用关键字跳到表、列、收藏或命令，少点几层菜单。',
    shortcut: 'Ctrl+K',
    action: 'palette',
    actionLabel: '打开命令面板',
  },
  {
    id: 'run',
    title: '运行 SQL',
    body: '在编辑器写好语句后一键执行；有选区时只跑选中部分。',
    shortcut: 'Ctrl+Enter',
    action: 'sample',
    actionLabel: '先打开示例库',
  },
  {
    id: 'shortcuts',
    title: '快捷键一览',
    body: '格式化、查找、标签切换等常用操作都有按键；可复制单条。',
    shortcut: 'F1',
    action: 'shortcuts',
    actionLabel: '查看快捷键',
  },
]

export function welcomeRecentEmptyBody(): string {
  return '打开示例库或新建连接并跑一次查询后，最近表与 SQL 会出现在这里。'
}

export function welcomeTipsHeading(): string {
  return '三步上手'
}
