using System.ComponentModel;
using System.Runtime.InteropServices;
using Windows.Graphics;

namespace Zhuageping_WinUI;

internal static class MonitorEnumerator
{
    private const uint MonitorInfoPrimary = 0x00000001;

    public static IReadOnlyList<MonitorDisplay> GetAll()
    {
        var displays = new List<MonitorDisplay>();
        MonitorEnumProc callback = (nint monitor, nint _, ref NativeRect __, nint ___) =>
        {
            var info = new MonitorInfoEx { Size = (uint)Marshal.SizeOf<MonitorInfoEx>() };
            if (GetMonitorInfo(monitor, ref info))
            {
                displays.Add(new MonitorDisplay(
                    ToRect(info.Monitor),
                    ToRect(info.Work),
                    (info.Flags & MonitorInfoPrimary) != 0,
                    info.DeviceName));
            }
            return true;
        };

        if (!EnumDisplayMonitors(0, 0, callback, 0))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to enumerate display monitors.");
        }
        return displays;
    }

    public static MonitorDisplay? GetAtCursor()
    {
        if (!GetCursorPos(out var point)) return null;
        return GetAll().FirstOrDefault(display =>
            point.X >= display.OuterBounds.X &&
            point.X < display.OuterBounds.X + display.OuterBounds.Width &&
            point.Y >= display.OuterBounds.Y &&
            point.Y < display.OuterBounds.Y + display.OuterBounds.Height);
    }

    private static RectInt32 ToRect(NativeRect rect) => new(rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct MonitorInfoEx
    {
        public uint Size;
        public NativeRect Monitor;
        public NativeRect Work;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string DeviceName;
    }

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private delegate bool MonitorEnumProc(nint monitor, nint hdc, ref NativeRect rect, nint data);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumDisplayMonitors(nint hdc, nint clip, MonitorEnumProc callback, nint data);

    [DllImport("user32.dll", EntryPoint = "GetMonitorInfoW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetMonitorInfo(nint monitor, ref MonitorInfoEx info);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetCursorPos(out NativePoint point);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint
    {
        public int X;
        public int Y;
    }
}

internal sealed record MonitorDisplay(RectInt32 OuterBounds, RectInt32 WorkArea, bool IsPrimary, string DeviceName);
