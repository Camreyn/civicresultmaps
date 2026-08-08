[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$CloneHost = '127.0.0.1'; $ClonePort = 54329; $CloneContainer = 'crm-db-clone-postgres'
$CloneAdminDatabase = 'crm_clone_admin'; $SnapshotDatabase = 'crm_clone_snapshot'; $DevDatabase = 'crm_clone_dev'; $CloneUser = 'crm_clone_admin'
$RepoRoot = Split-Path -Parent $PSScriptRoot; $ComposeFile = Join-Path $RepoRoot 'docker-compose.db-clone.yml'; $OutputDirectory = 'C:\tmp\crm-db-clone'; $ExpectedEndpointFingerprint = 'bf2bf2213814'

function Fail([string]$Message) { throw "Database clone aborted: $Message" }
function Require-Command([string]$Name) { $command=Get-Command $Name -ErrorAction SilentlyContinue; if(-not $command){Fail "Required command '$Name' was not found on PATH."}; return $command.Source }
function Invoke-DockerChecked([string[]]$Arguments,[string]$Description) { & $docker @Arguments; if($LASTEXITCODE -ne 0){Fail "$Description failed (exit code $LASTEXITCODE)."} }
function Invoke-LocalPsql([string]$Sql,[string]$Description) { Invoke-DockerChecked @('exec','--user','postgres',$CloneContainer,'psql','--no-psqlrc','--set','ON_ERROR_STOP=1','--username',$CloneUser,'--dbname',$CloneAdminDatabase,'--command',$Sql) $Description }
function Get-RequiredSourceUrl { $a=[Environment]::GetEnvironmentVariable('POSTGRES_URL_NON_POOLING');$b=[Environment]::GetEnvironmentVariable('POSTGRES_DATABASE_URL_UNPOOLED');if([string]::IsNullOrWhiteSpace($a)-and [string]::IsNullOrWhiteSpace($b)){Fail 'Set POSTGRES_URL_NON_POOLING or POSTGRES_DATABASE_URL_UNPOOLED in this process environment.'};if(-not [string]::IsNullOrWhiteSpace($a)-and -not [string]::IsNullOrWhiteSpace($b)-and $a -ne $b){Fail 'The two allowed source URL variables disagree; set exactly one or set both to the same value.'};if(-not [string]::IsNullOrWhiteSpace($a)){return $a};return $b }
function Assert-RemoteSource([string]$Url) { try{$uri=[Uri]$Url}catch{Fail 'The allowed source URL is not a valid PostgreSQL connection URI.'};if($uri.Scheme -notin @('postgres','postgresql') -or [string]::IsNullOrWhiteSpace($uri.Host)){Fail 'The source URL must be a PostgreSQL URI with a host.'};if($uri.Host.ToLowerInvariant() -in @('localhost','127.0.0.1','::1',$CloneHost) -or $uri.Port -eq $ClonePort){Fail 'The source URL resolves to a reserved local-clone endpoint.'} }
function Get-EndpointFingerprint([string]$Url) {
  $uri = [Uri]$Url
  $bytes = [Text.Encoding]::UTF8.GetBytes($uri.Host.ToLowerInvariant() + $uri.AbsolutePath)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hash = $sha.ComputeHash($bytes) } finally { $sha.Dispose() }
  return (([BitConverter]::ToString($hash) -replace '-','').ToLowerInvariant()).Substring(0, 12)
}
function Assert-CloneContainer {
  if (-not (Test-Path -LiteralPath $ComposeFile)) { Fail "Compose file is missing: $ComposeFile" }
  $id = (& $docker compose -f $ComposeFile ps -q postgres).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $id) { Fail 'The isolated clone container is not running.' }
  $raw = & $docker inspect $id
  if ($LASTEXITCODE -ne 0) { Fail 'Could not inspect the local clone container.' }
  $container = @($raw | ConvertFrom-Json)
  if ($container.Count -ne 1) { Fail 'Docker inspect did not return exactly one clone container.' }
  $container = $container[0]
  if ($container.Name -ne "/$CloneContainer" -or $container.Config.Labels.'com.civicresultmaps.purpose' -ne 'isolated-production-clone') { Fail 'The running container name or purpose label is not the reserved clone identity.' }
  $bindings = @($container.NetworkSettings.Ports.'5432/tcp')
  if ($bindings.Count -ne 1 -or $bindings[0].HostIp -ne $CloneHost -or $bindings[0].HostPort -ne "$ClonePort") { Fail 'The clone container must have exactly one 5432/tcp binding at the reserved loopback port.' }
  if ($container.State.Health.Status -ne 'healthy') { Fail 'The isolated clone container health check is not healthy.' }
  $backupMounts = @($container.Mounts | Where-Object { $_.Type -eq 'bind' -and $_.Destination -eq '/backups' -and $_.RW -eq $true })
  if ($backupMounts.Count -ne 1) { Fail 'The clone container must have exactly one writable /backups bind mount.' }
}
function Assert-ContainerClientTools {
  $versions = @(
    (& $docker exec --user postgres $CloneContainer psql --version);
    (& $docker exec --user postgres $CloneContainer pg_dump --version);
    (& $docker exec --user postgres $CloneContainer pg_restore --version)
  )
  $majors = @($versions | ForEach-Object { if ($_ -match '(\d+)(?:\.\d+)?') { [int]$Matches[1] } })
  if ($LASTEXITCODE -ne 0 -or $majors.Count -ne 3 -or @($majors | Where-Object { $_ -ne 17 }).Count -ne 0) { Fail 'The labelled clone container must provide PostgreSQL 17 psql, pg_dump, and pg_restore tools.' }
}
function Get-RemoteExecEnv([string]$Url) {
  $uri = [Uri]$Url; $userinfo = [Uri]::UnescapeDataString($uri.UserInfo); $separator = $userinfo.IndexOf(':')
  if ($separator -lt 1) { Fail 'The approved source URL must include a username and password.' }
  $database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/') )
  if ([string]::IsNullOrWhiteSpace($database)) { Fail 'The approved source URL must include a database path.' }
  $port = if ($uri.IsDefaultPort) { '5432' } else { [string]$uri.Port }
  return @('--env', "PGHOST=$($uri.Host)", '--env', "PGPORT=$port", '--env', "PGDATABASE=$database", '--env', "PGUSER=$($userinfo.Substring(0, $separator))", '--env', "PGPASSWORD=$($userinfo.Substring($separator + 1))", '--env', 'PGSSLMODE=require', '--env', 'PGCHANNELBINDING=require', '--env', 'PGOPTIONS=-c default_transaction_read_only=on')
}
function Invoke-RemoteReadOnly([string]$Sql,[string]$Description) { $result=& $docker exec --user postgres @remoteExecEnv $CloneContainer psql --no-psqlrc --tuples-only --no-align --quiet --command $Sql;if($LASTEXITCODE -ne 0){Fail "$Description failed (exit code $LASTEXITCODE)."};return $result }
function Restrict-BackupAccess([string[]]$Paths) { $icacls=Get-Command icacls -ErrorAction SilentlyContinue;if(-not $icacls -or $env:OS -ne 'Windows_NT'){Write-Warning 'Could not apply Windows ACL restrictions.';return};$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name;foreach($path in $Paths){$isDirectory=Test-Path -LiteralPath $path -PathType Container;$userGrant=if($isDirectory){$user+':(OI)(CI)F'}else{$user+':F'};$systemGrant=if($isDirectory){'SYSTEM:(OI)(CI)F'}else{'SYSTEM:F'};& $icacls.Source $path '/inheritance:r' '/grant:r' $userGrant '/grant:r' $systemGrant|Out-Null;if($LASTEXITCODE -ne 0){Fail "Could not restrict ACLs on $path."}} }

$sourceUrl=Get-RequiredSourceUrl
Assert-RemoteSource $sourceUrl
if((Get-EndpointFingerprint $sourceUrl) -ne $ExpectedEndpointFingerprint){Fail 'The source endpoint fingerprint is not the approved production endpoint.'}
$docker=Require-Command docker
$remoteExecEnv = @(Get-RemoteExecEnv $sourceUrl)
Assert-CloneContainer
Assert-ContainerClientTools

$preflightSql="SELECT current_setting('server_version_num') || '|' || pg_database_size(current_database()) || '|' || (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') || '|' || (SELECT string_agg(lanname, ',' ORDER BY lanname) FROM pg_language WHERE lanispl);"
$fields=(((Invoke-RemoteReadOnly $preflightSql 'Remote read-only preflight')-join '').Trim()-split '\|')
if($fields.Count -ne 4 -or $fields[0] -notmatch '^\d{5,6}$' -or [int](([int]$fields[0])/10000) -ne 17 -or $fields[2] -ne '27' -or $fields[3] -ne 'plpgsql'){Fail 'Remote preflight did not match approved PostgreSQL-major, public-table, and language characteristics.'}
$sourceServerVersionNum=[int]$fields[0];$sourceDatabaseBytes=[int64]$fields[1]

New-Item -ItemType Directory -Force -Path $OutputDirectory|Out-Null
$stamp=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ');$dumpFile="public-sanitized-$stamp.dump";$dumpPath=Join-Path $OutputDirectory $dumpFile;$manifestPath=Join-Path $OutputDirectory "public-sanitized-$stamp.manifest.json"
& $docker exec --user postgres @remoteExecEnv $CloneContainer pg_dump --format=custom --schema=public --exclude-table-data=public.ui_layout_* "--file=/backups/$dumpFile"
if($LASTEXITCODE -ne 0){Fail "Remote sanitized pg_dump failed (exit code $LASTEXITCODE)."}
if(-not(Test-Path -LiteralPath $dumpPath)){Fail 'pg_dump did not create the bind-mounted dump file.'}
Restrict-BackupAccess @($OutputDirectory,$dumpPath)

# Database-level commands must be separate psql calls: DROP/CREATE DATABASE cannot run in a transaction block.
Invoke-LocalPsql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$SnapshotDatabase' AND pid <> pg_backend_pid();" 'Terminate local snapshot clients'
Invoke-LocalPsql "DROP DATABASE IF EXISTS $SnapshotDatabase;" 'Drop local snapshot database'
Invoke-LocalPsql "CREATE DATABASE $SnapshotDatabase OWNER $CloneUser;" 'Create local snapshot database'
Invoke-DockerChecked @('exec','--user','postgres',$CloneContainer,'psql','--no-psqlrc','--set','ON_ERROR_STOP=1','--username',$CloneUser,'--dbname',$SnapshotDatabase,'--command','DROP SCHEMA public CASCADE;') 'Prepare fresh public schema'
Invoke-DockerChecked @('exec','--user','postgres',$CloneContainer,'pg_restore','--exit-on-error','--no-owner','--no-privileges',"--username=$CloneUser","--dbname=$SnapshotDatabase","/backups/$dumpFile") 'Restore local sanitized snapshot'
Invoke-LocalPsql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DevDatabase' AND pid <> pg_backend_pid();" 'Terminate local dev clients'
Invoke-LocalPsql "DROP DATABASE IF EXISTS $DevDatabase;" 'Drop local development database'
Invoke-LocalPsql "CREATE DATABASE $DevDatabase OWNER $CloneUser TEMPLATE $SnapshotDatabase;" 'Create local development database from snapshot'
Invoke-LocalPsql "ALTER DATABASE $SnapshotDatabase SET default_transaction_read_only = on;" 'Lock snapshot reads by default'

$manifest=[ordered]@{manifestVersion=3;createdAtUtc=[DateTime]::UtcNow.ToString('o');dumpFile=$dumpFile;dumpSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $dumpPath).Hash.ToLowerInvariant();dumpFormat='custom';schema='public';excludedTableDataPatterns=@('public.ui_layout_*');sourceEndpointFingerprint=$ExpectedEndpointFingerprint;sourceServerVersionNum=$sourceServerVersionNum;sourceDatabaseBytes=$sourceDatabaseBytes;sourcePublicTableCount=27;sourceProceduralLanguages=@('plpgsql');pgClientMajor=17;sanitizedSnapshotDatabase=$SnapshotDatabase;writableDevelopmentDatabase=$DevDatabase;snapshotDefaultTransactionReadOnly=$true;snapshotConnectionsAllowed=$true;remoteMutationPerformed=$false}
$manifest|ConvertTo-Json|Set-Content -LiteralPath $manifestPath -Encoding utf8
Restrict-BackupAccess @($manifestPath)
Write-Host "Sanitized local clone created. Dump: $dumpPath"
Write-Host "Manifest: $manifestPath"
Write-Host "Development database: $DevDatabase on $CloneHost`:$ClonePort"



