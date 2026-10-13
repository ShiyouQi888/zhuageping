using System.Text.Json;
using Zhuageping_WinUI;

static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

var empty = RapidOcrResponseParser.Parse("{\"code\":101,\"data\":\"no text\"}");
Check(empty.Success && empty.Lines.Count == 0, "No-text result must not be an engine failure.");
Check(!RapidOcrResponseParser.Parse("{\"code\":400,\"data\":\"bad image\"}").Success, "Engine failure lost.");
Check(!RapidOcrResponseParser.Parse("{\"code\":\"100\"}").Success, "Malformed status accepted.");
Check(!RapidOcrResponseParser.Parse("[]").Success, "Malformed root accepted.");
object Block(string text, int x, int y) => new { text, box = new[] { new[] { x, y }, new[] { x + 60, y }, new[] { x + 60, y + 20 }, new[] { x, y + 20 } } };
var sorted = RapidOcrResponseParser.Parse(JsonSerializer.Serialize(new
{
    code = 100,
    data = new[] { Block("bottom", 10, 60), Block("right", 100, 12), Block("left", 10, 10) }
}));
Check(sorted.Lines.SequenceEqual(new[] { "left", "right", "bottom" }), "Reading order must use geometry and tolerate baseline jitter.");
var longText = new string('中', 10000) + " https://example.com/?a=1&b=2";
var preserved = RapidOcrResponseParser.Parse(JsonSerializer.Serialize(new
{
    code = 100,
    data = new[] { new { text = longText }, new { text = "same" }, new { text = "same" } }
}));
Check(preserved.Lines.Count == 3 && preserved.Lines[0] == longText && preserved.Lines[1] == preserved.Lines[2], "Long text, URLs or duplicate blocks were lost.");
var mixed = RapidOcrResponseParser.Parse("{\"code\":100,\"data\":[{\"text\":\"first\",\"box\":[[0,30],[20,30],[20,50],[0,50]]},{\"text\":\"unboxed\"}]}");
Check(mixed.Lines.SequenceEqual(new[] { "first", "unboxed" }), "Mixed geometry must retain engine order.");
Console.WriteLine("PASS: reading order, empty/error/malformed results, long text, URLs and duplicate preservation.");
using (var cancelled = new CancellationTokenSource())
{
    cancelled.Cancel();
    try
    {
        await RapidOcrService.RecognizeAsync("unused.png", cancelled.Token);
        throw new InvalidOperationException("Cancelled OCR must not start an engine.");
    }
    catch (OperationCanceledException) { }
}
Console.WriteLine("PASS: cancelled OCR does not start an engine.");
if (args.Length > 0)
{
    var result = await RapidOcrService.RecognizeAsync(Path.GetFullPath(args[0]));
    Check(result.Success && result.Lines.Count > 0, result.Error.Length > 0 ? result.Error : "Real engine returned no text.");
    if (Path.GetFileName(args[0]) == "long-list.png")
    {
        Check(result.Lines.Count >= 26, "Long-list fixture lost text rows.");
        Check(result.Text.Contains("START", StringComparison.OrdinalIgnoreCase), "First row was lost.");
        Check(result.Text.Contains("FINAL", StringComparison.OrdinalIgnoreCase), "Last row was lost.");
        Check(result.Text.IndexOf("START", StringComparison.OrdinalIgnoreCase) < result.Text.IndexOf("FINAL", StringComparison.OrdinalIgnoreCase), "Reading order reversed.");
    }
    Console.WriteLine($"PASS: real engine with 2048-pixel detector limit; {result.Lines.Count} blocks, {result.Text.Length} characters.");
}
