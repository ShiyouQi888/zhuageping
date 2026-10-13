using System.ComponentModel;
using System.Runtime.InteropServices;
using Windows.Graphics;

namespace Zhuageping_WinUI;

internal sealed class RecordingFrameSet : IDisposable
{
    private const uint Popup = 0x80000000;
    private const uint FrameWindowStyles = 0x080800A8; // no-activate, layered, tool, transparent, topmost
    private const uint WdaExcludeFromCapture = 0x00000011;
    private readonly RectInt32 _bounds;
    private readonly List<nint> _handles = [];

    public IReadOnlyList<nint> Handles => _handles;

    public RecordingFrameSet(RectInt32 bounds) => _bounds = bounds;

    public FrameSetupResult Show()
    {
        if (_handles.Count != 0) throw new InvalidOperationException("录制边框已经显示。");
        if (_bounds.Width < 4 || _bounds.Height < 4) throw new ArgumentOutOfRangeException(nameof(_bounds));
        // Upload an explicit ARGB surface: layered STATIC windows cannot rely on WM_PAINT.
        const int thickness = 3;
        var rects = new[]
        {
            new RectInt32(_bounds.X, _bounds.Y, _bounds.Width, thickness),
            new RectInt32(_bounds.X, _bounds.Y + _bounds.Height - thickness, _bounds.Width, thickness),
            new RectInt32(_bounds.X, _bounds.Y, thickness, _bounds.Height),
            new RectInt32(_bounds.X + _bounds.Width - thickness, _bounds.Y, thickness, _bounds.Height)
        };
        try
        {
            foreach (var rect in rects)
            {
                var hwnd = CreateWindowEx(FrameWindowStyles, "STATIC", "抓个屏录制边界", Popup,
                    rect.X, rect.Y, rect.Width, rect.Height, 0, 0, 0, 0);
                if (hwnd == 0) throw new Win32Exception(Marshal.GetLastWin32Error(), "创建录制边界失败。");
                _handles.Add(hwnd);
                PaintBorder(hwnd, rect);
                if (!SetWindowDisplayAffinity(hwnd, WdaExcludeFromCapture) ||
                    !GetWindowDisplayAffinity(hwnd, out var affinity) || affinity != WdaExcludeFromCapture ||
                    !SetWindowPos(hwnd, new nint(-1), rect.X, rect.Y, rect.Width, rect.Height, 0x0010 | 0x0040))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "录制边界无法置顶或从视频中排除。");
            }
            return new FrameSetupResult(true, true, true, "录制边界已显示，鼠标穿透，已设置采集排除。");
        }
        catch
        {
            Dispose();
            throw;
        }
    }

    private static void PaintBorder(nint hwnd, RectInt32 rect)
    {
        var dc = CreateCompatibleDC(0);
        if (dc == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
        nint bitmap = 0;
        nint previous = 0;
        try
        {
            var info = new BitmapInfo
            {
                Size = (uint)Marshal.SizeOf<BitmapInfo>(), Width = rect.Width, Height = -rect.Height,
                Planes = 1, BitCount = 32
            };
            bitmap = CreateDIBSection(dc, ref info, 0, out var bits, 0, 0);
            if (bitmap == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
            previous = SelectObject(dc, bitmap);
            if (previous == 0 || previous == new nint(-1)) throw new Win32Exception(Marshal.GetLastWin32Error());
            var pixels = new int[checked(rect.Width * rect.Height)];
            Array.Fill(pixels, unchecked((int)0xFF00BCD4));
            Marshal.Copy(pixels, 0, bits, pixels.Length);
            var destination = new Point { X = rect.X, Y = rect.Y };
            var source = new Point();
            var size = new Size { Width = rect.Width, Height = rect.Height };
            var blend = new BlendFunction { SourceConstantAlpha = 255, AlphaFormat = 1 };
            if (!UpdateLayeredWindow(hwnd, 0, ref destination, ref size, dc, ref source, 0, ref blend, 2))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "绘制录制边界失败。");
        }
        finally
        {
            if (previous != 0 && previous != new nint(-1)) SelectObject(dc, previous);
            if (bitmap != 0) DeleteObject(bitmap);
            DeleteDC(dc);
        }
    }

    public bool EnsureVisible()
    {
        if (_handles.Count != 4) return false;
        var visible = true;
        foreach (var hwnd in _handles)
        {
            visible &= SetWindowPos(hwnd, new nint(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040)
                && IsWindowVisible(hwnd);
        }
        return visible;
    }

    public void Dispose()
    {
        foreach (var hwnd in _handles) DestroyWindow(hwnd);
        _handles.Clear();
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern nint CreateWindowEx(uint exStyle, string className, string windowName, uint style,
        int x, int y, int width, int height, nint parent, nint menu, nint instance, nint parameter);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool DestroyWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint hwnd);
    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Size { public int Width, Height; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct BlendFunction { public byte Operation, Flags, SourceConstantAlpha, AlphaFormat; }
    [StructLayout(LayoutKind.Sequential)]
    private struct BitmapInfo
    {
        public uint Size;
        public int Width, Height;
        public ushort Planes, BitCount;
        public uint Compression, SizeImage;
        public int XPelsPerMeter, YPelsPerMeter;
        public uint ColorsUsed, ColorsImportant;
    }
    [DllImport("gdi32.dll", SetLastError = true)] private static extern nint CreateCompatibleDC(nint dc);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern nint CreateDIBSection(nint dc, ref BitmapInfo info, uint usage, out nint bits, nint section, uint offset);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern nint SelectObject(nint dc, nint value);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(nint value);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(nint dc);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UpdateLayeredWindow(nint hwnd, nint destinationDc, ref Point destination,
        ref Size size, nint sourceDc, ref Point source, uint colorKey, ref BlendFunction blend, uint flags);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(nint hwnd, nint insertAfter, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowDisplayAffinity(nint hwnd, uint affinity);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool GetWindowDisplayAffinity(nint hwnd, out uint affinity);
}

internal sealed record FrameSetupResult(bool Topmost, bool ClickThrough, bool CaptureExcluded, string Message);
