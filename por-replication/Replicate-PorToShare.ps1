# ============================================================
#  PARTY PERFECT — POR → SHARE REPLICATION (ENTERPRISE side)
#
#  Continuous, read-only replication of Point of Rental into a batch folder on
#  the PPL Storage share. The Mac then ingests batches onto the PARTYPERF SSD.
#
#  POR IS READ-ONLY AND AUTHORITATIVE.
#    * ApplicationIntent=ReadOnly on the connection
#    * Assert-SelectOnly before every statement
#    * ExecuteReader only — never ExecuteNonQuery
#    * This script contains NO INSERT/UPDATE/DELETE path by construction
#
#  WHY A HYBRID STRATEGY
#    Only 35 of 103 POR tables carry a change column. Of the nine tables the
#    business actually runs on, exactly two do:
#        Transactions      UpdatedDateTime   -> incremental
#        TransactionItems  LastModified      -> incremental
#        CustomerFile, ItemFile, PaymentFile, PaymentDetail,
#        CustomerJobSite, CustomerComments, ItemKits  -> NO watermark
#    So: watermarked incremental for the two hot/large tables (~95% of volume),
#    and full snapshot + content hash for the rest, which are small enough that
#    a hash comparison is cheaper than pretending a watermark exists.
#
#  Usage on ENTERPRISE:
#      powershell -ExecutionPolicy Bypass -File Replicate-PorToShare.ps1
#      (schedule every 15 min via Task Scheduler once proven)
# ============================================================
[CmdletBinding()]
param(
  [string]$ConfigPath = "C:\PartyPerfect\por-sync-agent\config.json",
  [string]$ShareRoot  = "\\ENTERPRISE\PPL Storage\POR-REPLICATION",
  [switch]$FullRefresh
)

$ErrorActionPreference = "Stop"
$RunId = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$BatchDir = Join-Path $ShareRoot "batches\$RunId"
$StateFile = Join-Path $ShareRoot "state\checkpoints.json"
$LogFile = Join-Path $ShareRoot "logs\replication.log"

foreach ($d in @((Split-Path $StateFile), (Split-Path $LogFile), $BatchDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}

function Write-Log([string]$m, [string]$lvl = "INFO") {
  $line = "{0} [{1}] {2}" -f (Get-Date).ToUniversalTime().ToString("o"), $lvl, $m
  Add-Content -Path $LogFile -Value $line
  Write-Host $line
}

# ---------------------------------------------------------------- guards
function Assert-SelectOnly([string]$Query) {
  $t = $Query.TrimStart()
  if ($t -notmatch '^(SELECT|WITH)\b') { throw "REFUSED: non-SELECT query" }
  if ($t -match '\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE)\b') {
    throw "REFUSED: statement contains a write keyword"
  }
}

# ---------------------------------------------------------------- config
if (-not (Test-Path $ConfigPath)) { throw "config.json not found at $ConfigPath" }
$cfg = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json

$cs = if ($cfg.UseWindowsAuth) {
  "Server=$($cfg.SqlServer);Database=$($cfg.SqlDatabase);Integrated Security=True;TrustServerCertificate=True;ApplicationIntent=ReadOnly;"
} else {
  "Server=$($cfg.SqlServer);Database=$($cfg.SqlDatabase);User ID=$($cfg.SqlUser);Password=$($cfg.SqlPassword);TrustServerCertificate=True;ApplicationIntent=ReadOnly;"
}

# ---------------------------------------------------------------- plan
# mode: incremental (needs Watermark) | snapshot (small, hashed)
$Plan = @(
  @{ Table = "Transactions";     Mode = "incremental"; Watermark = "UpdatedDateTime"; Key = "CNTR" }
  @{ Table = "TransactionItems"; Mode = "incremental"; Watermark = "LastModified";    Key = "CNTR" }
  @{ Table = "CustomerFile";     Mode = "snapshot" }
  @{ Table = "ItemFile";         Mode = "snapshot" }
  @{ Table = "PaymentFile";      Mode = "snapshot" }
  @{ Table = "PaymentDetail";    Mode = "snapshot" }
  @{ Table = "CustomerJobSite";  Mode = "snapshot" }
  @{ Table = "CustomerComments"; Mode = "snapshot" }
  @{ Table = "ItemKits";         Mode = "snapshot" }
  @{ Table = "TransactionStatus";          Mode = "snapshot" }
  @{ Table = "TransactionSecondaryStatus"; Mode = "snapshot" }
  @{ Table = "TaxTable";         Mode = "snapshot" }
  @{ Table = "ParameterFile";    Mode = "snapshot" }
  @{ Table = "ContractFormat";   Mode = "snapshot" }
  @{ Table = "NextNumberNew";    Mode = "snapshot" }
  @{ Table = "Salesman";         Mode = "snapshot" }
)

# ---------------------------------------------------------------- state
$checkpoints = if (Test-Path $StateFile) { Get-Content -Raw $StateFile | ConvertFrom-Json } else { [pscustomobject]@{} }
function Get-Checkpoint([string]$t) {
  if ($checkpoints.PSObject.Properties.Name -contains $t) { return $checkpoints.$t }
  return $null
}

# ---------------------------------------------------------------- io
$conn = New-Object System.Data.SqlClient.SqlConnection $cs
$conn.Open()
Write-Log "connected read-only to $($cfg.SqlServer)/$($cfg.SqlDatabase) — run $RunId"

function Export-Query([string]$Query, [string]$OutFile) {
  Assert-SelectOnly $Query
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $Query
  $cmd.CommandTimeout = 1800
  $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
  $table = New-Object System.Data.DataTable
  [void]$adapter.Fill($table)
  $table | Export-Csv -Path $OutFile -NoTypeInformation -Encoding UTF8
  return $table.Rows.Count
}

$manifest = @()
$errors = @()

foreach ($p in $Plan) {
  $t = $p.Table
  $out = Join-Path $BatchDir "$t.csv"
  try {
    $rows = 0
    $mode = $p.Mode
    $since = $null

    if ($mode -eq "incremental" -and -not $FullRefresh) {
      $cp = Get-Checkpoint $t
      if ($cp -and $cp.watermark) { $since = $cp.watermark }
    }

    if ($mode -eq "incremental" -and $since) {
      # Overlap by 1 hour: clock skew and in-flight edits must not create a gap.
      $q = "SELECT * FROM dbo.$t WHERE [$($p.Watermark)] >= DATEADD(hour,-1,CAST('$since' AS datetime))"
      $rows = Export-Query $q $out
      Write-Log "$t incremental since $since -> $rows row(s)"
    } else {
      $q = "SELECT * FROM dbo.$t"
      $rows = Export-Query $q $out
      Write-Log "$t $(if($mode -eq 'incremental'){'FULL (no checkpoint)'}else{'snapshot'}) -> $rows row(s)"
      $mode = if ($p.Mode -eq "incremental") { "full" } else { "snapshot" }
    }

    # Completeness evidence: the row count POR reports right now, independent of
    # what we wrote. The Mac verifies our file against this.
    $totalCmd = $conn.CreateCommand()
    $totalCmd.CommandText = "SELECT COUNT(*) FROM dbo.$t"
    Assert-SelectOnly $totalCmd.CommandText
    $sourceTotal = [int]$totalCmd.ExecuteScalar()

    $hash = (Get-FileHash -Algorithm SHA256 -Path $out).Hash
    $newWatermark = $null
    if ($p.Watermark) {
      $wmCmd = $conn.CreateCommand()
      $wmCmd.CommandText = "SELECT MAX([$($p.Watermark)]) FROM dbo.$t"
      Assert-SelectOnly $wmCmd.CommandText
      $v = $wmCmd.ExecuteScalar()
      if ($v -and $v -ne [DBNull]::Value) { $newWatermark = ([datetime]$v).ToString("o") }
    }

    $manifest += [pscustomobject]@{
      table = $t; mode = $mode; file = "$t.csv"
      rows_written = $rows; source_total_rows = $sourceTotal
      sha256 = $hash; watermark_column = $p.Watermark; new_watermark = $newWatermark
      bytes = (Get-Item $out).Length
    }

    if ($newWatermark) {
      $checkpoints | Add-Member -NotePropertyName $t -NotePropertyValue ([pscustomobject]@{
        watermark = $newWatermark; last_success = (Get-Date).ToUniversalTime().ToString("o"); last_rows = $rows
      }) -Force
    }
  }
  catch {
    $msg = $_.Exception.Message
    Write-Log "$t FAILED: $msg" "ERROR"
    $errors += [pscustomobject]@{ table = $t; error = $msg; at = (Get-Date).ToUniversalTime().ToString("o") }
  }
}

$conn.Close()

# A batch is only COMPLETE when every planned table succeeded. A partial batch
# must never be promoted as if it were a full picture.
$status = if ($errors.Count -eq 0) { "COMPLETE" } else { "PARTIAL" }

[pscustomobject]@{
  run_id = $RunId
  started_at = $RunId
  finished_at = (Get-Date).ToUniversalTime().ToString("o")
  source = "$($cfg.SqlServer)/$($cfg.SqlDatabase)"
  read_only = $true
  status = $status
  tables_planned = $Plan.Count
  tables_ok = $manifest.Count
  errors = $errors
  tables = $manifest
} | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $BatchDir "MANIFEST.json") -Encoding UTF8

# Checkpoints advance only for tables that actually succeeded this run.
$checkpoints | ConvertTo-Json -Depth 6 | Set-Content -Path $StateFile -Encoding UTF8

# READY marker is written last, and only for a complete batch. The Mac ingests
# nothing without it, so a half-written batch can never be picked up.
if ($status -eq "COMPLETE") {
  Set-Content -Path (Join-Path $BatchDir "READY") -Value $RunId -Encoding UTF8
  Write-Log "batch $RunId COMPLETE — $($manifest.Count) table(s)"
} else {
  Write-Log "batch $RunId PARTIAL — $($errors.Count) failure(s); READY not written" "WARN"
  exit 1
}
