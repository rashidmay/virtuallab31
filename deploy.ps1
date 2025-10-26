<#
PowerShell deploy script (Windows)
Usage:
  .\deploy.ps1 -projectId your-project-id
#>
param(
  [string]$projectId = "your-project-id"
)

Write-Host "Checking Firebase CLI..."
if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
  Write-Host "Firebase CLI not found. Install with: npm install -g firebase-tools"
  exit 1
}

Write-Host "Ensure you're logged in (this will open a browser if needed)..."
firebase login

Write-Host "Setting active project to: $projectId"
firebase use $projectId

Write-Host "Installing functions dependencies (if any)..."
Push-Location functions
if (Test-Path package.json) { npm install }
Pop-Location

Write-Host "Deploying Firestore rules and Cloud Functions..."
firebase deploy --only firestore,functions

Write-Host "(Optional) Deploy hosting with: firebase deploy --only hosting"