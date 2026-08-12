# PorStatus.ps1 - deterministic POR transaction-status classification.
#
# WHY THIS FILE EXISTS
#   dbo.Transactions.STAT is a TWO-CHARACTER code:
#     char 1 = primary lifecycle state  (dbo.TransactionStatus)
#     char 2 = secondary flag           (dbo.TransactionSecondaryStatus)
#
#   A BLANK/SPACE primary means "Completed" - it is a real state, not padding.
#   Therefore LTRIM() MUST NOT be applied before taking char 1. Verified against
#   the 2026-08-10 full export (36,006 rows): LTRIM changes the primary character
#   on 19,723 rows (54.8%) and produces 18,607 invalid classifications.
#
#   Likewise the old exact filter  STAT IN ('R','O','Q')  matched only 803 of the
#   15,022 rows POR's own reports (Left({Transactions.STAT},1)) would match.
#
#   Archived and Cancelled are SEPARATE boolean columns and must be applied on
#   top of the status - a cancelled quote still has primary 'Q'.
#
# Source of truth: dbo.TransactionStatus / dbo.TransactionSecondaryStatus.
# Evidence + scope rationale: "00 - Reference/POR_OPERATING_SYSTEM_MAP.md".

# NOTE: deliberately does NOT call Set-StrictMode. This file is dot-sourced into
# Sync-PorSnapshot.ps1 and must not change the host script's execution mode.

# --- Primary lifecycle state (char 1). Blank/NULL => Completed. ---
$script:PorPrimaryStatus = @{
  ' ' = 'Completed'
  'A' = 'Adjustment'
  'C' = 'Closed'
  'D' = 'Completed'
  'F' = 'FinanceCharge'
  'O' = 'Open'
  'Q' = 'Quote'
  'R' = 'Reservation'
  'W' = 'WorkOrder'
}

# --- Secondary flag (char 2). Only the ones that change scope decisions. ---
$script:PorSecondaryStatus = @{
  ' ' = 'None'
  'A' = 'Adjustment'
  'B' = 'IroImoBilled'
  'C' = 'Cancelled'
  'D' = 'NonReservation'
  'H' = 'CalledOffRent'
  'I' = 'ReservationCashAccounting'
  'J' = 'ReservationAccrualAccounting'
  'P' = 'PaymentDueLetterSent'
  'R' = 'ReviewBilling'
  'S' = 'Subrent'
  'T' = 'TransferOrQuoteConverted'
  'W' = 'WorkOrder'
}

function Get-PorPrimaryChar {
  <#  Char 1 of STAT with NO LTRIM. NULL/empty => ' ' (Completed). #>
  param([string]$Stat)
  if ($null -eq $Stat -or $Stat.Length -eq 0) { return ' ' }
  return $Stat.Substring(0, 1).ToUpperInvariant()
}

function Get-PorSecondaryChar {
  <#  Char 2 of STAT. Missing => ' ' (None). Lowercase values exist (' i', ' j'). #>
  param([string]$Stat)
  if ($null -eq $Stat -or $Stat.Length -lt 2) { return ' ' }
  return $Stat.Substring(1, 1).ToUpperInvariant()
}

function Get-PorStatusClass {
  <#  Returns e.g. 'Reservation' / 'Quote' / 'Completed'. 'Unknown' if unmapped. #>
  param([string]$Stat)
  $c = Get-PorPrimaryChar $Stat
  if ($script:PorPrimaryStatus.ContainsKey($c)) { return $script:PorPrimaryStatus[$c] }
  return 'Unknown'
}

function Test-PorCancelled {
  <#  Cancelled via the secondary flag OR the Cancelled column. #>
  param([string]$Stat, [object]$CancelledColumn)
  if ((Get-PorSecondaryChar $Stat) -eq 'C') { return $true }
  if ($null -ne $CancelledColumn -and "$CancelledColumn".Trim().ToLowerInvariant() -eq 'true') { return $true }
  return $false
}

function Test-PorArchived {
  param([object]$ArchivedColumn)
  if ($null -ne $ArchivedColumn -and "$ArchivedColumn".Trim().ToLowerInvariant() -eq 'true') { return $true }
  return $false
}

# ------------------------------------------------------------------
#  SQL SCOPE PREDICATES
#  Each consumer gets its OWN scope. There is deliberately no single
#  universal status filter - POR semantics separate these.
#  LEFT(STAT,1) with no LTRIM mirrors POR's own report criteria.
# ------------------------------------------------------------------

# Live = not archived, not cancelled. Applies to every "current" scope.
$script:PorSqlLive = "ISNULL(Archived,0)=0 AND ISNULL(Cancelled,0)=0"

# Active reservations: future/committed holds. Verified 306 rows @ 2026-08-10.
$script:PorSqlActiveReservations = "LEFT(CAST(STAT AS nvarchar(10)),1) = N'R' AND $script:PorSqlLive"

# Open orders: currently out on rent. Verified 49 rows. This is what QYOT reflects.
$script:PorSqlOpenOrders = "LEFT(CAST(STAT AS nvarchar(10)),1) = N'O' AND $script:PorSqlLive"

# Open quotes: exclude secondary 'C' (cancelled) and 'T' (converted to contract).
# Verified 177 rows. The old filter reported 789 because it counted archived +
# converted quotes.
$script:PorSqlOpenQuotes = @"
LEFT(CAST(STAT AS nvarchar(10)),1) = N'Q'
  AND UPPER(ISNULL(SUBSTRING(CAST(STAT AS nvarchar(10)),2,1),N' ')) NOT IN (N'C', N'T')
  AND $script:PorSqlLive
"@

# Availability holds: ONLY open orders consume QYOT. Reservations are future-dated
# and must be netted per-date from TransactionItems, NOT folded into QYOT.
$script:PorSqlAvailabilityHolds = $script:PorSqlOpenOrders

# Active pipeline: reservations + open orders + open quotes. For CRM/ticket sync.
$script:PorSqlActivePipeline = @"
(
  (LEFT(CAST(STAT AS nvarchar(10)),1) IN (N'R', N'O') AND $script:PorSqlLive)
  OR ($script:PorSqlOpenQuotes)
)
"@

# History / financial reporting: everything EXCEPT cancelled. Archived is fine here.
$script:PorSqlHistory = "ISNULL(Cancelled,0)=0 AND UPPER(ISNULL(SUBSTRING(CAST(STAT AS nvarchar(10)),2,1),N' ')) <> N'C'"

function Get-PorScopeSql {
  <#
    .SYNOPSIS  Returns the SQL predicate for a named scope.
    .PARAMETER Scope  ActiveReservations | OpenOrders | OpenQuotes |
                      AvailabilityHolds | ActivePipeline | History
  #>
  param([Parameter(Mandatory)][ValidateSet(
    'ActiveReservations','OpenOrders','OpenQuotes','AvailabilityHolds','ActivePipeline','History')]
    [string]$Scope)
  switch ($Scope) {
    'ActiveReservations' { return $script:PorSqlActiveReservations }
    'OpenOrders'         { return $script:PorSqlOpenOrders }
    'OpenQuotes'         { return $script:PorSqlOpenQuotes }
    'AvailabilityHolds'  { return $script:PorSqlAvailabilityHolds }
    'ActivePipeline'     { return $script:PorSqlActivePipeline }
    'History'            { return $script:PorSqlHistory }
  }
}
