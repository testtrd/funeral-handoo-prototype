$ErrorActionPreference = "Stop"

$node = "C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$next = Join-Path $PSScriptRoot "node_modules\next\dist\bin\next"

if (-not (Test-Path $node)) {
  throw "Codex bundled Node.js was not found: $node"
}

if (-not (Test-Path $next)) {
  throw "Next.js was not found. Run pnpm install first."
}

Set-Location $PSScriptRoot
& $node $next dev -p 3000 --hostname 127.0.0.1
