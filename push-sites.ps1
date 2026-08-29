# ---------------------------------------------------------------------------
#  push-sites.ps1
#
#  Pushes every city site repo that has commits waiting to go to GitHub.
#
#  Why this exists: Claude can commit changes but cannot push, because its
#  sandbox has no GitHub credentials and storing a token in this folder in
#  plaintext was judged not worth the risk. Your credentials live in Windows
#  Credential Manager, encrypted, and only this machine can use them.
#
#  So the workflow is: Claude commits, you run this once. It figures out which
#  sites have unpushed work on its own - you never need to know which folder
#  was touched.
#
#  HOW TO RUN
#    Right-click this file -> "Run with PowerShell"
#  or, in a PowerShell window:
#    & "C:\Users\Lenovo\Documents\Tiffin Developments Lead Generation\Epoxy Flooring Content\push-sites.ps1"
#
#  It never force-pushes and never commits anything. If a repo has nothing
#  waiting, it is left alone.
# ---------------------------------------------------------------------------

$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

Write-Host ""
Write-Host "Scanning site repos in:" -ForegroundColor Cyan
Write-Host "  $root"
Write-Host ""

$pushedAny = $false
$problems  = @()

foreach ($dir in (Get-ChildItem -LiteralPath $root -Directory | Sort-Object Name)) {

    $repo = $dir.FullName
    if (-not (Test-Path -LiteralPath (Join-Path $repo ".git"))) { continue }

    $name = $dir.Name
    Push-Location -LiteralPath $repo

    try {
        # Claude works over a mounted drive that blocks file deletes, which can
        # leave behind zero-byte .lock files that jam the next git command.
        # Clearing them here is safe: nothing else is using this repo right now.
        foreach ($lock in @(".git\index.lock", ".git\HEAD.lock", ".git\objects\maintenance.lock")) {
            if (Test-Path -LiteralPath $lock) {
                Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue
            }
        }

        $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
        if (-not $branch) {
            $problems += "$name - could not read current branch"
            continue
        }

        $remote = (git remote get-url origin 2>$null)
        if (-not $remote) {
            Write-Host ("  {0,-38} no GitHub remote, skipped" -f $name) -ForegroundColor DarkGray
            continue
        }

        # Uncommitted work is reported but never committed - that is Claude's job,
        # and silently committing here could ship a half-finished edit.
        $dirty = (git status --porcelain)
        if ($dirty) {
            $n = ($dirty | Measure-Object).Count
            Write-Host ("  {0,-38} {1} uncommitted file(s) - not committed" -f $name, $n) -ForegroundColor Yellow
        }

        git fetch origin $branch --quiet 2>$null

        $ahead = (git rev-list --count "origin/$branch..HEAD" 2>$null)
        if (-not $ahead) { $ahead = 0 }

        if ([int]$ahead -eq 0) {
            Write-Host ("  {0,-38} up to date" -f $name) -ForegroundColor DarkGray
            continue
        }

        Write-Host ("  {0,-38} {1} commit(s) to push..." -f $name, $ahead) -ForegroundColor White
        foreach ($line in (git log --oneline "origin/$branch..HEAD" 2>$null)) {
            Write-Host "      $line" -ForegroundColor DarkGray
        }

        $out = (git push origin "$branch" 2>&1)
        if ($LASTEXITCODE -eq 0) {
            Write-Host ("  {0,-38} PUSHED" -f $name) -ForegroundColor Green
            $pushedAny = $true
        } else {
            Write-Host ("  {0,-38} PUSH FAILED" -f $name) -ForegroundColor Red
            $out | ForEach-Object { Write-Host "      $_" -ForegroundColor Red }
            $problems += "$name - push failed"
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host ""
if ($problems.Count -gt 0) {
    Write-Host "Needs attention:" -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Copy the red text above and paste it to Claude." -ForegroundColor Yellow
} elseif ($pushedAny) {
    Write-Host "Done. Cloudflare picks up the new commits and redeploys on its own -" -ForegroundColor Green
    Write-Host "give it a minute or two, then hard-refresh the site (Ctrl+F5)." -ForegroundColor Green
} else {
    Write-Host "Nothing to push - every site is already up to date on GitHub." -ForegroundColor Cyan
}

Write-Host ""
Read-Host "Press Enter to close"
