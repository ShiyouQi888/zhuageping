using System.Text.Json;
using ScreenRecorderLib;

namespace ZhuagepingRecorderHost;

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
    bool ShowClickHighlight
);

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly ManualResetEventSlim ExitSignal = new(false);
    private static Recorder? recorder;
    private static RecorderHostConfig? config;
    private static int exitCode;

    public static int Main()
    {
        Console.InputEncoding = System.Text.Encoding.UTF8;
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        try
        {
            var initialLine = Console.ReadLine();
            if (string.IsNullOrWhiteSpace(initialLine))
            {
                Emit("error", new { message = "Missing recorder configuration." });
                return 2;
            }

            config = JsonSerializer.Deserialize<RecorderHostConfig>(initialLine, JsonOptions)
                ?? throw new InvalidOperationException("Invalid recorder configuration.");
            ValidateConfig(config);
            Directory.CreateDirectory(Path.GetDirectoryName(config.OutputPath)!);

            recorder = Recorder.CreateRecorder(CreateOptions(config));
            recorder.OnRecordingComplete += OnRecordingComplete;
            recorder.OnRecordingFailed += OnRecordingFailed;
            recorder.OnStatusChanged += OnStatusChanged;

            Emit("ready", new { processId = Environment.ProcessId });
            recorder.Record(config.OutputPath);
            _ = Task.Run(ReadCommands);
            ExitSignal.Wait();
            return exitCode;
        }
        catch (Exception exception)
        {
            Emit("error", new { message = exception.Message, detail = exception.ToString() });
            return 1;
        }
        finally
        {
            recorder?.Dispose();
            recorder = null;
        }
    }

    private static RecorderOptions CreateOptions(RecorderHostConfig value)
    {
        var source = string.IsNullOrWhiteSpace(value.DisplayName)
            ? DisplayRecordingSource.MainMonitor
            : new DisplayRecordingSource(value.DisplayName);
        source.IsVideoCaptureEnabled = true;
        source.RecorderApi = RecorderApi.DesktopDuplication;
        if (value.Width > 0 && value.Height > 0)
        {
            source.SourceRect = new ScreenRect(value.X, value.Y, value.Width, value.Height);
        }

        var audioSources = new List<AudioSourceBase>();
        if (value.CaptureSystemAudio) audioSources.Add(LoopbackAudioSource.Default);
        if (value.CaptureMicrophone) audioSources.Add(CaptureAudioSource.Default);

        return new RecorderOptions
        {
            SourceOptions = new SourceOptions
            {
                RecordingSources = new List<RecordingSourceBase> { source }
            },
            OutputOptions = new OutputOptions
            {
                RecorderMode = RecorderMode.Video
            },
            AudioOptions = new AudioOptions
            {
                AudioSources = audioSources,
                IsAudioEnabled = audioSources.Count > 0,
                Bitrate = AudioBitrate.bitrate_128kbps,
                Channels = AudioChannels.Stereo
            },
            VideoEncoderOptions = new VideoEncoderOptions
            {
                Bitrate = value.Bitrate,
                Framerate = value.Framerate,
                Quality = value.Quality,
                IsFixedFramerate = true,
                Encoder = new H264VideoEncoder
                {
                    BitrateMode = H264BitrateControlMode.Quality,
                    EncoderProfile = H264Profile.High
                },
                IsFragmentedMp4Enabled = true,
                IsHardwareEncodingEnabled = true,
                IsLowLatencyEnabled = false,
                IsThrottlingDisabled = false
            },
            MouseOptions = new MouseOptions
            {
                IsMousePointerEnabled = value.ShowCursor,
                IsMouseClicksDetected = value.ShowClickHighlight,
                MouseLeftClickDetectionColor = "#FFFF6A2A",
                MouseRightClickDetectionColor = "#FFFF6A2A",
                MouseClickDetectionRadius = 24,
                MouseClickDetectionDuration = 160,
                MouseClickDetectionMode = MouseDetectionMode.Polling
            },
            LogOptions = new LogOptions
            {
                IsLogEnabled = false,
                LogSeverityLevel = ScreenRecorderLib.LogLevel.Info
            }
        };
    }

    private static async Task ReadCommands()
    {
        while (!ExitSignal.IsSet)
        {
            var line = await Console.In.ReadLineAsync();
            if (line is null)
            {
                recorder?.Stop();
                return;
            }

            var command = line.Trim().ToLowerInvariant();
            switch (command)
            {
                case "pause":
                    recorder?.Pause();
                    break;
                case "resume":
                    recorder?.Resume();
                    break;
                case "stop":
                    recorder?.Stop();
                    break;
                case "cancel":
                    exitCode = 3;
                    recorder?.Stop();
                    break;
            }
        }
    }

    private static void OnRecordingComplete(object? sender, RecordingCompleteEventArgs eventArgs)
    {
        if (exitCode == 3)
        {
            TryDelete(eventArgs.FilePath);
            Emit("canceled", new { });
        }
        else
        {
            Emit("completed", new { filePath = eventArgs.FilePath });
        }
        ExitSignal.Set();
    }

    private static void OnRecordingFailed(object? sender, RecordingFailedEventArgs eventArgs)
    {
        exitCode = 1;
        Emit("error", new { message = eventArgs.Error });
        ExitSignal.Set();
    }

    private static void OnStatusChanged(object? sender, RecordingStatusEventArgs eventArgs)
    {
        Emit("status", new { status = eventArgs.Status.ToString() });
    }

    private static void ValidateConfig(RecorderHostConfig value)
    {
        if (string.IsNullOrWhiteSpace(value.OutputPath)) throw new ArgumentException("OutputPath is required.");
        if (!Path.IsPathFullyQualified(value.OutputPath)) throw new ArgumentException("OutputPath must be absolute.");
        if (value.Framerate is < 1 or > 120) throw new ArgumentOutOfRangeException(nameof(value.Framerate));
        if (value.Bitrate < 500_000) throw new ArgumentOutOfRangeException(nameof(value.Bitrate));
        if (value.Quality is < 1 or > 100) throw new ArgumentOutOfRangeException(nameof(value.Quality));
        if ((value.Width == 0) != (value.Height == 0)) throw new ArgumentException("Width and height must both be zero or positive.");
    }

    private static void TryDelete(string? filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath)) return;
        try
        {
            File.Delete(filePath);
        }
        catch
        {
            // Cancellation should still complete when Windows is releasing the output file.
        }
    }

    private static void Emit(string type, object payload)
    {
        var json = JsonSerializer.Serialize(new { type, payload }, JsonOptions);
        Console.WriteLine(json);
        Console.Out.Flush();
    }
}
