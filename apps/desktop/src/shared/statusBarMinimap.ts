/** Status-bar minimap chip copy (M100). */

export function statusBarMinimapLabel(on: boolean): string {
  return on ? '小地图' : '小地图 关'
}

export function statusBarMinimapTitle(on: boolean): string {
  return on ? '关闭编辑器小地图（单击）' : '开启编辑器小地图（单击）'
}
