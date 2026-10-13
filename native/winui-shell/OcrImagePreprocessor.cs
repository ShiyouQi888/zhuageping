using Windows.Graphics.Imaging;
using Windows.Storage;

namespace Zhuageping_WinUI;

internal static class OcrImagePreprocessor
{
    private const uint PreferredLongEdge = 1600;
    private const double MaxScale = 3.0;

    public static async Task PrepareAsync(string sourcePath, string destinationPath)
    {
        var source = await StorageFile.GetFileFromPathAsync(sourcePath);
        using var input = await source.OpenReadAsync();
        var decoder = await BitmapDecoder.CreateAsync(input);

        var scale = GetScale(decoder.PixelWidth, decoder.PixelHeight);
        var transform = new BitmapTransform
        {
            ScaledWidth = Math.Max(1u, (uint)Math.Round(decoder.PixelWidth * scale)),
            ScaledHeight = Math.Max(1u, (uint)Math.Round(decoder.PixelHeight * scale)),
            InterpolationMode = BitmapInterpolationMode.Fant
        };

        using var bitmap = await decoder.GetSoftwareBitmapAsync(
            BitmapPixelFormat.Bgra8,
            BitmapAlphaMode.Premultiplied,
            transform,
            ExifOrientationMode.IgnoreExifOrientation,
            ColorManagementMode.DoNotColorManage);

        var destinationFolder = await StorageFolder.GetFolderFromPathAsync(Path.GetDirectoryName(destinationPath)!);
        var destination = await destinationFolder.CreateFileAsync(
            Path.GetFileName(destinationPath),
            CreationCollisionOption.ReplaceExisting);
        using var output = await destination.OpenAsync(FileAccessMode.ReadWrite);
        var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, output);
        encoder.SetSoftwareBitmap(bitmap);
        await encoder.FlushAsync();
    }

    private static double GetScale(uint width, uint height)
    {
        var longEdge = Math.Max(width, height);
        if (longEdge == 0 || longEdge >= PreferredLongEdge) return 1.0;
        return Math.Min(MaxScale, (double)PreferredLongEdge / longEdge);
    }
}
