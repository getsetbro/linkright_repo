# ============================================================
#  sign.ps1 — Self-sign an executable with a local certificate
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File sign.ps1 <file-to-sign>
#
#  On first run this creates a self-signed code-signing certificate
#  in the current user's certificate store. Subsequent runs reuse it.
#
#  NOTE: Self-signing changes the publisher name shown in Windows
#  dialogs, but SmartScreen will STILL warn because the cert is not
#  issued by a trusted CA. To suppress the warning on your own
#  machines, import the cert into Trusted Publishers (see below).
# ============================================================

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$FilePath
)

$ErrorActionPreference = "Stop"

# --- Configuration ---
$CertSubject   = "CN=Seth Broweleit (LinkRight)"
$CertStorePath = "Cert:\CurrentUser\My"
$TimestampUrl  = "http://timestamp.digicert.com"
$ValidYears    = 5

# --- Resolve the file ---
if (-not (Test-Path $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 1
}
$FilePath = (Resolve-Path $FilePath).Path

# --- Find or create the certificate ---
$cert = Get-ChildItem $CertStorePath -CodeSigningCert |
    Where-Object { $_.Subject -eq $CertSubject -and $_.NotAfter -gt (Get-Date) } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1

if (-not $cert) {
    Write-Host "No existing code-signing certificate found. Creating one..."
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $CertSubject `
        -CertStoreLocation $CertStorePath `
        -NotAfter (Get-Date).AddYears($ValidYears) `
        -KeyUsage DigitalSignature `
        -KeyAlgorithm RSA `
        -KeyLength 2048
    Write-Host "Created certificate: $($cert.Thumbprint) (expires $($cert.NotAfter.ToString('yyyy-MM-dd')))"
} else {
    Write-Host "Using existing certificate: $($cert.Thumbprint) (expires $($cert.NotAfter.ToString('yyyy-MM-dd')))"
}

# --- Sign the file ---
Write-Host "Signing: $FilePath"
$result = Set-AuthenticodeSignature `
    -FilePath $FilePath `
    -Certificate $cert `
    -TimestampServer $TimestampUrl `
    -HashAlgorithm SHA256

# "Valid" = cert is trusted; "UnknownError" = signature applied but cert chain
# is not in Trusted Root (expected for self-signed certs). Both are acceptable.
if ($result.Status -eq "Valid" -or $result.Status -eq "UnknownError") {
    Write-Host "Signed successfully. Status: $($result.Status)"
    if ($result.Status -eq "UnknownError") {
        Write-Host "(This is normal for self-signed certificates - the signature IS applied,"
        Write-Host " but the cert is not in Trusted Root on this machine.)"
    }
} else {
    Write-Error "Signing failed! Status: $($result.Status) - $($result.StatusMessage)"
    exit 1
}

Write-Host ""

# ============================================================
#  OPTIONAL: To suppress SmartScreen on your co-workers' machines,
#  export the cert and have them import it into Trusted Publishers:
#
#  1. Export (run once on the build machine):
#     Export-Certificate -Cert $cert -FilePath LinkRight-CodeSign.cer
#
#  2. Import (run once on each co-worker's machine, elevated):
#     Import-Certificate -FilePath LinkRight-CodeSign.cer
#         -CertStoreLocation Cert:\LocalMachine\TrustedPublisher
#
#  After that, SmartScreen will no longer warn for files signed
#  with this certificate.
# ============================================================
