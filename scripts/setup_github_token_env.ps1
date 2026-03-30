# 将 GitHub PAT 写入当前 Windows 用户环境变量 GITHUB_TOKEN（输入不回显）
# 用法：在 PowerShell 中执行
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force   # 若被策略拦截，仅需一次
#   .\scripts\setup_github_token_env.ps1
#
# 设置后请完全重启 Cursor/终端，新进程才能读到用户环境变量。
# 若 Token 曾在聊天、截图中泄露，请在 https://github.com/settings/tokens 撤销后重新生成，再运行本脚本。

$ErrorActionPreference = "Stop"

Write-Host "GitHub Token 将保存到用户环境变量 GITHUB_TOKEN（输入时不会显示字符）。" -ForegroundColor Cyan
$secure = Read-Host "粘贴 GitHub Personal Access Token" -AsSecureString
if ($secure.Length -eq 0) {
    Write-Host "未输入内容，已退出。" -ForegroundColor Yellow
    exit 1
}

$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
}

if ([string]::IsNullOrWhiteSpace($plain)) {
    Write-Host "Token 为空，已退出。" -ForegroundColor Yellow
    exit 1
}

[Environment]::SetEnvironmentVariable("GITHUB_TOKEN", $plain, "User")
$plain = $null
[GC]::Collect()

# 脚本在 repo/scripts/ 下，仓库根目录 = scripts 的上一级
$projectRoot = Split-Path $PSScriptRoot -Parent
$cachePath = Join-Path $projectRoot ".release_github_token"

if (Test-Path -LiteralPath $cachePath) {
    Remove-Item -LiteralPath $cachePath -Force
    Write-Host "已删除本地缓存: .release_github_token（以后优先使用环境变量）。" -ForegroundColor Green
}

Write-Host ""
Write-Host "已写入用户环境变量 GITHUB_TOKEN。" -ForegroundColor Green
Write-Host "请完全关闭并重新打开 Cursor（或新开终端），再运行发布脚本。" -ForegroundColor Yellow
Write-Host "若该 Token 曾泄露，请到 GitHub 撤销旧 Token 并换新，再重新运行本脚本。" -ForegroundColor Yellow
