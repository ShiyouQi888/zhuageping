using Microsoft.Win32;
using Zhuageping_WinUI;

static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

// Exercise an isolated registry branch, never the real Windows Run key.
var branch = @"Software\ZhuagepingTests\Startup-" + Guid.NewGuid().ToString("N");
var registration = new PortableStartupRegistration(Registry.CurrentUser, branch);
var folder = Path.Combine(Path.GetTempPath(), "Zhuageping startup " + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(folder);
try
{
    Check(!PortableStartupRegistration.HasPackageIdentity, "Console smoke test must be unpackaged.");
    Check(!registration.IsRegistered(), "Empty branch must not be enabled.");
    registration.SetEnabled(false, "unused.exe");
    using (var key = Registry.CurrentUser.OpenSubKey(branch)) Check(key is null, "Disable must not create a key.");
    var executable = Path.Combine(folder, "App with spaces.exe");
    File.WriteAllBytes(executable, []);
    registration.SetEnabled(true, executable);
    Check(registration.IsRegistered(), "Enable must register the application.");
    using (var key = Registry.CurrentUser.OpenSubKey(branch))
    {
        Check((string?)key!.GetValue(PortableStartupRegistration.ValueName) == $"\"{executable}\" --startup", "Path must be quoted with the startup argument.");
        Check(key.GetValueKind(PortableStartupRegistration.ValueName) == RegistryValueKind.String, "Run command must be REG_SZ.");
    }
    registration.SetEnabled(true, executable);
    using (var key = Registry.CurrentUser.OpenSubKey(branch)) Check(key!.ValueCount == 1, "Enabling twice must not create duplicates.");
    using (var key = Registry.CurrentUser.OpenSubKey(branch, writable: true)) key!.SetValue("Unrelated", "keep");
    registration.SetEnabled(false, executable);
    registration.SetEnabled(false, executable);
    Check(!registration.IsRegistered(), "Disable must remove the application command.");
    using (var key = Registry.CurrentUser.OpenSubKey(branch)) Check((string?)key!.GetValue("Unrelated") == "keep", "Unrelated values must survive.");
    try
    {
        registration.SetEnabled(true, Path.Combine(folder, "missing.exe"));
        throw new InvalidOperationException("Missing executable must fail registration.");
    }
    catch (FileNotFoundException) { }
    Check(!registration.IsRegistered(), "Failed registration must not create a command.");
    Console.WriteLine("PASS: unpackaged detection, quoted paths, startup argument, enable/disable, idempotency, missing executable and unrelated-value preservation (isolated registry only).");
}
finally
{
    Registry.CurrentUser.DeleteSubKeyTree(branch, throwOnMissingSubKey: false);
    Directory.Delete(folder, recursive: true);
}
