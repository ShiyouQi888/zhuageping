using System.Runtime.InteropServices;
using System.Text;

namespace ZhuagepingWindowProbe;

internal static class Program
{
    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private delegate bool EnumWindowsProc(nint hwnd, nint lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, nint lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(nint hwnd);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(nint hwnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(nint hwnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(nint hwnd, StringBuilder className, int maxCount);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(nint hwnd, int attribute, out Rect value, int size);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(nint hwnd, int attribute, out int value, int size);

    public static int Main(string[] args)
    {
        if (args.Length != 5 || !args.All(value => int.TryParse(value, out _))) return 2;
        var values = args.Select(int.Parse).ToArray();
        var excludedProcessId = values[0];
        var displayLeft = values[1];
        var displayTop = values[2];
        var displayRight = values[3];
        var displayBottom = values[4];
        var rows = new List<string>();

        EnumWindows((hwnd, _) =>
        {
            if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
            GetWindowThreadProcessId(hwnd, out var processId);
            if (processId == excludedProcessId) return true;

            var className = new StringBuilder(256);
            GetClassName(hwnd, className, className.Capacity);
            if (className.ToString() is "Shell_TrayWnd" or "Shell_SecondaryTrayWnd" or "Progman" or "WorkerW") return true;

            if (DwmGetWindowAttribute(hwnd, 14, out int cloaked, sizeof(int)) == 0 && cloaked != 0) return true;
            if (DwmGetWindowAttribute(hwnd, 9, out Rect rect, Marshal.SizeOf<Rect>()) != 0) return true;
            if (rect.Right <= displayLeft || rect.Bottom <= displayTop || rect.Left >= displayRight || rect.Top >= displayBottom) return true;

            var left = Math.Max(displayLeft, rect.Left);
            var top = Math.Max(displayTop, rect.Top);
            var right = Math.Min(displayRight, rect.Right);
            var bottom = Math.Min(displayBottom, rect.Bottom);
            if (right - left < 80 || bottom - top < 60) return true;
            rows.Add($"{left},{top},{right},{bottom}");
            return true;
        }, nint.Zero);

        Console.Write(string.Join('|', rows));
        return 0;
    }
}
