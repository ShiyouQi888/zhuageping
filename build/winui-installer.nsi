Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "WinVer.nsh"

!define PRODUCT_NAME "抓个屏 WinUI 预览版"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZhuagepingWinUI"
Name "${PRODUCT_NAME}"
OutFile "${INSTALLER_OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\ZhuagepingWinUI"
InstallDirRegKey HKCU "${UNINSTALL_KEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
ShowInstDetails show
ShowUninstDetails show
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Zhuageping WinUI Preview"
VIAddVersionKey /LANG=1033 "FileDescription" "Zhuageping WinUI Setup"
VIAddVersionKey /LANG=1033 "CompanyName" "齐世有 / Qi Shiyou"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright © 2026 齐世有. All rights reserved."
VIAddVersionKey /LANG=1033 "FileVersion" "${APP_VERSION}"

!define MUI_ABORTWARNING
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "${INSTALLER_HEADER}"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${INSTALLER_SIDEBAR}"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${INSTALLER_SIDEBAR}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Zhuageping.WinUI.exe"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!define MUI_LANGDLL_REGISTRY_ROOT HKCU
!define MUI_LANGDLL_REGISTRY_KEY "${UNINSTALL_KEY}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "InstallerLanguage"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  SetShellVarContext current
  SetRegView 64
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "This installer requires 64-bit Windows."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "This installer requires Windows 10 or later."
    Abort
  ${EndIf}
  !insertmacro MUI_LANGDLL_DISPLAY
FunctionEnd

Section "Application" SEC_MAIN
  SetShellVarContext current
  SetRegView 64
  ; Reject an in-use target instead of terminating an active recording.
  IfFileExists "$INSTDIR\Zhuageping.WinUI.exe" 0 target_ready
  ClearErrors
  FileOpen $0 "$INSTDIR\Zhuageping.WinUI.exe" a
  IfErrors target_busy
  FileClose $0
  Goto target_ready
target_busy:
  MessageBox MB_ICONSTOP "Please exit Zhuageping WinUI before upgrading. / 请先从托盘退出抓个屏，再安装更新。"
  Abort
target_ready:
  SetOutPath "$INSTDIR"
  ClearErrors
  File /r "${PAYLOAD}\*.*"
  IfErrors install_failed
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\Zhuageping.WinUI.exe" "" "$INSTDIR\Assets\AppIcon.ico"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\卸载.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\Zhuageping.WinUI.exe" "" "$INSTDIR\Assets\AppIcon.ico"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION} preview"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "齐世有 / Qi Shiyou"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\Zhuageping.WinUI.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "URLInfoAbout" "https://github.com/ShiyouQi888/zhuageping"
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" ${INSTALLED_KIB}
  Goto install_done
install_failed:
  MessageBox MB_ICONSTOP "Installation failed. Check free space and close the application, then retry."
  Abort
install_done:
SectionEnd

Function un.onInit
  SetShellVarContext current
  SetRegView 64
  !insertmacro MUI_UNGETLANGUAGE
FunctionEnd

Section "Uninstall"
  SetShellVarContext current
  SetRegView 64
  IfFileExists "$INSTDIR\Zhuageping.WinUI.exe" 0 uninstall_ready
  ClearErrors
  FileOpen $0 "$INSTDIR\Zhuageping.WinUI.exe" a
  IfErrors uninstall_busy
  FileClose $0
  Goto uninstall_ready
uninstall_busy:
  MessageBox MB_ICONSTOP "Please exit Zhuageping WinUI before uninstalling. / 请先从托盘退出抓个屏。"
  Abort
uninstall_ready:
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ZhuagepingWinUI"
  StrCmp $0 '$\"$INSTDIR\Zhuageping.WinUI.exe$\" --startup' 0 keep_startup
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ZhuagepingWinUI"
keep_startup:
  ; Delete only payload-owned files; never recursively delete a user-selected folder.
  !include "${FILE_MANIFEST}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\卸载.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
SectionEnd
