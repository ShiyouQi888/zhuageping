using System.Reflection;
using System.Runtime.InteropServices;
using Zhuageping_WinUI;

internal static class Program
{
    private static void Main()
    {
        using (var empty = new NativeHotKeyService([]))
            Require(!empty.Start(out var error) && error.Contains("没有可用"), "Empty bindings must fail before signaling readiness.");
        using (var invalid = new NativeHotKeyService([new("invalid", "F13", () => { })]))
            Require(!invalid.Start(out var error) && error.Contains("无效"), "Invalid shortcuts must not report success.");
        using var received = new ManualResetEventSlim();
        var calls = 0;
        var binding = new NativeHotKeyBinding("test", "Ctrl+Alt+Shift+F12", () =>
        {
            if (Interlocked.Increment(ref calls) == 1) throw new InvalidOperationException("Expected callback failure");
            received.Set();
        });
        var service = new NativeHotKeyService([binding]);
        try
        {
            Require(service.Start(out var message), message);
            using (var conflict = new NativeHotKeyService([binding]))
                Require(!conflict.Start(out var error) && error.Contains("占用"), "Occupied shortcuts must report conflicts explicitly.");
            var thread = (Thread)typeof(NativeHotKeyService).GetField("_thread", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(service)!;
            Require(thread.Priority == ThreadPriority.AboveNormal, "Hotkey receiver must use AboveNormal priority.");
            var threadId = (uint)typeof(NativeHotKeyService).GetField("_threadId", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(service)!;
            // Exercise our own message queue, without injecting keyboard input into the desktop.
            Require(PostThreadMessage(threadId, 0x0312, 0x5A31, 0), "First hotkey must enqueue.");
            Require(PostThreadMessage(threadId, 0x0312, 0x5A31, 0), "Second hotkey must enqueue.");
            Require(received.Wait(TimeSpan.FromSeconds(3)) && calls == 2, "A failing callback must not terminate the hotkey loop.");
        }
        finally { service.Dispose(); service.Dispose(); }
        using (var reacquired = new NativeHotKeyService([binding]))
            Require(reacquired.Start(out var message), "Disposal must release the key: " + message);
        Console.WriteLine("PASS: startup errors, invalid keys, exclusive ownership/conflict reporting, elevated message-thread priority, callback recovery, idempotent cleanup and re-registration.");
    }
    private static void Require(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
    [DllImport("user32.dll", SetLastError = true)] private static extern bool PostThreadMessage(uint threadId, uint message, nint wParam, nint lParam);
}
