# Windows Code Signing

Public Windows releases must use a trusted Authenticode code-signing certificate. Never commit the PFX or its password.

## Electron Release Workflow

Configure these GitHub Actions repository secrets:

- `WIN_CSC_LINK`: base64-encoded PFX contents, or a supported certificate URL.
- `WIN_CSC_KEY_PASSWORD`: the PFX private-key password.

The release workflow passes these to electron-builder. `forceCodeSigning` makes a missing or invalid certificate fail the release build.

## WinUI Installer

Install the trusted certificate with its private key in the current user's `Personal` certificate store. Set `WIN_SIGNING_CERT_THUMBPRINT` to its 40-character thumbprint and install Windows SDK `signtool.exe` plus NSIS 3.08 or later. Run `scripts/package-native-installer.ps1`; it signs and verifies unsigned EXE/DLL payload files, and signs the generated uninstaller and installer. Already-valid Microsoft signatures are retained. Invalid pre-existing signatures stop packaging.

Without the certificate and required tools, do not distribute the installer. Unsigned local builds are not evidence of publisher identity or binary integrity.
