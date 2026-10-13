using System.Diagnostics;
using System.Text.Json;

namespace Zhuageping_WinUI;

internal sealed record RecorderHostConfig(
    string OutputPath,
    string? DisplayName,
    int X,
    int Y,
    int Width,
    int Height,
    int Framerate,
    int Bitrate,
    int Quality,
    bool CaptureSystemAudio,
    bool CaptureMicrophone,
    bool ShowCursor,
    bool ShowClickHighlight,
    string[] ExcludeWindowHandles);

internal sealed class RecorderHostSession : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly Process _process;
    private readonly StreamWriter _commands;
    private readonly TaskCompletionSource _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource<string> _completed = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly SemaphoreSlim _writeLock = new(1, 1);
    private readonly object _ackLock = new();
    private TaskCompletionSource? _commandAck;
    private string? _expectedCommand;
    private string _stderr = string.Empty;

    public event Action<string>? StatusChanged;
    public event Action<string>? Failed;
    public Task<string> Completion => _completed.Task;

    private RecorderHostSession(Process process)
    {
        _process = process;
        _commands = process.StandardInput;
        process.OutputDataReceived += Process_OutputDataReceived;
        process.ErrorDataReceived += (_, args) =>
        {
            if (!string.IsNullOrWhiteSpace(args.Data))
            {
                _stderr += args.Data + Environment.NewLine;
                if (_stderr.Length > 16384) _stderr = _stderr[^16384..];
            }
        };
        process.Exited += (_, _) => _ = ObserveExitAsync();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
    }

    private async Task ObserveExitAsync()
    {
        try
        {
            // Drain redirected output before deciding that a completed message is missing.
            await _process.WaitForExitAsync();
            if (_completed.Task.IsCompleted) return;
            var error = new InvalidOperationException($"RecorderHost exited with code {_process.ExitCode}. {_stderr}");
            _ready.TrySetException(error);
            _completed.TrySetException(error);
            lock (_ackLock) _commandAck?.TrySetException(error);
        }
        catch (ObjectDisposedException) { }
    }

    public static async Task<RecorderHostSession> StartAsync(string executablePath, RecorderHostConfig config, CancellationToken cancellationToken = default)
    {
        if (!File.Exists(executablePath)) throw new FileNotFoundException("RecorderHost 未找到。", executablePath);

        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = executablePath,
                WorkingDirectory = Path.GetDirectoryName(executablePath)!,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardInputEncoding = new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false),
                StandardOutputEncoding = new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false),
                StandardErrorEncoding = new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false)
            },
            EnableRaisingEvents = true
        };
        try
        {
            await Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!process.Start()) throw new InvalidOperationException("无法启动 RecorderHost。");
            });
        }
        catch
        {
            process.Dispose();
            throw;
        }

        var session = new RecorderHostSession(process);
        try
        {
            await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(config, JsonOptions));
            await process.StandardInput.FlushAsync(cancellationToken);
            await session._ready.Task.WaitAsync(TimeSpan.FromSeconds(30), cancellationToken);
            return session;
        }
        catch
        {
            await session.DisposeAsync();
            throw;
        }
    }

    public async Task PauseAsync() => await SendAsync("pause");
    public async Task ResumeAsync() => await SendAsync("resume");

    public async Task<string> StopAsync(CancellationToken cancellationToken = default)
    {
        await SendAsync("stop");
        try
        {
            return await _completed.Task.WaitAsync(TimeSpan.FromSeconds(90), cancellationToken);
        }
        catch (TimeoutException)
        {
            if (!_process.HasExited) _process.Kill(entireProcessTree: true);
            throw new TimeoutException("RecorderHost 在 90 秒内没有完成封装，已终止进程。" + _stderr);
        }
    }

    private async Task SendAsync(string command)
    {
        await _writeLock.WaitAsync();
        var acknowledgement = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_ackLock)
        {
            _expectedCommand = command;
            _commandAck = acknowledgement;
        }
        try
        {
            if (_process.HasExited) throw new InvalidOperationException("RecorderHost 已退出。" + _stderr);
            await _commands.WriteLineAsync(command);
            await _commands.FlushAsync();
            await acknowledgement.Task.WaitAsync(TimeSpan.FromSeconds(15));
        }
        catch
        {
            lock (_ackLock)
            {
                if (ReferenceEquals(_commandAck, acknowledgement))
                {
                    _commandAck = null;
                    _expectedCommand = null;
                }
            }
            throw;
        }
        finally
        {
            lock (_ackLock)
            {
                if (ReferenceEquals(_commandAck, acknowledgement))
                {
                    _commandAck = null;
                    _expectedCommand = null;
                }
            }
            _writeLock.Release();
        }
    }

    private void Process_OutputDataReceived(object sender, DataReceivedEventArgs args)
    {
        if (string.IsNullOrWhiteSpace(args.Data)) return;
        try
        {
            using var document = JsonDocument.Parse(args.Data);
            var root = document.RootElement;
            var type = root.GetProperty("type").GetString();
            var payload = root.TryGetProperty("payload", out var value) ? value : default;
            switch (type)
            {
                case "ready":
                    _ready.TrySetResult();
                    break;
                case "status":
                    if (payload.TryGetProperty("status", out var status)) StatusChanged?.Invoke(status.GetString() ?? "");
                    break;
                case "command":
                    if (payload.TryGetProperty("command", out var command))
                    {
                        lock (_ackLock)
                        {
                            if (command.GetString() == _expectedCommand) _commandAck?.TrySetResult();
                        }
                    }
                    break;
                case "completed":
                    if (payload.TryGetProperty("filePath", out var filePath)) _completed.TrySetResult(filePath.GetString() ?? "");
                    lock (_ackLock)
                    {
                        if (_expectedCommand == "stop") _commandAck?.TrySetResult();
                    }
                    break;
                case "error":
                    var message = payload.TryGetProperty("message", out var text) ? text.GetString() ?? "RecorderHost 发生未知错误。" : "RecorderHost 发生未知错误。";
                    var detail = payload.TryGetProperty("detail", out var details) ? details.GetString() : null;
                    var error = string.IsNullOrWhiteSpace(detail) ? message : $"{message}{Environment.NewLine}{detail}";
                    _ready.TrySetException(new InvalidOperationException(error));
                    _completed.TrySetException(new InvalidOperationException(error));
                    lock (_ackLock) _commandAck?.TrySetException(new InvalidOperationException(error));
                    Failed?.Invoke(error);
                    break;
                case "canceled":
                    _completed.TrySetException(new OperationCanceledException("录制已取消。"));
                    break;
            }
        }
        catch (Exception exception)
        {
            if (exception is not JsonException) Failed?.Invoke($"无法解析 RecorderHost 消息：{exception.Message}");
        }
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (!_process.HasExited)
            {
                _process.StandardInput.Close();
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                await _process.WaitForExitAsync(timeout.Token);
            }
        }
        catch
        {
            try { if (!_process.HasExited) _process.Kill(entireProcessTree: true); }
            catch { }
        }
        _process.Dispose();
        _writeLock.Dispose();
    }
}
