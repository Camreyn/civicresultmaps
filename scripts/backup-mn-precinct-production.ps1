[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ReleasePackagePath,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-f0-9]{64}$')]
  [string]$ReleasePackageSha256,

  [switch]$Execute
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$CloneContainer = 'crm-db-clone-postgres'
$CloneHost = '127.0.0.1'
$ClonePort = 54329
$CloneAdminDatabase = 'crm_clone_admin'
$CloneUser = 'crm_clone_admin'
$VerifyDatabase = 'crm_mn_precinct_restore_verify'
$BackupRoot = 'C:\tmp\crm-db-clone\mn-release-backups'
$ContainerBackupRoot = '/backups/mn-release-backups'
$ExpectedLegacyEndpointFingerprint = 'bf2bf2213814'

function Fail([string]$Message) {
  throw "Minnesota production backup aborted: $Message"
}

function Get-Sha256([byte[]]$Bytes) {
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes)) -replace '-', '').ToLowerInvariant()
  }
  finally {
    $algorithm.Dispose()
  }
}

function Assert-ReleasePackage {
  $candidateRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot '.etl\precinct-release-candidates\MN'))
  $candidatePath = [IO.Path]::GetFullPath((Join-Path $RepoRoot $ReleasePackagePath))
  if (
    -not $candidatePath.StartsWith($candidateRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($candidatePath) -ne 'release-candidate.json' -or
    -not (Test-Path -LiteralPath $candidatePath -PathType Leaf)
  ) {
    Fail 'The release package must be an existing release-candidate.json under .etl/precinct-release-candidates/MN.'
  }
  $bytes = [IO.File]::ReadAllBytes($candidatePath)
  if ((Get-Sha256 $bytes) -ne $ReleasePackageSha256) {
    Fail 'The release package SHA-256 does not match the exact acknowledgement.'
  }
  $document = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
  if (
    $document.schemaVersion -ne 1 -or
    $document.id -ne 'mn-precinct-gis-four-election-v1' -or
    $document.state -ne 'MN' -or
    $document.decision -ne 'NO_GO_PRODUCTION' -or
    $document.safety.productionMutationPerformed -ne $false -or
    $document.safety.canonicalManifestChanged -ne $false -or
    $document.totals.elections -ne 4
  ) {
    Fail 'The release package contract is incompatible.'
  }
  return [ordered]@{
    id = $document.id
    path = $ReleasePackagePath.Replace('\', '/')
    sha256 = $ReleasePackageSha256
  }
}

function Require-Command([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    Fail "Required command '$Name' was not found on PATH."
  }
  return $command.Source
}

function Get-RequiredSourceUrl {
  $first = [Environment]::GetEnvironmentVariable('POSTGRES_URL_NON_POOLING')
  $second = [Environment]::GetEnvironmentVariable('POSTGRES_DATABASE_URL_UNPOOLED')
  if ([string]::IsNullOrWhiteSpace($first) -and [string]::IsNullOrWhiteSpace($second)) {
    Fail 'Set POSTGRES_URL_NON_POOLING or POSTGRES_DATABASE_URL_UNPOOLED in this process environment.'
  }
  if (
    -not [string]::IsNullOrWhiteSpace($first) -and
    -not [string]::IsNullOrWhiteSpace($second) -and
    $first -ne $second
  ) {
    Fail 'The two allowed production URL variables disagree.'
  }
  if (-not [string]::IsNullOrWhiteSpace($first)) { return $first }
  return $second
}

function Assert-RemoteSource([string]$Url) {
  try { $uri = [Uri]$Url } catch { Fail 'The production URL is not a valid PostgreSQL URI.' }
  if (
    $uri.Scheme -notin @('postgres', 'postgresql') -or
    [string]::IsNullOrWhiteSpace($uri.Host) -or
    $uri.Host.ToLowerInvariant() -in @('localhost', '127.0.0.1', '::1', $CloneHost) -or
    $uri.Port -eq $ClonePort
  ) {
    Fail 'The production URL is not an allowed remote PostgreSQL endpoint.'
  }
}

function Get-EndpointFingerprint([string]$Url) {
  $uri = [Uri]$Url
  $database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
  $port = if ($uri.IsDefaultPort) { '5432' } else { [string]$uri.Port }
  $identity = @($uri.Host.ToLowerInvariant(), $port, $database) -join "`n"
  return Get-Sha256 ([Text.Encoding]::UTF8.GetBytes($identity))
}

function Get-LegacyEndpointFingerprint([string]$Url) {
  $uri = [Uri]$Url
  $bytes = [Text.Encoding]::UTF8.GetBytes($uri.Host.ToLowerInvariant() + $uri.AbsolutePath)
  return (Get-Sha256 $bytes).Substring(0, 12)
}

function Get-RemoteExecEnv([string]$Url) {
  $uri = [Uri]$Url
  $userinfo = [Uri]::UnescapeDataString($uri.UserInfo)
  $separator = $userinfo.IndexOf(':')
  if ($separator -lt 1) { Fail 'The production URL must include a username and password.' }
  $database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
  if ([string]::IsNullOrWhiteSpace($database)) { Fail 'The production URL must include a database name.' }
  $port = if ($uri.IsDefaultPort) { '5432' } else { [string]$uri.Port }
  return @(
    '--env', "PGHOST=$($uri.Host)",
    '--env', "PGPORT=$port",
    '--env', "PGDATABASE=$database",
    '--env', "PGUSER=$($userinfo.Substring(0, $separator))",
    '--env', "PGPASSWORD=$($userinfo.Substring($separator + 1))",
    '--env', 'PGSSLMODE=require',
    '--env', 'PGCHANNELBINDING=require',
    '--env', 'PGOPTIONS=-c default_transaction_read_only=on'
  )
}

function Assert-CloneContainer {
  $container = @((& $script:Docker inspect $CloneContainer) | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0 -or $container.Count -ne 1) { Fail 'Docker inspection failed.' }
  $container = $container[0]
  if (
    $container.Name -ne "/$CloneContainer" -or
    $container.Config.Labels.'com.civicresultmaps.purpose' -ne 'isolated-production-clone' -or
    $container.State.Health.Status -ne 'healthy'
  ) {
    Fail 'The running clone container identity, purpose, or health is invalid.'
  }
  $bindings = @($container.NetworkSettings.Ports.'5432/tcp')
  if (
    $bindings.Count -ne 1 -or
    $bindings[0].HostIp -ne $CloneHost -or
    $bindings[0].HostPort -ne "$ClonePort"
  ) {
    Fail 'The clone container is not restricted to the reserved loopback port.'
  }
  $mounts = @($container.Mounts | Where-Object {
    $_.Type -eq 'bind' -and $_.Destination -eq '/backups' -and $_.RW -eq $true
  })
  if ($mounts.Count -ne 1) { Fail 'The clone container does not have the required backup bind mount.' }
}

function Assert-ContainerTools {
  $versions = @(
    (& $script:Docker exec --user postgres $CloneContainer psql --version)
    (& $script:Docker exec --user postgres $CloneContainer pg_dump --version)
    (& $script:Docker exec --user postgres $CloneContainer pg_restore --version)
  )
  $majors = @($versions | ForEach-Object {
    if ($_ -match '(\d+)(?:\.\d+)?') { [int]$Matches[1] }
  })
  if ($LASTEXITCODE -ne 0 -or $majors.Count -ne 3 -or @($majors | Where-Object { $_ -ne 17 }).Count) {
    Fail 'The clone container must provide PostgreSQL 17 psql, pg_dump, and pg_restore.'
  }
}

function Invoke-RemoteRows([string]$Sql, [string]$Description) {
  $rows = & $script:Docker exec --user postgres @script:RemoteExecEnv $CloneContainer psql --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align --quiet --command $Sql
  if ($LASTEXITCODE -ne 0) { Fail "$Description failed." }
  return @($rows)
}

function Invoke-LocalRows([string]$Database, [string]$Sql, [string]$Description) {
  $rows = & $script:Docker exec --user postgres $CloneContainer psql --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align --quiet --username $CloneUser --dbname $Database --command $Sql
  if ($LASTEXITCODE -ne 0) { Fail "$Description failed." }
  return @($rows)
}

function Invoke-LocalAdmin([string]$Sql, [string]$Description) {
  $null = Invoke-LocalRows $CloneAdminDatabase $Sql $Description
}

function Get-TableCounts([string[]]$Tables, [scriptblock]$Runner) {
  $counts = [ordered]@{}
  foreach ($table in $Tables) {
    if ($table -notmatch '^[a-z0-9_]+$') { Fail 'A public table name is unsafe.' }
    $sql = "SELECT count(*) FROM public.`"$table`";"
    $value = @(& $Runner $sql)
    if ($value.Count -ne 1 -or $value[0].Trim() -notmatch '^\d+$') {
      Fail "Could not obtain an exact row count for public.$table."
    }
    $counts[$table] = [int64]$value[0].Trim()
  }
  return $counts
}

function Assert-EqualCounts($Source, $Restored) {
  if ($Source.Count -ne $Restored.Count) { Fail 'Restored public table count differs from production.' }
  foreach ($key in $Source.Keys) {
    if (-not $Restored.Contains($key) -or [int64]$Restored[$key] -ne [int64]$Source[$key]) {
      Fail "Restored row count differs for public.$key."
    }
  }
}

function Restrict-BackupAccess([string[]]$Paths) {
  $icacls = Get-Command icacls -ErrorAction SilentlyContinue
  if (-not $icacls -or $env:OS -ne 'Windows_NT') {
    Fail 'Restrictive Windows ACL tooling is unavailable.'
  }
  $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  foreach ($target in $Paths) {
    $isDirectory = Test-Path -LiteralPath $target -PathType Container
    $userGrant = if ($isDirectory) { "$user`:(OI)(CI)F" } else { "$user`:F" }
    $systemGrant = if ($isDirectory) { 'SYSTEM:(OI)(CI)F' } else { 'SYSTEM:F' }
    & $icacls.Source $target '/inheritance:r' '/grant:r' $userGrant '/grant:r' $systemGrant | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "Could not restrict ACLs on $target." }
  }
}

$releaseCandidate = Assert-ReleasePackage
if (-not $Execute) {
  [ordered]@{
    mode = 'plan'
    decision = 'NO_BACKUP_CREATED'
    releaseCandidate = $releaseCandidate
    sourceEndpointFingerprint = 'computed_during_execution'
    sourceEndpointLegacyApprovalFingerprint = $ExpectedLegacyEndpointFingerprint
    includedSchemas = @('public')
    excludedTableDataPatterns = @()
    restoreVerificationRequired = $true
    remoteMutationPerformed = $false
    outputDirectory = $BackupRoot
    acknowledgementRequired = @(
      'CRM_MN_PRECINCT_BACKUP_ACK=CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP',
      'CRM_MN_PRECINCT_BACKUP_ENDPOINT_FINGERPRINT=<fresh 64-hex preflight endpoint fingerprint>'
    )
  } | ConvertTo-Json -Depth 6
  exit 0
}

if (
  [Environment]::GetEnvironmentVariable('CRM_MN_PRECINCT_BACKUP_ACK') -ne 'CREATE_FULL_PUBLIC_SCHEMA_ROLLBACK_BACKUP' -or
  [Environment]::GetEnvironmentVariable('CRM_MN_PRECINCT_BACKUP_PACKAGE_SHA256') -ne $ReleasePackageSha256
) {
  Fail 'Execution requires the exact backup acknowledgement and release package SHA-256.'
}

$sourceUrl = Get-RequiredSourceUrl
Assert-RemoteSource $sourceUrl
if ((Get-LegacyEndpointFingerprint $sourceUrl) -ne $ExpectedLegacyEndpointFingerprint) {
  Fail 'The production endpoint fingerprint is not approved.'
}
$sourceEndpointFingerprint = Get-EndpointFingerprint $sourceUrl
if (
  $sourceEndpointFingerprint -notmatch '^[a-f0-9]{64}$' -or
  [Environment]::GetEnvironmentVariable('CRM_MN_PRECINCT_BACKUP_ENDPOINT_FINGERPRINT') -ne $sourceEndpointFingerprint
) {
  Fail 'Execution requires the exact fresh 64-hex preflight endpoint fingerprint acknowledgement.'
}
$script:Docker = Require-Command docker
$script:RemoteExecEnv = @(Get-RemoteExecEnv $sourceUrl)
Assert-CloneContainer
Assert-ContainerTools

$identity = ((Invoke-RemoteRows "SELECT current_setting('server_version_num') || '|' || pg_database_size(current_database()) || '|' || current_setting('transaction_read_only') || '|' || (SELECT string_agg(lanname, ',' ORDER BY lanname) FROM pg_language WHERE lanispl);" 'Production identity preflight') -join '').Trim().Split('|')
if (
  $identity.Count -ne 4 -or
  $identity[0] -notmatch '^\d{5,6}$' -or
  [int](([int]$identity[0]) / 10000) -ne 17 -or
  $identity[2] -ne 'on' -or
  $identity[3] -ne 'plpgsql'
) {
  Fail 'The production identity or read-only session contract is incompatible.'
}

$sourceTables = @(Invoke-RemoteRows "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 'Production public table inventory')
if (
  $sourceTables.Count -lt 27 -or
  @($sourceTables | Where-Object { $_ -notmatch '^[a-z0-9_]+$' }).Count -ne 0
) {
  Fail 'The production public table inventory is incomplete or unsafe.'
}
$sourceCounts = Get-TableCounts $sourceTables { param($sql) Invoke-RemoteRows $sql 'Production public table count' }
$sourceInvalidConstraints = [int](((Invoke-RemoteRows "SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated;" 'Production constraint check') -join '').Trim())
if ($sourceInvalidConstraints -ne 0) { Fail 'Production has invalid public constraints.' }

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
Restrict-BackupAccess @($BackupRoot)
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$dumpFile = "mn-precinct-full-public-$stamp.dump"
$dumpPath = Join-Path $BackupRoot $dumpFile
$containerDumpPath = "$ContainerBackupRoot/$dumpFile"
$manifestPath = Join-Path $BackupRoot "mn-precinct-full-public-$stamp.manifest.json"
$createdAtUtc = [DateTime]::UtcNow.ToString('o')

& $script:Docker exec --user postgres @script:RemoteExecEnv $CloneContainer pg_dump --format=custom --schema=public --file=$containerDumpPath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $dumpPath -PathType Leaf)) {
  Fail 'The full public-schema pg_dump failed.'
}
Restrict-BackupAccess @($dumpPath)

$list = @(& $script:Docker exec --user postgres $CloneContainer pg_restore --list $containerDumpPath)
if ($LASTEXITCODE -ne 0) { Fail 'Could not inspect the full dump archive.' }
$tableDataEntries = @($list | ForEach-Object {
  if ($_ -match ' TABLE DATA public ([^ ]+) ') { $Matches[1] }
} | Sort-Object -Unique)
if (@(Compare-Object $sourceTables $tableDataEntries).Count -ne 0) {
  Fail 'The dump archive does not contain TABLE DATA entries for every public table.'
}

Invoke-LocalAdmin "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$VerifyDatabase' AND pid <> pg_backend_pid();" 'Terminate prior verification clients'
Invoke-LocalAdmin "DROP DATABASE IF EXISTS `"$VerifyDatabase`";" 'Drop prior verification database'
Invoke-LocalAdmin "CREATE DATABASE `"$VerifyDatabase`" OWNER `"$CloneUser`";" 'Create verification database'
$null = Invoke-LocalRows $VerifyDatabase 'DROP SCHEMA public CASCADE;' 'Prepare verification database'
& $script:Docker exec --user postgres $CloneContainer pg_restore --exit-on-error --no-owner --no-privileges --username=$CloneUser --dbname=$VerifyDatabase $containerDumpPath
if ($LASTEXITCODE -ne 0) { Fail 'Restoring the full backup into the isolated verification database failed.' }

$restoredTables = @(Invoke-LocalRows $VerifyDatabase "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 'Restored public table inventory')
if (@(Compare-Object $sourceTables $restoredTables).Count -ne 0) {
  Fail 'The restored public table set differs from production.'
}
$restoredCounts = Get-TableCounts $restoredTables { param($sql) Invoke-LocalRows $VerifyDatabase $sql 'Restored public table count' }
Assert-EqualCounts $sourceCounts $restoredCounts
$restoredInvalidConstraints = [int](((Invoke-LocalRows $VerifyDatabase "SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated;" 'Restored constraint check') -join '').Trim())
if ($restoredInvalidConstraints -ne 0) { Fail 'The restored backup has invalid public constraints.' }
Invoke-LocalAdmin "ALTER DATABASE `"$VerifyDatabase`" SET default_transaction_read_only=on;" 'Lock verification database read-only by default'

$manifest = [ordered]@{
  manifestVersion = 3
  backupPurpose = 'mn-precinct-production-release-rollback'
  createdAtUtc = $createdAtUtc
  releaseCandidate = $releaseCandidate
  dumpFile = $dumpFile
  dumpSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $dumpPath).Hash.ToLowerInvariant()
  dumpFormat = 'custom'
  includedSchemas = @('public')
  excludedTableDataPatterns = @()
  sourceEndpointFingerprint = $sourceEndpointFingerprint
  sourceEndpointLegacyApprovalFingerprint = $ExpectedLegacyEndpointFingerprint
  sourceServerVersionNum = [int]$identity[0]
  sourceDatabaseBytes = [int64]$identity[1]
  sourcePublicTableCount = $sourceTables.Count
  sourcePublicTableRowCounts = $sourceCounts
  sourceInvalidConstraints = $sourceInvalidConstraints
  pgClientMajor = 17
  remoteMutationPerformed = $false
  restoreVerification = [ordered]@{
    verified = $true
    verifiedAtUtc = [DateTime]::UtcNow.ToString('o')
    database = $VerifyDatabase
    defaultTransactionReadOnly = $true
    publicTableCount = $restoredTables.Count
    publicTableRowCounts = $restoredCounts
    invalidConstraints = $restoredInvalidConstraints
    tableDataEntryCount = $tableDataEntries.Count
    exactSourceTableSet = $true
    exactSourceRowCounts = $true
  }
}
$json = $manifest | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText($manifestPath, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
Restrict-BackupAccess @($manifestPath)

[ordered]@{
  mode = 'execute'
  decision = 'BACKUP_AND_RESTORE_VERIFIED'
  releaseCandidate = $releaseCandidate
  dumpFile = $dumpPath
  dumpSha256 = $manifest.dumpSha256
  manifest = $manifestPath
  sourcePublicTableCount = $sourceTables.Count
  restoredPublicTableCount = $restoredTables.Count
  restoreVerified = $true
  remoteMutationPerformed = $false
} | ConvertTo-Json -Depth 6
