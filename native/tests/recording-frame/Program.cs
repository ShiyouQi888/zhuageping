using System.Runtime.InteropServices;
using Windows.Graphics;
using Zhuageping_WinUI;

internal static class Program
{
    private static void Main()
    {
        var displays = new[]
        {
            new MonitorDisplay(new RectInt32(0, 0, 1920, 1080), default, true, "primary"),
            new MonitorDisplay(new RectInt32(-2560, -360, 2560, 1440), default, false, "left"),
            new MonitorDisplay(new RectInt32(0, -2160, 3840, 2160), default, false, "above")
        };
        foreach (var (x, y, expected) in new[]
        {
            (0, 0, 0), (1919, 1079, 0), (-1, 0, 1), (-2560, -360, 1),
            (-2561, 0, -1), (0, -1, 2), (3839, -2160, 2), (1920, 0, -1), (0, 1080, -1)
        })
            Require(DesktopSelectionMapping.FindDisplay(displays, x, y) == expected, $"Wrong monitor at {x},{y}.");
        Console.WriteLine("PASS: monitor switching mapping, shared edges, negative origins, vertically arranged displays, and desktop gaps.");
        foreach (var display in MonitorEnumerator.GetAll())
            Console.WriteLine($"Connected: {display.DeviceName} {display.OuterBounds.X},{display.OuterBounds.Y} {display.OuterBounds.Width}x{display.OuterBounds.Height}");

        var frozenPath = Path.Combine(Path.GetTempPath(), $"Zhuageping-frozen-test-{Guid.NewGuid():N}.png");
        try
        {
            var bytes = new byte[] { 0, 0, 255, 255, 0, 255, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255 };
            NativeScreenshotCapture.SavePixelsAsPng(new RectInt32(-2, -2, 2, 2), bytes, frozenPath);
            VerifyFrozenPng(frozenPath);
            Console.WriteLine("PASS: selected-monitor frozen BGRA pixels round-trip through PNG with exact colors and row orientation.");
        }
        finally { if (File.Exists(frozenPath)) File.Delete(frozenPath); }

        VerifyMemoryCrop();

        foreach (var bounds in new[] { new RectInt32(400, 200, 640, 360), new RectInt32(140, 100, 320, 480), new RectInt32(-640, -360, 640, 360) })
        {
            var frame = new RecordingFrameSet(bounds);
            try
            {
                frame.Show();
                Require(frame.Handles.Count == 4, "Four border surfaces must be created.");
                var expected = new[]
                {
                    new RectInt32(bounds.X, bounds.Y, bounds.Width, 3),
                    new RectInt32(bounds.X, bounds.Y + bounds.Height - 3, bounds.Width, 3),
                    new RectInt32(bounds.X, bounds.Y, 3, bounds.Height),
                    new RectInt32(bounds.X + bounds.Width - 3, bounds.Y, 3, bounds.Height)
                };
                var handles = frame.Handles.ToArray();
                for (var i = 0; i < handles.Length; i++)
                {
                    var hwnd = handles[i];
                    Require(IsWindowVisible(hwnd), "Border must be marked visible.");
                    Require(GetWindowRect(hwnd, out var rect), "Border rectangle must be available.");
                    var target = expected[i];
                    Require(rect.Left == target.X && rect.Top == target.Y && rect.Right - rect.Left == target.Width && rect.Bottom - rect.Top == target.Height,
                        "Border must match physical selection coordinates exactly.");
                    Require((GetWindowLongPtr(hwnd, -20).ToInt64() & 0x080800A8) == 0x080800A8,
                        "Border must be topmost, layered, click-through, nonactivating and hidden from the taskbar.");
                    Require(GetWindowDisplayAffinity(hwnd, out var affinity) && affinity == 0x11, "Border must be excluded from capture.");
                    Require(DwmGetWindowAttribute(hwnd, 14, out var cloaked, sizeof(int)) == 0 && cloaked == 0, "Border must not be compositor-cloaked.");
                }
                ShowWindow(handles[0], 0);
                Require(!IsWindowVisible(handles[0]), "Test must hide one border before recovery.");
                Require(frame.EnsureVisible() && handles.All(IsWindowVisible), "Visibility refresh must restore every border.");
                frame.Dispose();
                Require(handles.All(hwnd => !IsWindow(hwnd)), "All border windows must close after recording.");
                Require(!frame.EnsureVisible(), "Disposed frames must not reopen.");
                Console.WriteLine($"PASS: {bounds.X},{bounds.Y} {bounds.Width}x{bounds.Height}: surfaces uploaded, geometry/visibility/styles/affinity/cloaking/cleanup.");
            }
            finally { frame.Dispose(); }
        }
    }

    private static void Require(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
    private static void VerifyMemoryCrop()
    {
        var folder = Path.Combine(Path.GetTempPath(), $"Zhuageping-crop-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(folder);
        try
        {
            var source = new byte[7 * 5 * 4];
            for (var i = 0; i < source.Length; i += 4)
            {
                source[i] = (byte)i;
                source[i + 1] = (byte)(i / 4);
                source[i + 2] = (byte)(255 - i);
                source[i + 3] = 255;
            }
            var bounds = new RectInt32(-1920, -360, 7, 5);
            foreach (var crop in new[] { new RectInt32(2, 1, 3, 3), new RectInt32(6, 4, 1, 1), new RectInt32(0, 0, 7, 5) })
            {
                var path = Path.Combine(folder, "crop.png");
                NativeScreenshotCapture.SaveRegionPixelsAsPng(bounds, source, crop, path);
                var input = new GdiStartup { Version = 1 };
                Require(GdiplusStartup(out var token, ref input, 0) == 0, "GDI+ must start.");
                nint bitmap = 0;
                try
                {
                    Require(GdipCreateBitmapFromFile(path, out bitmap) == 0, "Cropped PNG must decode.");
                    Require(GdipGetImageWidth(bitmap, out var width) == 0 && width == crop.Width &&
                        GdipGetImageHeight(bitmap, out var height) == 0 && height == crop.Height, "Crop dimensions must match.");
                    for (var y = 0; y < crop.Height; y++)
                        for (var x = 0; x < crop.Width; x++)
                        {
                            var offset = ((y + crop.Y) * bounds.Width + x + crop.X) * 4;
                            var expected = 0xFF000000u | (uint)source[offset + 2] << 16 | (uint)source[offset + 1] << 8 | source[offset];
                            Require(GdipBitmapGetPixel(bitmap, x, y, out var color) == 0 && color == expected,
                                "Memory crop must preserve every BGRA pixel and row orientation.");
                        }
                }
                finally { if (bitmap != 0) GdipDisposeImage(bitmap); GdiplusShutdown(token); }
            }
            foreach (var crop in new[] { new RectInt32(-1, 0, 1, 1), new RectInt32(6, 4, 2, 1), new RectInt32(0, 0, 0, 2), new RectInt32(int.MaxValue, 0, int.MaxValue, 1) })
            {
                try
                {
                    NativeScreenshotCapture.SaveRegionPixelsAsPng(bounds, source, crop, Path.Combine(folder, "invalid.png"));
                    throw new InvalidOperationException("Invalid crop must fail.");
                }
                catch (ArgumentOutOfRangeException) { }
                Require(!File.Exists(Path.Combine(folder, "invalid.png")), "Invalid crop must not create a file.");
            }
            Console.WriteLine("PASS: in-memory PNG crop: odd dimensions, exact pixels, negative monitor origins, last pixel, full frame, invalid/overflow bounds.");

            var largeBounds = new RectInt32(0, 0, 1920, 1080);
            var large = new byte[1920 * 1080 * 4];
            new Random(42).NextBytes(large);
            for (var i = 3; i < large.Length; i += 4) large[i] = 255;
            var region = new RectInt32(200, 100, 640, 360);
            var oldTimes = new List<double>();
            var newTimes = new List<double>();
            for (var i = 0; i < 4; i++)
            {
                var clock = System.Diagnostics.Stopwatch.StartNew();
                NativeScreenshotCapture.SavePixelsAsPng(largeBounds, large, Path.Combine(folder, "full.png"));
                NativeScreenshotCapture.CropPng(Path.Combine(folder, "full.png"), Path.Combine(folder, "old.png"), region);
                if (i > 0) oldTimes.Add(clock.Elapsed.TotalMilliseconds);
                clock.Restart();
                NativeScreenshotCapture.SaveRegionPixelsAsPng(largeBounds, large, region, Path.Combine(folder, "new.png"));
                if (i > 0) newTimes.Add(clock.Elapsed.TotalMilliseconds);
            }
            Console.WriteLine($"BENCH: 1080p frozen frame -> 640x360 PNG, median of 3 after warmup: disk roundtrip {oldTimes.Order().ElementAt(1):F1} ms; memory crop {newTimes.Order().ElementAt(1):F1} ms (not end-to-end UI latency).");
        }
        finally { Directory.Delete(folder, recursive: true); }
    }
    private static void VerifyFrozenPng(string path)
    {
        var input = new GdiStartup { Version = 1 };
        Require(GdiplusStartup(out var token, ref input, 0) == 0, "GDI+ must start.");
        nint bitmap = 0;
        try
        {
            Require(GdipCreateBitmapFromFile(path, out bitmap) == 0, "Frozen PNG must decode.");
            var expected = new uint[] { 0xFFFF0000, 0xFF00FF00, 0xFF0000FF, 0xFFFFFFFF };
            for (var i = 0; i < expected.Length; i++)
                Require(GdipBitmapGetPixel(bitmap, i % 2, i / 2, out var color) == 0 && color == expected[i], "Frozen PNG pixel must match selected monitor.");
        }
        finally { if (bitmap != 0) GdipDisposeImage(bitmap); GdiplusShutdown(token); }
    }
    [StructLayout(LayoutKind.Sequential)] private struct GdiStartup { public uint Version; public nint Callback; public int SuppressThread, SuppressCodecs; }
    [DllImport("gdiplus.dll")] private static extern int GdiplusStartup(out nuint token, ref GdiStartup input, nint output);
    [DllImport("gdiplus.dll")] private static extern void GdiplusShutdown(nuint token);
    [DllImport("gdiplus.dll", CharSet = CharSet.Unicode)] private static extern int GdipCreateBitmapFromFile(string file, out nint bitmap);
    [DllImport("gdiplus.dll")] private static extern int GdipBitmapGetPixel(nint bitmap, int x, int y, out uint color);
    [DllImport("gdiplus.dll")] private static extern int GdipDisposeImage(nint bitmap);
    [DllImport("gdiplus.dll")] private static extern int GdipGetImageWidth(nint bitmap, out uint width);
    [DllImport("gdiplus.dll")] private static extern int GdipGetImageHeight(nint bitmap, out uint height);
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern bool IsWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern bool ShowWindow(nint hwnd, int command);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint hwnd);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint hwnd, out Rect rect);
    [DllImport("user32.dll")] private static extern nint GetWindowLongPtr(nint hwnd, int index);
    [DllImport("user32.dll")] private static extern bool GetWindowDisplayAffinity(nint hwnd, out uint affinity);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(nint hwnd, uint attribute, out int value, int size);
}
