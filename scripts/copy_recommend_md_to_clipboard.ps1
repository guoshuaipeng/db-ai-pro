<#
.SYNOPSIS
    将推荐文 Markdown 全文写入系统剪贴板（UTF-8），便于在 CSDN Markdown 等编辑页 Ctrl+V 真粘贴。

.DESCRIPTION
    DevTools MCP 的 fill 往往无法触发 CodeMirror 内部文档模型；与在 VS Code 中复制再粘贴效果一致。
    默认查找仓库内 docs/推荐文章/DataAI推荐.md（可通过 -FileName 指定同目录下其他文件）。

.PARAMETER FileName
    仅文件名，例如 DataAI_掘金引流版.md

.EXAMPLE
    .\scripts\copy_recommend_md_to_clipboard.ps1

.EXAMPLE
    .\scripts\copy_recommend_md_to_clipboard.ps1 -FileName "DataAI_掘金引流版.md"

.NOTES
    流程说明：docs/推荐文章/多平台发布-操作流程.md
    脚本索引：scripts/README-发布脚本.md
#>

param(
    [string]$FileName = "DataAI推荐.md"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$hit = Get-ChildItem -Path $root -Recurse -Filter $FileName -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\docs\\推荐文章\\' } |
    Select-Object -First 1

if (-not $hit) {
    $hit = Get-ChildItem -Path $root -Recurse -Filter $FileName -File -ErrorAction SilentlyContinue | Select-Object -First 1
}

if (-not $hit) {
    Write-Error "未找到文件: $FileName（请在项目根下执行）"
    exit 1
}

$full = $hit.FullName
$text = Get-Content -LiteralPath $full -Raw -Encoding UTF8
$text | Set-Clipboard
Write-Host "已复制到剪贴板（UTF-8）：$full  （长度 $($text.Length) 字符）"
Write-Host "请到 CSDN MD 编辑页正文区点击焦点后 Ctrl+A 清空，再 Ctrl+V 粘贴。"
