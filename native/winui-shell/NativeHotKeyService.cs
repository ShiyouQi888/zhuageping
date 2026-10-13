using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Zhuageping_WinUI;

internal sealed record NativeHotKeyBinding(string Label, string Shortcut, Action Action);

internal sealed class NativeHotKeyService : IDisposable
{
    private const int FirstHotKeyId = 0x5A31;
    private const uint ModAlt = 0x0001;
    private const uint ModControl = 0x0002;
    private const uint ModShift = 0x0004;
    private const uint ModNoRepeat = 0x4000;
    private const uint WmHotKey = 0x0312;
    private const uint WmQuit = 0x0012;
    private const uint PmNoRemove = 0x0000;

    private readonly IReadOnlyList<NativeHotKeyBinding> _bindings;
    private readonly ManualResetEventSlim _ready = new();
    private readonly Dictionary<int, Action> _actions = [];
    private readonly List<string> _registrationFailures = [];
    private Thread? _thread;
    private uint _threadId;
    private Exception? _startupError;
    private volatile bool _stopRequested;
    private int _disposed;

    public NativeHotKeyService(IReadOnlyList<NativeHotKeyBinding> bindings) => _bindings = bindings;

    public bool Start(out string message)
    {
        _thread = new Thread(MessageLoop) { IsBackground = true, Name = "Zhuageping global hotkeys", Priority = ThreadPriority.AboveNormal };
        _thread.Start();
        if (!_ready.Wait(TimeSpan.FromSeconds(3)))
        {
            message = "快捷键服务启动超时。";
            Dispose();
            return false;
        }
        if (_startupError is not null)
        {
            message = _startupError.Message;
            Dispose();
            return false;
        }

        var active = _bindings.Where((_, index) => _actions.ContainsKey(FirstHotKeyId + index));
        message = $"全局快捷键已启用：{string.Join(" · ", active.Select(binding => $"{binding.Shortcut} {binding.Label}"))}";
        if (_registrationFailures.Count > 0)
            message += $"；未注册：{string.Join("；", _registrationFailures)}";
        return true;
    }

    private void MessageLoop()
    {
        _threadId = GetCurrentThreadId();
        PeekMessage(out _, IntPtr.Zero, 0, 0, PmNoRemove);
        var registeredIds = new List<int>();
        for (var index = 0; index < _bindings.Count; index++)
        {
            var binding = _bindings[index];
            if (!TryParseShortcut(binding.Shortcut, out var modifiers, out var virtualKey, out var parseError))
            {
                _registrationFailures.Add($"{binding.Label}（{binding.Shortcut}）无效：{parseError}");
                continue;
            }

            var id = FirstHotKeyId + index;
            if (!RegisterHotKey(IntPtr.Zero, id, modifiers | ModNoRepeat, virtualKey))
            {
                _registrationFailures.Add($"{binding.Label}（{binding.Shortcut}）注册失败，可能已被其他程序占用");
                continue;
            }
            _actions[id] = binding.Action;
            registeredIds.Add(id);
        }

        if (_actions.Count == 0)
            _startupError = new InvalidOperationException($"没有可用的全局快捷键：{string.Join("；", _registrationFailures)}");
        _ready.Set();

        if (_startupError is not null || _stopRequested)
        {
            foreach (var id in registeredIds) UnregisterHotKey(IntPtr.Zero, id);
            _actions.Clear();
            return;
        }

        try
        {
            while (GetMessage(out var message, IntPtr.Zero, 0, 0) > 0)
            {
                if (message.Message == WmHotKey && _actions.TryGetValue(message.WParam.ToInt32(), out var action))
                {
                    try { action(); }
                    catch (Exception exception) { System.Diagnostics.Trace.TraceError($"Hotkey callback failed: {exception}"); }
                }
            }
        }
        finally
        {
            foreach (var id in registeredIds) UnregisterHotKey(IntPtr.Zero, id);
            _actions.Clear();
        }
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        _stopRequested = true;
        if (_threadId != 0) PostThreadMessage(_threadId, WmQuit, IntPtr.Zero, IntPtr.Zero);
        if (_thread is { IsAlive: true } && Thread.CurrentThread != _thread) _thread.Join(TimeSpan.FromSeconds(1));
        if (_thread is not { IsAlive: true }) _ready.Dispose();
    }

    private static bool TryParseShortcut(string value, out uint modifiers, out uint virtualKey, out string error)
    {
        modifiers = 0;
        virtualKey = 0;
        error = "请使用 F1-F12，可选 Ctrl、Alt、Shift 修饰键。";
        var parts = value.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length == 0) return false;

        foreach (var part in parts[..^1])
        {
            switch (part.ToUpperInvariant())
            {
                case "CTRL":
                case "CONTROL":
                    modifiers |= ModControl;
                    break;
                case "ALT":
                    modifiers |= ModAlt;
                    break;
                case "SHIFT":
                    modifiers |= ModShift;
                    break;
                default:
                    error = $"不支持修饰键“{part}”。";
                    return false;
            }
        }

        var key = parts[^1].ToUpperInvariant();
        if (!key.StartsWith('F') || !int.TryParse(key[1..], out var functionNumber) || functionNumber is < 1 or > 12)
        {
            error = "主按键只能是 F1 到 F12。";
            return false;
        }
        virtualKey = 0x70u + (uint)(functionNumber - 1);
        return true;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeMessage
    {
        public IntPtr HWnd;
        public uint Message;
        public IntPtr WParam;
        public IntPtr LParam;
        public uint Time;
        public int PointX;
        public int PointY;
        public uint Private;
    }

    [DllImport("user32.dll", SetLastError = true)] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint virtualKey);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll", SetLastError = true)] private static extern int GetMessage(out NativeMessage message, IntPtr hWnd, uint min, uint max);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool PeekMessage(out NativeMessage message, IntPtr hWnd, uint min, uint max, uint remove);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool PostThreadMessage(uint threadId, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
}
