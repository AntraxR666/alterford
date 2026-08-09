param(
    [string]$Account = "alterford-base-sepolia-v4",
    [string]$ExpectedAddress = "0x6Bb15228CFC4CA9f39FD76EA1dbF98A9E53be772",
    [string]$PasswordFile = "/home/telecom/.alterford/foundry-password-v4.txt"
)

$ErrorActionPreference = "Stop"

Write-Host "Configurando Foundry Keystore: $Account" -ForegroundColor Cyan
Write-Host "Foundry pedira la private key y una contrasena nueva." -ForegroundColor Yellow

& wsl.exe bash -lc "~/.foundry/bin/cast wallet import --interactive '$Account'"
if ($LASTEXITCODE -ne 0) {
    throw "Foundry no pudo importar el keystore. Revisa el mensaje anterior."
}

$securePassword = Read-Host "Repite exactamente la nueva contrasena" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$plainPassword = $null

try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if ([string]::IsNullOrEmpty($plainPassword)) {
        throw "La contrasena no puede estar vacia."
    }

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "wsl.exe"
    $startInfo.Arguments = "bash -lc `"umask 077; mkdir -p /home/telecom/.alterford; cat > '$PasswordFile'; chmod 600 '$PasswordFile'`""
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $writer = [System.Diagnostics.Process]::Start($startInfo)
    $writer.StandardInput.Write($plainPassword)
    $writer.StandardInput.Close()
    $writer.WaitForExit()

    if ($writer.ExitCode -ne 0) {
        throw "No se pudo guardar el password file: $($writer.StandardError.ReadToEnd())"
    }
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $plainPassword = $null
    $securePassword = $null
}

$actualAddress = (& wsl.exe bash -lc "~/.foundry/bin/cast wallet address --account '$Account' --password-file '$PasswordFile'").Trim()
if ($LASTEXITCODE -ne 0) {
    throw "El password file no pudo descifrar el keystore. Ejecuta nuevamente este asistente."
}

if ($actualAddress.ToLowerInvariant() -ne $ExpectedAddress.ToLowerInvariant()) {
    throw "La cuenta importada es $actualAddress, pero Alterford requiere $ExpectedAddress."
}

Write-Host "Keystore verificado correctamente: $actualAddress" -ForegroundColor Green
Write-Host "Ya puedes cerrar esta ventana y responder: v3 listo" -ForegroundColor Green
