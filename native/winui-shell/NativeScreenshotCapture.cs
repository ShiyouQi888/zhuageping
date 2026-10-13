using System.ComponentModel;
using System.Runtime.InteropServices;
using Windows.Graphics;

namespace Zhuageping_WinUI;

internal static class NativeScreenshotCapture
{
    private const uint Srccopy = 0x00CC0020;
    private const uint CaptureLayeredWindows = 0x40000000;
    private static readonly Guid PngEncoder = new("557cf406-1a04-11d3-9a73-0000f81ef32e");

    public static byte[] CaptureDisplayPixels(RectInt32 bounds)
    {
        if (bounds.Width <= 0 || bounds.Height <= 0) throw new ArgumentOutOfRangeException(nameof(bounds));
        var pixels = new byte[checked(bounds.Width * bounds.Height * 4)];
        var screenDc = GetDC(IntPtr.Zero);
        if (screenDc == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        var memoryDc = IntPtr.Zero;
        var bitmap = IntPtr.Zero;
        var previous = IntPtr.Zero;
        try
        {
            memoryDc = CreateCompatibleDC(screenDc);
            var header = new BitmapInfoHeader
            {
                Size = (uint)Marshal.SizeOf<BitmapInfoHeader>(),
                Width = bounds.Width, Height = -bounds.Height,
                Planes = 1, BitCount = 32
            };
            bitmap = CreateDIBSection(screenDc, ref header, 0, out var bits, IntPtr.Zero, 0);
            if (memoryDc == IntPtr.Zero || bitmap == IntPtr.Zero || bits == IntPtr.Zero)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "无法创建录屏选区预览。");
            previous = SelectObject(memoryDc, bitmap);
            if (previous == IntPtr.Zero || previous == new IntPtr(-1))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            if (!BitBlt(memoryDc, 0, 0, bounds.Width, bounds.Height, screenDc, bounds.X, bounds.Y, Srccopy | CaptureLayeredWindows))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "读取显示器像素失败。");
            GdiFlush();
            Marshal.Copy(bits, pixels, 0, pixels.Length);
            for (var i = 3; i < pixels.Length; i += 4) pixels[i] = 255;
            return pixels;
        }
        finally
        {
            if (previous != IntPtr.Zero && previous != new IntPtr(-1)) SelectObject(memoryDc, previous);
            if (bitmap != IntPtr.Zero) DeleteObject(bitmap);
            if (memoryDc != IntPtr.Zero) DeleteDC(memoryDc);
            ReleaseDC(IntPtr.Zero, screenDc);
        }
    }

    public static void SaveRegionPixelsAsPng(RectInt32 bounds, byte[] pixels, RectInt32 crop, string path)
    {
        if (bounds.Width <= 0 || bounds.Height <= 0 || pixels.Length != checked(bounds.Width * bounds.Height * 4))
            throw new ArgumentException("截图像素与显示器尺寸不一致。", nameof(pixels));
        if (crop.X < 0 || crop.Y < 0 || crop.Width <= 0 || crop.Height <= 0 ||
            (long)crop.X + crop.Width > bounds.Width || (long)crop.Y + crop.Height > bounds.Height)
            throw new ArgumentOutOfRangeException(nameof(crop));
        var stride = checked(crop.Width * 4);
        var cropped = new byte[checked(stride * crop.Height)];
        for (var row = 0; row < crop.Height; row++)
            Buffer.BlockCopy(pixels, checked(((crop.Y + row) * bounds.Width + crop.X) * 4), cropped, row * stride, stride);
        SavePixelsAsPng(new RectInt32(0, 0, crop.Width, crop.Height), cropped, path);
    }

    public static void SaveDisplayAsPng(RectInt32 bounds, string path)
    {
        if (bounds.Width <= 0 || bounds.Height <= 0) throw new ArgumentOutOfRangeException(nameof(bounds));
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        var screenDc = GetDC(IntPtr.Zero);
        if (screenDc == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "无法获取桌面设备上下文。");
        var memoryDc = IntPtr.Zero;
        var bitmap = IntPtr.Zero;
        var previousBitmap = IntPtr.Zero;
        var gdipToken = UIntPtr.Zero;
        var image = IntPtr.Zero;
        try
        {
            memoryDc = CreateCompatibleDC(screenDc);
            bitmap = CreateCompatibleBitmap(screenDc, bounds.Width, bounds.Height);
            if (memoryDc == IntPtr.Zero || bitmap == IntPtr.Zero)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "无法创建屏幕截图位图。");
            previousBitmap = SelectObject(memoryDc, bitmap);
            if (previousBitmap == IntPtr.Zero || previousBitmap == new IntPtr(-1))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "无法选择截图位图。");
            if (!BitBlt(memoryDc, 0, 0, bounds.Width, bounds.Height, screenDc, bounds.X, bounds.Y, Srccopy | CaptureLayeredWindows))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "读取显示器像素失败。");

            var startup = new GdiplusStartupInput { Version = 1 };
            CheckGdiPlus(GdiplusStartup(out gdipToken, ref startup, IntPtr.Zero), "初始化 PNG 编码器失败");
            CheckGdiPlus(GdipCreateBitmapFromHBITMAP(bitmap, IntPtr.Zero, out image), "创建 PNG 图像失败");
            var encoder = PngEncoder;
            CheckGdiPlus(GdipSaveImageToFile(image, Path.GetFullPath(path), ref encoder, IntPtr.Zero), "保存 PNG 文件失败");
        }
        finally
        {
            if (image != IntPtr.Zero) GdipDisposeImage(image);
            if (gdipToken != UIntPtr.Zero) GdiplusShutdown(gdipToken);
            if (previousBitmap != IntPtr.Zero && previousBitmap != new IntPtr(-1)) SelectObject(memoryDc, previousBitmap);
            if (bitmap != IntPtr.Zero) DeleteObject(bitmap);
            if (memoryDc != IntPtr.Zero) DeleteDC(memoryDc);
            ReleaseDC(IntPtr.Zero, screenDc);
        }
    }

    public static void SavePixelsAsPng(RectInt32 bounds, byte[] pixels, string path)
    {
        if (bounds.Width <= 0 || bounds.Height <= 0 || pixels.Length != checked(bounds.Width * bounds.Height * 4))
            throw new ArgumentException("截图像素与显示器尺寸不一致。", nameof(pixels));
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        var startup = new GdiplusStartupInput { Version = 1 };
        CheckGdiPlus(GdiplusStartup(out var token, ref startup, IntPtr.Zero), "初始化 PNG 编码器失败");
        var pinned = GCHandle.Alloc(pixels, GCHandleType.Pinned);
        var image = IntPtr.Zero;
        try
        {
            CheckGdiPlus(GdipCreateBitmapFromScan0(bounds.Width, bounds.Height, checked(bounds.Width * 4),
                0x0026200A, pinned.AddrOfPinnedObject(), out image), "创建冻结截图失败");
            var encoder = PngEncoder;
            CheckGdiPlus(GdipSaveImageToFile(image, Path.GetFullPath(path), ref encoder, IntPtr.Zero), "保存冻结截图失败");
        }
        finally
        {
            if (image != IntPtr.Zero) GdipDisposeImage(image);
            pinned.Free();
            GdiplusShutdown(token);
        }
    }

    [DllImport("gdiplus.dll")] private static extern int GdipCreateBitmapFromScan0(int width, int height, int stride, int pixelFormat, IntPtr pixels, out IntPtr bitmap);

    public static void CropPng(string sourcePath, string destinationPath, RectInt32 crop)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);
        var startup = new GdiplusStartupInput { Version = 1 };
        CheckGdiPlus(GdiplusStartup(out var token, ref startup, IntPtr.Zero), "初始化 PNG 裁切器失败");
        var source = IntPtr.Zero;
        var cropped = IntPtr.Zero;
        try
        {
            CheckGdiPlus(GdipLoadImageFromFile(sourcePath, out source), "读取全屏截图失败");
            CheckGdiPlus(GdipGetImageWidth(source, out var imageWidth), "读取截图宽度失败");
            CheckGdiPlus(GdipGetImageHeight(source, out var imageHeight), "读取截图高度失败");
            var x = Math.Clamp(crop.X, 0, (int)imageWidth);
            var y = Math.Clamp(crop.Y, 0, (int)imageHeight);
            var width = Math.Min(crop.Width, (int)imageWidth - x);
            var height = Math.Min(crop.Height, (int)imageHeight - y);
            if (width <= 0 || height <= 0) throw new ArgumentOutOfRangeException(nameof(crop), "选区超出截图范围。");
            CheckGdiPlus(GdipCloneBitmapAreaI(x, y, width, height, 0x0026200A, source, out cropped), "裁切选区失败");
            var encoder = PngEncoder;
            CheckGdiPlus(GdipSaveImageToFile(cropped, Path.GetFullPath(destinationPath), ref encoder, IntPtr.Zero), "保存区域截图失败");
        }
        finally
        {
            if (cropped != IntPtr.Zero) GdipDisposeImage(cropped);
            if (source != IntPtr.Zero) GdipDisposeImage(source);
            GdiplusShutdown(token);
        }
    }

    private static void CheckGdiPlus(int status, string message)
    {
        if (status != 0) throw new InvalidOperationException($"{message}（GDI+ 状态码 {status}）");
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BitmapInfoHeader
    {
        public uint Size;
        public int Width, Height;
        public ushort Planes, BitCount;
        public uint Compression, SizeImage;
        public int XPelsPerMeter, YPelsPerMeter;
        public uint ColorsUsed, ColorsImportant;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct GdiplusStartupInput
    {
        public uint Version;
        public IntPtr DebugEventCallback;
        [MarshalAs(UnmanagedType.Bool)] public bool SuppressBackgroundThread;
        [MarshalAs(UnmanagedType.Bool)] public bool SuppressExternalCodecs;
    }

    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetDC(IntPtr window);
    [DllImport("user32.dll", SetLastError = true)] private static extern int ReleaseDC(IntPtr window, IntPtr dc);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern IntPtr CreateCompatibleBitmap(IntPtr dc, int width, int height);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern IntPtr CreateDIBSection(IntPtr dc, ref BitmapInfoHeader info, uint usage, out IntPtr bits, IntPtr section, uint offset);
    [DllImport("gdi32.dll")] private static extern bool GdiFlush();
    [DllImport("gdi32.dll", SetLastError = true)] private static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern bool BitBlt(IntPtr destination, int x, int y, int width, int height, IntPtr source, int sourceX, int sourceY, uint operation);
    [DllImport("gdiplus.dll")] private static extern int GdiplusStartup(out UIntPtr token, ref GdiplusStartupInput input, IntPtr output);
    [DllImport("gdiplus.dll")] private static extern void GdiplusShutdown(UIntPtr token);
    [DllImport("gdiplus.dll")] private static extern int GdipCreateBitmapFromHBITMAP(IntPtr bitmap, IntPtr palette, out IntPtr image);
    [DllImport("gdiplus.dll", CharSet = CharSet.Unicode)] private static extern int GdipLoadImageFromFile(string filename, out IntPtr image);
    [DllImport("gdiplus.dll")] private static extern int GdipGetImageWidth(IntPtr image, out uint width);
    [DllImport("gdiplus.dll")] private static extern int GdipGetImageHeight(IntPtr image, out uint height);
    [DllImport("gdiplus.dll")] private static extern int GdipCloneBitmapAreaI(int x, int y, int width, int height, int pixelFormat, IntPtr source, out IntPtr bitmap);
    [DllImport("gdiplus.dll", CharSet = CharSet.Unicode)] private static extern int GdipSaveImageToFile(IntPtr image, string filename, ref Guid encoder, IntPtr encoderParameters);
    [DllImport("gdiplus.dll")] private static extern int GdipDisposeImage(IntPtr image);
}
