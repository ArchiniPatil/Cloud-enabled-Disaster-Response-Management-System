param([string]$OutputsFile = '.local/academic-outputs.json')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:AWS_PAGER = ''
$region = (Get-Content config/academic-deployment.json -Raw | ConvertFrom-Json).region

function Invoke-AwsJson {
    param([string[]]$Arguments)
    $response = & aws @Arguments --region $region --output json
    if ($LASTEXITCODE -ne 0) { throw 'AWS command failed. Resolve the error above before retrying.' }
    return ($response | ConvertFrom-Json)
}

if (!(Test-Path $OutputsFile)) { throw 'Missing stack outputs. Complete cloud:deploy first.' }
$outputs = (Get-Content $OutputsFile -Raw | ConvertFrom-Json).'DisasterResponse-academic'
if (!$outputs.AmplifyAppId -or !$outputs.ApplicationUrl) { throw 'Expected academic stack outputs.' }
# Confirm the local output file belongs to the current AWS account and stack.
$stack = Invoke-AwsJson -Arguments @('cloudformation', 'describe-stacks', '--stack-name', 'DisasterResponse-academic')
if ($stack.Stacks[0].StackStatus -notin @('CREATE_COMPLETE', 'UPDATE_COMPLETE')) {
    throw 'The stack is not in a successful deployed state.'
}
$liveAppId = ($stack.Stacks[0].Outputs | Where-Object OutputKey -eq 'AmplifyAppId').OutputValue
$liveUrl = ($stack.Stacks[0].Outputs | Where-Object OutputKey -eq 'ApplicationUrl').OutputValue
if ($liveAppId -ne $outputs.AmplifyAppId -or $liveUrl -ne $outputs.ApplicationUrl) {
    throw 'Saved outputs do not match the current AWS stack. Refresh the outputs before publishing.'
}
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed; nothing was uploaded.' }
New-Item -ItemType Directory -Force .local | Out-Null
Compress-Archive -Path apps/web/dist/* -DestinationPath .local/frontend.zip -Force
# The upload URL is a temporary credential: keep it only in memory.
$upload = Invoke-AwsJson -Arguments @('amplify', 'create-deployment', '--app-id', $outputs.AmplifyAppId, '--branch-name', 'dev')
try {
    Invoke-WebRequest -UseBasicParsing -Method Put -Uri $upload.zipUploadUrl -InFile .local/frontend.zip -ContentType 'application/zip' | Out-Null
} catch {
    throw 'Frontend upload failed. Retry publication; do not share the temporary upload URL.'
}
$null = Invoke-AwsJson -Arguments @('amplify', 'start-deployment', '--app-id', $outputs.AmplifyAppId, '--branch-name', 'dev', '--job-id', $upload.jobId)
for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $job = Invoke-AwsJson -Arguments @('amplify', 'get-job', '--app-id', $outputs.AmplifyAppId, '--branch-name', 'dev', '--job-id', $upload.jobId)
    $status = $job.job.summary.status
    Write-Host "Amplify job: $status"
    if ($status -eq 'SUCCEED') {
        Write-Host "Published: $($outputs.ApplicationUrl)"
        try {
            $null = Invoke-WebRequest -UseBasicParsing -Uri "$($outputs.ApplicationUrl)/api/v1/health/ready"
            Write-Host 'API readiness passed. Continue the real-account acceptance checks in docs/AWS_WINDOWS_DEPLOYMENT.md.'
        } catch {
            throw 'Frontend published, but API readiness failed. Inspect ECS, migration, and gateway logs.'
        }
        exit 0
    }
    if ($status -in @('FAILED', 'CANCELLED')) { throw "Amplify publication ended: $status" }
    Start-Sleep -Seconds 10
}
throw 'Publication is still pending after 20 minutes. Inspect this job in Amplify before starting another deployment.'
