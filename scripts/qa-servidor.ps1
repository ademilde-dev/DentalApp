$ErrorActionPreference = 'Stop'
$root = 'c:\Users\fabio\gstack\DentalApp'
$porta = 3100
$p = Start-Process -FilePath 'npx.cmd' -ArgumentList "next start -p $porta" -WorkingDirectory $root -WindowStyle Hidden -PassThru
try {
  $pronto = $false
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:$porta/login" -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { $pronto = $true; break }
    } catch { Start-Sleep -Seconds 2 }
  }
  if (-not $pronto) { Write-Output 'SERVIDOR_NAO_SUBIU'; exit 2 }
  Set-Location $root
  node scripts/smoke-auth.mjs "http://localhost:$porta"
  exit $LASTEXITCODE
} finally {
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Write-Output 'SERVIDOR_FINALIZADO'
}
