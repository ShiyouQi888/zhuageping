using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace ZhuagepingHotkeyGuard;

internal sealed record GuardSettings(
    string? ShortcutCapture,
    string? ShortcutCaptureCopy,
    string? ShortcutArea,
    string? ShortcutScrollCapture,
    string? ShortcutPin,
    string? ShortcutTogglePins
);

internal sealed record Hotkey(string Action, int VirtualKey, bool Ctrl, bool Shift, bool Alt);

internal static class Program
{
    private const int WhKeyboardLl = 13;
    private const int WmKeydown = 0x0100;
    private const int WmKeyup = 0x0101;
    private const int WmSyskeydown = 0x0104;
    private const int WmSyskeyup = 0x0105;

    private static readonly LowLevelKeyboardProc HookCallback = HookProc;
    private static readonly HashSet<int> SuppressedKeys = [];
    private static IReadOnlyList<Hotkey> hotkeys = [];
    private static IntPtr hookId = IntPtr.Zero;

    public static int Main(string[] args)
    {
        try
        {
            hotkeys = LoadHotkeys(args);
            if (hotkeys.Count == 0)
            {
                Console.WriteLine("error:no-hotkeys");
                return 1;
            }

            using var currentProcess = Process.GetCurrentProcess();
            using var currentModule = currentProcess.MainModule;
            hookId = SetWindowsHookEx(
                WhKeyboardLl,
                HookCallback,
                GetModuleHandle(currentModule?.ModuleName),
                0
            );

            if (hookId == IntPtr.Zero)
            {
                Console.WriteLine($"error:hook-failed:{Marshal.GetLastWin32Error()}");
                return 2;
            }

            Console.CancelKeyPress += (_, eventArgs) =>
            {
                eventArgs.Cancel = true;
                Quit();
            };

            Console.WriteLine("ready");
            while (GetMessage(out var message, IntPtr.Zero, 0, 0) > 0)
            {
                TranslateMessage(ref message);
                DispatchMessage(ref message);
            }

            return 0;
        }
        catch (Exception exception)
        {
            Console.WriteLine($"error:{exception.GetType().Name}:{exception.Message}");
            return 3;
        }
        finally
        {
            if (hookId != IntPtr.Zero)
            {
                UnhookWindowsHookEx(hookId);
                hookId = IntPtr.Zero;
            }
        }
    }

    private static void Quit()
    {
        if (hookId != IntPtr.Zero)
        {
            UnhookWindowsHookEx(hookId);
            hookId = IntPtr.Zero;
        }
        PostQuitMessage(0);
    }

    private static IReadOnlyList<Hotkey> LoadHotkeys(string[] args)
    {
        if (args.Length == 0 || string.IsNullOrWhiteSpace(args[0]))
        {
            return [];
        }

        var json = Encoding.UTF8.GetString(Convert.FromBase64String(args[0]));
        var settings = JsonSerializer.Deserialize<GuardSettings>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (settings is null)
        {
            return [];
        }

        return new[]
            {
                ParseHotkey("capture", settings.ShortcutCapture),
                ParseHotkey("capture-copy", settings.ShortcutCaptureCopy),
                ParseHotkey("area", settings.ShortcutArea),
                ParseHotkey("scroll", settings.ShortcutScrollCapture),
                ParseHotkey("pin", settings.ShortcutPin),
                ParseHotkey("toggle-pins", settings.ShortcutTogglePins)
            }
            .Where(hotkey => hotkey is not null)
            .Select(hotkey => hotkey!)
            .ToArray();
    }

    private static Hotkey? ParseHotkey(string action, string? accelerator)
    {
        if (string.IsNullOrWhiteSpace(accelerator))
        {
            return null;
        }

        var parts = accelerator
            .Replace("CommandOrControl", "Ctrl", StringComparison.OrdinalIgnoreCase)
            .Replace("CmdOrCtrl", "Ctrl", StringComparison.OrdinalIgnoreCase)
            .Replace("Control", "Ctrl", StringComparison.OrdinalIgnoreCase)
            .Replace("Command", "Ctrl", StringComparison.OrdinalIgnoreCase)
            .Split('+', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);

        var ctrl = false;
        var shift = false;
        var alt = false;
        int? key = null;

        foreach (var rawPart in parts)
        {
            var part = rawPart.Trim().ToUpperInvariant();
            switch (part)
            {
                case "CTRL":
                case "CONTROL":
                    ctrl = true;
                    break;
                case "SHIFT":
                    shift = true;
                    break;
                case "ALT":
                case "OPTION":
                    alt = true;
                    break;
                default:
                    key = VirtualKeyFromName(part);
                    break;
            }
        }

        return key is null ? null : new Hotkey(action, key.Value, ctrl, shift, alt);
    }

    private static int? VirtualKeyFromName(string key)
    {
        if (key.Length == 1)
        {
            var ch = key[0];
            if (ch is >= 'A' and <= 'Z')
            {
                return ch;
            }
            if (ch is >= '0' and <= '9')
            {
                return ch;
            }
        }

        if (key.StartsWith('F') && int.TryParse(key[1..], out var functionIndex) && functionIndex is >= 1 and <= 24)
        {
            return 0x70 + functionIndex - 1;
        }

        return key switch
        {
            "ESC" or "ESCAPE" => 0x1B,
            "TAB" => 0x09,
            "ENTER" or "RETURN" => 0x0D,
            "SPACE" or "SPACEBAR" => 0x20,
            "BACKSPACE" => 0x08,
            "INSERT" => 0x2D,
            "DELETE" or "DEL" => 0x2E,
            "HOME" => 0x24,
            "END" => 0x23,
            "PAGEUP" or "PAGE UP" => 0x21,
            "PAGEDOWN" or "PAGE DOWN" => 0x22,
            "LEFT" or "LEFTARROW" => 0x25,
            "UP" or "UPARROW" => 0x26,
            "RIGHT" or "RIGHTARROW" => 0x27,
            "DOWN" or "DOWNARROW" => 0x28,
            "PRINTSCREEN" or "PRINT SCREEN" or "PRTSC" => 0x2C,
            _ => null
        };
    }

    private static IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            var message = wParam.ToInt32();
            var isKeyDown = message is WmKeydown or WmSyskeydown;
            var isKeyUp = message is WmKeyup or WmSyskeyup;
            var virtualKey = Marshal.ReadInt32(lParam);

            if (isKeyUp && SuppressedKeys.Remove(virtualKey))
            {
                return 1;
            }

            var matchedHotkey = hotkeys.FirstOrDefault(hotkey => Matches(hotkey, virtualKey));

            if (matchedHotkey is not null)
            {
                if (isKeyDown)
                {
                    if (SuppressedKeys.Add(virtualKey))
                    {
                        Console.WriteLine(matchedHotkey.Action);
                        Console.Out.Flush();
                    }
                    return 1;
                }

                if (isKeyUp) return 1;
            }
        }

        return CallNextHookEx(hookId, nCode, wParam, lParam);
    }

    private static bool Matches(Hotkey hotkey, int virtualKey)
    {
        return hotkey.VirtualKey == virtualKey
            && IsCtrlPressed() == hotkey.Ctrl
            && IsShiftPressed() == hotkey.Shift
            && IsAltPressed() == hotkey.Alt;
    }

    private static bool IsCtrlPressed() => IsPressed(0x11);
    private static bool IsShiftPressed() => IsPressed(0x10);
    private static bool IsAltPressed() => IsPressed(0x12);
    private static bool IsPressed(int virtualKey) => (GetAsyncKeyState(virtualKey) & 0x8000) != 0;

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    private static extern int GetMessage(out Msg lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage([In] ref Msg lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage([In] ref Msg lpMsg);

    [DllImport("user32.dll")]
    private static extern void PostQuitMessage(int nExitCode);

    [StructLayout(LayoutKind.Sequential)]
    private struct Msg
    {
        public IntPtr HWnd;
        public uint Message;
        public nuint WParam;
        public nint LParam;
        public uint Time;
        public int PointX;
        public int PointY;
    }
}
