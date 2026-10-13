using Windows.Graphics;

namespace Zhuageping_WinUI;

internal sealed record FrozenDisplayFrame(MonitorDisplay Display, byte[] Pixels);
internal sealed record DesktopSelection(FrozenDisplayFrame Frame, RectInt32 Region, bool IsWindow);

internal static class DesktopSelectionMapping
{
    public static int FindDisplay(IReadOnlyList<MonitorDisplay> displays, int x, int y)
    {
        for (var i = 0; i < displays.Count; i++)
        {
            var bounds = displays[i].OuterBounds;
            if (x >= bounds.X && x < (long)bounds.X + bounds.Width &&
                y >= bounds.Y && y < (long)bounds.Y + bounds.Height) return i;
        }
        return -1;
    }
}
