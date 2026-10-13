using Microsoft.Win32;
using System.Runtime.InteropServices;

namespace Zhuageping_WinUI;

internal sealed class PortableStartupRegistration
{
    internal const string RunPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    internal const string ValueName = "ZhuagepingWinUI";
    private readonly RegistryKey _root;
    private readonly string _keyPath;

    public PortableStartupRegistration(RegistryKey? root = null, string keyPath = RunPath)
    {
        _root = root ?? Registry.CurrentUser;
        _keyPath = keyPath;
    }

    public static bool HasPackageIdentity
    {
        get
        {
            uint length = 0;
            return GetCurrentPackageFullName(ref length, nint.Zero) != 15700;
        }
    }

    public bool IsRegistered()
    {
        using var key = _root.OpenSubKey(_keyPath);
        return key?.GetValue(ValueName) is string command && !string.IsNullOrWhiteSpace(command);
    }

    public void SetEnabled(bool enabled, string executablePath)
    {
        if (!enabled)
        {
            using var existing = _root.OpenSubKey(_keyPath, writable: true);
            existing?.DeleteValue(ValueName, throwOnMissingValue: false);
            return;
        }
        var path = Path.GetFullPath(executablePath);
        if (!File.Exists(path) || !string.Equals(Path.GetExtension(path), ".exe", StringComparison.OrdinalIgnoreCase))
            throw new FileNotFoundException("找不到开机启动的应用程序。", path);
        var command = $"\"{path}\" --startup";
        if (command.Length > 260) throw new InvalidOperationException("应用路径过长，请将应用移到较短路径后再启用开机启动。");
        using var key = _root.CreateSubKey(_keyPath, writable: true);
        key.SetValue(ValueName, command, RegistryValueKind.String);
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetCurrentPackageFullName(ref uint length, nint packageFullName);
}
