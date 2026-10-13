using System.Text.Json;

namespace Zhuageping_WinUI;

internal static class RapidOcrResponseParser
{
    private sealed record Block(string Text, double Left, double Top, double Bottom)
    {
        public double Height => Bottom - Top;
        public double Center => (Top + Bottom) / 2;
    }

    public static RapidOcrResult Parse(string response)
    {
        using var document = JsonDocument.Parse(response);
        var root = document.RootElement;
        var code = root.ValueKind == JsonValueKind.Object && root.TryGetProperty("code", out var status) &&
            status.ValueKind == JsonValueKind.Number && status.TryGetInt32(out var value) ? value : -1;
        if (root.ValueKind != JsonValueKind.Object) return new RapidOcrResult(false, [], "OCR 引擎返回格式无效。");
        if (code == 101) return new RapidOcrResult(true, [], string.Empty);
        if (code != 100 || !root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
        {
            var error = root.TryGetProperty("message", out var message) && message.ValueKind == JsonValueKind.String
                ? message.GetString() : root.TryGetProperty("data", out var detail) && detail.ValueKind == JsonValueKind.String
                    ? detail.GetString() : null;
            return new RapidOcrResult(false, [], string.IsNullOrWhiteSpace(error) ? "OCR 引擎识别失败。" : error);
        }
        var original = new List<string>();
        var blocks = new List<Block>();
        foreach (var item in data.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("text", out var text) || text.ValueKind != JsonValueKind.String) continue;
            var line = text.GetString()?.Trim();
            if (string.IsNullOrEmpty(line)) continue;
            original.Add(line);
            if (!item.TryGetProperty("box", out var box) || box.ValueKind != JsonValueKind.Array || box.GetArrayLength() != 4) continue;
            var points = new List<(double X, double Y)>();
            foreach (var point in box.EnumerateArray())
            {
                if (point.ValueKind != JsonValueKind.Array || point.GetArrayLength() != 2 ||
                    point[0].ValueKind != JsonValueKind.Number || point[1].ValueKind != JsonValueKind.Number ||
                    !point[0].TryGetDouble(out var x) || !point[1].TryGetDouble(out var y) ||
                    !double.IsFinite(x) || !double.IsFinite(y)) break;
                points.Add((x, y));
            }
            if (points.Count != 4) continue;
            var top = points.Min(point => point.Y);
            var bottom = points.Max(point => point.Y);
            if (bottom > top) blocks.Add(new Block(line, points.Min(point => point.X), top, bottom));
        }
        // Keep every engine result, including duplicates. Only reorder when all
        // blocks have valid geometry; never guess positions of unboxed text.
        if (blocks.Count != original.Count) return new RapidOcrResult(true, original, string.Empty);
        var rows = new List<List<Block>>();
        foreach (var block in blocks.OrderBy(block => block.Top).ThenBy(block => block.Left))
        {
            var row = rows.LastOrDefault();
            if (row is null || Math.Abs(row[0].Center - block.Center) > Math.Min(row[0].Height, block.Height) * 0.4)
                rows.Add([block]);
            else row.Add(block);
        }
        return new RapidOcrResult(true, rows.SelectMany(row => row.OrderBy(block => block.Left)).Select(block => block.Text).ToArray(), string.Empty);
    }
}
