using System.Text.Json;
using Zhuageping_WinUI;

const string childFlag = "ZHUAGEPING_SESSION_SMOKE_CHILD";
if (Environment.GetEnvironmentVariable(childFlag) == "1")
{
    var line = await Console.In.ReadLineAsync();
    using var config = JsonDocument.Parse(line!);
    if (config.RootElement.GetProperty("quality").GetInt32() < 0) return 10;
    Console.WriteLine("{\"type\":\"ready\"}");
    while (await Console.In.ReadLineAsync() is { } command)
    {
        if (command == "stop")
        {
            Console.WriteLine("{\"type\":\"completed\",\"payload\":{\"filePath\":\"smoke.mp4\"}}");
            break;
        }
        Console.WriteLine(JsonSerializer.Serialize(new { type = "command", payload = new { command } }));
    }
    return 0;
}

var executable = Path.Combine(AppContext.BaseDirectory, "RecorderSession.Smoke.exe");
var configuration = new RecorderHostConfig("smoke.mp4", null, 0, 0, 640, 360, 30, 4000000, 80,
    false, false, true, false, []);
Environment.SetEnvironmentVariable(childFlag, "1");
try
{
    await using (var session = await RecorderHostSession.StartAsync(executable, configuration))
    {
        await session.PauseAsync();
        await session.ResumeAsync();
        if (await session.StopAsync() != "smoke.mp4") throw new InvalidOperationException("Completion path lost.");
    }
    Console.WriteLine("PASS: asynchronous process startup, ready handshake, pause/resume acknowledgements, stop/completion, disposal.");
    try
    {
        await using var failed = await RecorderHostSession.StartAsync(executable, configuration with { Quality = -1 });
        throw new Exception("Early host exit must fail startup.");
    }
    catch (InvalidOperationException ex) when (ex.Message.Contains("exited with code 10")) { }
    Console.WriteLine("PASS: early host exit fails startup without waiting for readiness timeout.");
    using var cancelled = new CancellationTokenSource();
    cancelled.Cancel();
    try
    {
        await using var session = await RecorderHostSession.StartAsync(executable, configuration, cancelled.Token);
        throw new Exception("Cancelled startup must fail.");
    }
    catch (OperationCanceledException) { }
    Console.WriteLine("PASS: cancelled startup releases the unstarted process.");
}
finally { Environment.SetEnvironmentVariable(childFlag, null); }
return 0;
