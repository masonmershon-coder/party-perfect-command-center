<#
.SYNOPSIS
  Read-only POR revenue for ANY date range. Prints to console; pushes nothing.

.DESCRIPTION
  Answers two different questions for the same window, and never blends them:

    COLLECTED  cash actually received (PaymentFile.Date)      -> "what came in"
    BOOKED     value of work going out (Transactions.DeliveryDate,
               quotes excluded)                               -> "what we ran"

  Party Perfect bills 50% to reserve and 50% eleven days before delivery, so
  these two numbers legitimately differ for any window. Reporting one as the
  other is the mistake this script exists to prevent.

  SELECT only. Never touches CheckCardFile. Never selects PaymentFile
  Encrypted / EncryptedCard / CCAlias. Nothing is written to POR.

  Reuses config.json in this folder, so no credentials are ever typed.

.EXAMPLE
  .\Get-PorRevenue.ps1 -From 2026-08-05 -To 2026-09-05
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][datetime]$From,
  [Parameter(Mandatory = $true)][datetime]$To,
  [switch]$ByDay
)

$ErrorActionPreference = "Stop"

$cfgPath = Join-Path $PSScriptRoot "config.json"
if (-not (Test-Path $cfgPath)) { throw "Missing config.json next to this script." }
$config = Get-Content $cfgPath -Raw | ConvertFrom-Json

$server = [string]$config.SqlServer
if ($server -match '\\') { throw "SqlServer must be host,port (e.g. ENTERPRISE,9676)." }
if ($config.UseWindowsAuth) {
  $cs = "Server=$server;Database=$($config.SqlDatabase);Integrated Security=True;TrustServerCertificate=True;ApplicationIntent=ReadOnly;"
} else {
  $cs = "Server=$server;Database=$($config.SqlDatabase);User ID=$($config.SqlUser);Password=$($config.SqlPassword);TrustServerCertificate=True;ApplicationIntent=ReadOnly;"
}

$f = $From.ToString("yyyy-MM-dd")
$t = $To.ToString("yyyy-MM-dd")

function Assert-SelectOnly([string]$Query) {
  $trimmed = $Query.TrimStart()
  if ($trimmed -notmatch '^(SELECT|WITH)\b') { throw "Blocked non-SELECT query." }
  if ($trimmed -match '\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|TRUNCATE|EXEC|EXECUTE)\b') {
    throw "Blocked dangerous SQL keyword."
  }
}

$conn = New-Object System.Data.SqlClient.SqlConnection $cs
$conn.Open()
try {
  function Read-Rows([string]$Query) {
    Assert-SelectOnly $Query
    $cmd = $conn.CreateCommand(); $cmd.CommandText = $Query; $cmd.CommandTimeout = 180
    $rd = $cmd.ExecuteReader()
    $rows = New-Object System.Collections.Generic.List[hashtable]
    try {
      while ($rd.Read()) {
        $m = @{}
        for ($i = 0; $i -lt $rd.FieldCount; $i++) {
          $m[$rd.GetName($i)] = if ($rd.IsDBNull($i)) { $null } else { $rd.GetValue($i) }
        }
        $rows.Add($m)
      }
    } finally { $rd.Close() }
    return $rows
  }

  $inRange = "CAST(p.[Date] AS date) BETWEEN '$f' AND '$t'"

  Write-Host ""
  Write-Host "PARTY PERFECT - POR revenue  $f .. $t" -ForegroundColor Cyan
  Write-Host ("=" * 62)

  # ---- COLLECTED (cash in) -------------------------------------------------
  $c = Read-Rows @"
SELECT COUNT(*) AS Cnt,
       SUM(ISNULL(p.Amount,0)) AS Net,
       SUM(CASE WHEN ISNULL(p.Amount,0) > 0 THEN p.Amount ELSE 0 END) AS Gross,
       SUM(CASE WHEN ISNULL(p.Amount,0) < 0 THEN p.Amount ELSE 0 END) AS Refunds
FROM dbo.PaymentFile p
WHERE $inRange
"@
  $r = $c[0]
  Write-Host ""
  Write-Host "COLLECTED (cash received in this window)" -ForegroundColor Green
  Write-Host ("  payments        : {0}" -f [int]$r.Cnt)
  Write-Host ("  gross in        : {0,15:N2}" -f [double]$r.Gross)
  Write-Host ("  refunds/credits : {0,15:N2}" -f [double]$r.Refunds)
  Write-Host ("  NET COLLECTED   : {0,15:N2}" -f [double]$r.Net) -ForegroundColor Green

  Write-Host ""
  Write-Host "  by method:"
  foreach ($m in Read-Rows @"
SELECT ISNULL(NULLIF(LTRIM(RTRIM(CAST(p.Meth AS nvarchar(20)))),N''),N'(none)') AS Meth,
       COUNT(*) AS Cnt, SUM(ISNULL(p.Amount,0)) AS Amt
FROM dbo.PaymentFile p
WHERE $inRange
GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(CAST(p.Meth AS nvarchar(20)))),N''),N'(none)')
ORDER BY SUM(ISNULL(p.Amount,0)) DESC
"@) { Write-Host ("    {0,-12} {1,5}  {2,15:N2}" -f $m.Meth, [int]$m.Cnt, [double]$m.Amt) }

  # ---- BOOKED (work that went out) ----------------------------------------
  $b = Read-Rows @"
SELECT COUNT(*) AS Cnt,
       SUM(ISNULL(t.RENT,0)) AS Rent, SUM(ISNULL(t.SALE,0)) AS Sale,
       SUM(ISNULL(t.TAX,0)) AS Tax,  SUM(ISNULL(t.TOTL,0)) AS Totl,
       SUM(ISNULL(t.PAID,0)) AS Paid
FROM dbo.Transactions t
WHERE t.DeliveryDate IS NOT NULL
  AND CAST(t.DeliveryDate AS date) BETWEEN '$f' AND '$t'
  AND LEFT(CAST(t.STAT AS nvarchar(10)),1) <> N'Q'
  AND ISNULL(t.Cancelled,0) = 0
  AND UPPER(ISNULL(SUBSTRING(CAST(t.STAT AS nvarchar(10)),2,1),N' ')) <> N'C'
"@
  $r2 = $b[0]
  Write-Host ""
  Write-Host "BOOKED (value of work going out in this window, quotes excluded)" -ForegroundColor Yellow
  Write-Host ("  orders          : {0}" -f [int]$r2.Cnt)
  Write-Host ("  rent            : {0,15:N2}" -f [double]$r2.Rent)
  Write-Host ("  sale            : {0,15:N2}" -f [double]$r2.Sale)
  Write-Host ("  tax             : {0,15:N2}" -f [double]$r2.Tax)
  Write-Host ("  BOOKED TOTAL    : {0,15:N2}" -f [double]$r2.Totl) -ForegroundColor Yellow
  Write-Host ("  paid on those   : {0,15:N2}" -f [double]$r2.Paid)
  Write-Host ("  still due       : {0,15:N2}" -f ([double]$r2.Totl - [double]$r2.Paid))

  if ($ByDay) {
    Write-Host ""
    Write-Host "  collected by day:"
    foreach ($d in Read-Rows @"
SELECT CONVERT(varchar(10), CAST(p.[Date] AS date), 23) AS D,
       COUNT(*) AS Cnt, SUM(ISNULL(p.Amount,0)) AS Amt
FROM dbo.PaymentFile p
WHERE $inRange
GROUP BY CAST(p.[Date] AS date)
ORDER BY CAST(p.[Date] AS date)
"@) { Write-Host ("    {0}  {1,4}  {2,14:N2}" -f $d.D, [int]$d.Cnt, [double]$d.Amt) }
  }

  Write-Host ""
  Write-Host "COLLECTED and BOOKED are different questions - do not add them together." -ForegroundColor DarkGray
  Write-Host ""
} finally { $conn.Close() }
