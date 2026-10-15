# Windows Code Signing

This project can publish unsigned Windows builds when explicitly chosen. Such builds do not prove publisher identity or binary integrity, and Windows may display an unknown-publisher or SmartScreen warning. Never commit a PFX or its password.

## Electron Release Workflow

To enable signed Electron releases, configure these GitHub Actions repository secrets:

- `WIN_CSC_LINK`: base64-encoded PFX contents, or a supported certificate URL.
- `WIN_CSC_KEY_PASSWORD`: the PFX private-key password.

The current release workflow intentionally builds unsigned packages and does not require these secrets. To restore signature enforcement, pass the secrets to electron-builder and enable `forceCodeSigning`.

## WinUI Installer

Install the trusted certificate with its private key in the current user's `Personal` certificate store. Set `WIN_SIGNING_CERT_THUMBPRINT` to its 40-character thumbprint and install Windows SDK `signtool.exe` plus NSIS 3.08 or later. Run `scripts/package-native-installer.ps1`; it signs and verifies unsigned EXE/DLL payload files, and signs the generated uninstaller and installer. Already-valid Microsoft signatures are retained. Invalid pre-existing signatures stop packaging.

The native WinUI installer script remains signature-enforced. Without the certificate and required tools, it will refuse to package. Unsigned installers are not evidence of publisher identity or binary integrity.
