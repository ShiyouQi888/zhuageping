using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Zhuageping_WinUI;

internal sealed record RapidOcrResult(bool Success, IReadOnlyList<string> Lines, string Error)
{
    public string Text => string.Join(Environment.NewLine, Lines);
}

internal static class RapidOcrService
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(30);
    private static readonly JsonSerializerOptions RequestOptions = new()
    {
        Encoder = JavaScriptEncoder.Default
    };

    public static async Task<RapidOcrResult> RecognizeAsync(string imagePath, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!File.Exists(imagePath))
            return new RapidOcrResult(false, [], "OCR 输入图片不存在，请重新框选区域后重试。");

        var engineCandidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "ocr", "RapidOCR-json", "RapidOCR_json.exe"),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "ocr", "RapidOCR-json", "RapidOCR_json.exe")),
            Path.Combine(Path.GetDirectoryName(Environment.ProcessPath) ?? string.Empty, "ocr", "RapidOCR-json", "RapidOCR_json.exe")
        };
        var enginePath = engineCandidates
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault(File.Exists);
        if (enginePath is null)
        {
            return new RapidOcrResult(false, [], "未找到本地 OCR 引擎或模型。请重新构建包含 OCR 资源的预览版本。");
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(Timeout);
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = enginePath,
                WorkingDirectory = Path.GetDirectoryName(enginePath)!,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = System.Text.Encoding.UTF8,
                StandardErrorEncoding = System.Text.Encoding.UTF8
            }
        };
        process.StartInfo.ArgumentList.Add("--ensureAscii=1");
        process.StartInfo.ArgumentList.Add("--maxSideLen=2048");

        var errorLines = new ConcurrentQueue<string>();
        process.ErrorDataReceived += (_, args) =>
        {
            if (!string.IsNullOrWhiteSpace(args.Data))
            {
                errorLines.Enqueue(args.Data);
                while (errorLines.Count > 12) errorLines.TryDequeue(out var discarded);
            }
        };

        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!process.Start()) return new RapidOcrResult(false, [], "无法启动本地 OCR 引擎。");
            process.BeginErrorReadLine();

            var initialized = false;
            while (await process.StandardOutput.ReadLineAsync(timeout.Token) is { } line)
            {
                if (line.Contains("OCR init completed.", StringComparison.Ordinal))
                {
                    initialized = true;
                    break;
                }
            }
            if (!initialized)
                return new RapidOcrResult(false, [], FormatEngineError("OCR 引擎未能完成初始化。", errorLines));

            var request = JsonSerializer.Serialize(new { imagePath = Path.GetFullPath(imagePath) }, RequestOptions);
            await process.StandardInput.WriteLineAsync(request.AsMemory(), timeout.Token);
            await process.StandardInput.FlushAsync(timeout.Token);

            string? response = null;
            while (await process.StandardOutput.ReadLineAsync(timeout.Token) is { } line)
            {
                if (line.TrimStart().StartsWith('{'))
                {
                    response = line.Trim();
                    break;
                }
            }
            if (response is null)
                return new RapidOcrResult(false, [], FormatEngineError("OCR 引擎没有返回识别结果。", errorLines));

            return RapidOcrResponseParser.Parse(response);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            return new RapidOcrResult(false, [], "OCR 识别超时，请缩小区域后重试。");
        }
        catch (Exception ex)
        {
            return new RapidOcrResult(false, [], FormatEngineError($"OCR 识别失败：{ex.Message}", errorLines));
        }
        finally
        {
            try
            {
                if (!process.HasExited) process.Kill(entireProcessTree: true);
            }
            catch { }
        }
    }

    private static string FormatEngineError(string message, ConcurrentQueue<string> errorLines)
    {
        var detail = string.Join(Environment.NewLine, errorLines);
        return string.IsNullOrWhiteSpace(detail) ? message : $"{message}{Environment.NewLine}{detail}";
    }
}
