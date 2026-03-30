# 将 docs/推荐文章/DataAI推荐.md 一键发布到多个平台（需提前配置各平台凭证）
# 用法（在仓库根目录 PowerShell）:
#   .\scripts\publish_recommend_all.ps1
# 可选:
#   .\scripts\publish_recommend_all.ps1 -DryRun
#   .\scripts\publish_recommend_all.ps1 -SkipCsdn   # 未配置 CSDN_COOKIE 时跳过

param(
    [switch] $DryRun,
    [switch] $SkipCsdn,
    [switch] $SkipGitee,
    [switch] $SkipOsChina,
    [string] $Article = "docs/推荐文章/DataAI推荐.md",
    [string] $GiteeTitle = "DataAI：本地 AI 数据库客户端推荐"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$articlePath = Join-Path $root $Article
if (-not (Test-Path $articlePath)) {
    Write-Error "文章不存在: $articlePath"
}

Write-Host "文章: $articlePath" -ForegroundColor Cyan

if (-not $SkipGitee) {
    if ($env:GITEE_TOKEN -or $env:GITEE_ACCESS_TOKEN) {
        if ($DryRun) {
            Write-Host "[DryRun] Gitee: python scripts/publish_gitee_post.py --body-file `"$Article`" --title `"$GiteeTitle`""
        } else {
            python scripts/publish_gitee_post.py --body-file $Article --title $GiteeTitle
        }
    } else {
        Write-Host "跳过 Gitee：未设置 GITEE_TOKEN 或 GITEE_ACCESS_TOKEN" -ForegroundColor Yellow
    }
}

if (-not $SkipCsdn) {
    if ($env:CSDN_COOKIE -or $env:CSDN_COOKIES) {
        if ($DryRun) {
            Write-Host "[DryRun] CSDN: python scripts/publish_csdn_post.py --file `"$Article`" --dry-run"
            python scripts/publish_csdn_post.py --file $Article --dry-run
        } else {
            python scripts/publish_csdn_post.py --file $Article
        }
    } else {
        Write-Host "跳过 CSDN：未设置 CSDN_COOKIE" -ForegroundColor Yellow
    }
}

if (-not $SkipOsChina) {
    if ($env:OSCHINA_ACCESS_TOKEN -or ($env:OSCHINA_CLIENT_ID -and $env:OSCHINA_CLIENT_SECRET -and $env:OSCHINA_AUTH_CODE)) {
        if ($DryRun) {
            Write-Host "[DryRun] OSChina: python scripts/publish_oschina_blog.py --body-file `"$Article`""
        } else {
            python scripts/publish_oschina_blog.py --body-file $Article
        }
    } else {
        Write-Host "跳过开源中国：未设置 OSCHINA_ACCESS_TOKEN（或 OAuth 三件套）" -ForegroundColor Yellow
    }
}

Write-Host "完成。" -ForegroundColor Green
