using System.Runtime.InteropServices;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.Graphics;
using WinRT.Interop;

namespace Zhuageping_WinUI;

internal sealed class RecordingControlWindow : IDisposable
{
    private const int ContentWidth = 288;
    private const int ContentHeight = 48;
    private const uint SwpNoSize = 0x0001;
    private const uint SwpNoMove = 0x0002;
    private const uint WdaExcludeFromCapture = 0x00000011;
    private const uint SwpShowWindow = 0x0040;
    private const uint SwpNoActivate = 0x0010;
    private const uint SwpHideWindow = 0x0080;
    private const int GwlExStyle = -20;
    private const long WsExTopmost = 0x00000008;
    private const uint WmNcLButtonDown = 0x00A1;
    private const nint HtCaption = 2;
    private static readonly nint HwndTopmost = new(-1);
    private readonly Window _window = new();
    private readonly TextBlock _elapsed = new()
    {
        Text = "00:00:00", Width = 76, FontSize = 14, FontFamily = new FontFamily("Consolas"),
        FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
        Foreground = OverlayChrome.Brush(OverlayChrome.Text),
        TextAlignment = TextAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center
    };
    private readonly TextBlock _targetLabel = new()
    {
        FontSize = 11,
        Foreground = OverlayChrome.Brush(OverlayChrome.Muted),
        VerticalAlignment = VerticalAlignment.Center,
        TextTrimming = TextTrimming.CharacterEllipsis
    };
    private readonly Border _stateDot = new()
    {
        Width = 6, Height = 6, CornerRadius = new CornerRadius(3),
        Background = OverlayChrome.Brush(OverlayChrome.Danger),
        VerticalAlignment = VerticalAlignment.Center
    };
    private readonly Button _pauseButton = new() { Width = 32, Height = 32, Padding = new Thickness(0) };
    private Button? _stopButton;
    private OverlayButtonStyle? _pauseStyle;
    private readonly Action _pauseOrResume;
    private readonly Action _stop;
    private uint _lastDpi;

    public nint Handle { get; }
    public bool CaptureExcluded { get; }
    public bool VisibleOnTop { get; }
    public bool ReadyForCapture => CaptureExcluded && VisibleOnTop;

    public RecordingControlWindow(Action pauseOrResume, Action stop, string recordingTarget, RectInt32? selectedRegion, RectInt32 workArea)
    {
        _pauseOrResume = pauseOrResume;
        _stop = stop;
        var targetDescription = selectedRegion is { } region
            ? $"{recordingTarget} · {region.Width} × {region.Height}"
            : recordingTarget;
        _targetLabel.Text = selectedRegion is { } selected
            ? $"{selected.Width} × {selected.Height}" : recordingTarget;
        ToolTipService.SetToolTip(_targetLabel, targetDescription);
        AutomationProperties.SetName(_targetLabel, targetDescription);
        _window.Title = "抓个屏录制控制";
        _window.Content = BuildContent();
        _window.Activate();
        Handle = WindowNative.GetWindowHandle(_window);
        ShowWindow(Handle, 0);
        if (_window.AppWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.SetBorderAndTitleBar(false, false);
            presenter.IsResizable = false;
            presenter.IsMaximizable = false;
            presenter.IsMinimizable = false;
        }
        _window.AppWindow.Move(new PointInt32(workArea.X, workArea.Y));
        var affinitySet = SetWindowDisplayAffinity(Handle, WdaExcludeFromCapture);
        CaptureExcluded = affinitySet && GetWindowDisplayAffinity(Handle, out var affinity) && affinity == WdaExcludeFromCapture;
        ResizeForDpi();
        var size = _window.AppWindow.Size;
        var bottomGap = (int)Math.Round(16 * _lastDpi / 96d);
        var x = workArea.X + Math.Max(0, (workArea.Width - size.Width) / 2);
        var y = workArea.Y + Math.Max(0, workArea.Height - size.Height - bottomGap);
        var positioned = SetWindowPos(Handle, HwndTopmost, x, y, 0, 0, SwpNoSize | SwpHideWindow | SwpNoActivate);
        VisibleOnTop = positioned && (GetWindowLongPtr(Handle, GwlExStyle).ToInt64() & WsExTopmost) != 0;
        if (_window.Content is FrameworkElement content)
        {
            content.Loaded += (_, _) => content.XamlRoot.Changed += (_, _) => ResizeForDpi();
        }
    }

    private void ResizeForDpi()
    {
        var dpi = GetDpiForWindow(Handle);
        if (dpi == 0 || dpi == _lastDpi) return;
        if (!GetWindowRect(Handle, out var windowRect) || !GetClientRect(Handle, out var clientRect))
            throw new InvalidOperationException("无法确定录制控制窗的可见区域。");
        _lastDpi = dpi;
        var outerWidth = (int)Math.Round(ContentWidth * dpi / 96d) + windowRect.Right - windowRect.Left - (clientRect.Right - clientRect.Left);
        var outerHeight = (int)Math.Round(ContentHeight * dpi / 96d) + windowRect.Bottom - windowRect.Top - (clientRect.Bottom - clientRect.Top);
        SetWindowPos(Handle, HwndTopmost, 0, 0, outerWidth, outerHeight, SwpNoMove | SwpNoActivate);
    }

    public void SetElapsed(TimeSpan elapsed) => _elapsed.Text =
        $"{(int)elapsed.TotalHours:00}:{elapsed.Minutes:00}:{elapsed.Seconds:00}";

    public void ShowDock() => SetWindowPos(
        Handle,
        HwndTopmost,
        0, 0, 0, 0,
        SwpNoMove | SwpNoSize | SwpShowWindow | SwpNoActivate);

    public void HideDock() => ShowWindow(Handle, 0);

    public void SetStarting()
    {
        SetStateDescription("正在启动");
        _elapsed.Text = "--:--:--";
        _stateDot.Background = OverlayChrome.Brush(OverlayChrome.Accent);
        _pauseButton.IsEnabled = false;
        if (_stopButton is not null) _stopButton.IsEnabled = true;
    }

    public void SetRecording()
    {
        _pauseButton.Content = OverlayChrome.Icon("\uE769");
        AutomationProperties.SetName(_pauseButton, "暂停");
        ToolTipService.SetToolTip(_pauseButton, "暂停录制");
        _pauseStyle!.Selected = false;
        SetStateDescription("录制中");
        SetElapsed(TimeSpan.Zero);
        _stateDot.Background = OverlayChrome.Brush(OverlayChrome.Danger);
        _pauseButton.IsEnabled = true;
        if (_stopButton is not null) _stopButton.IsEnabled = true;
        _elapsed.Opacity = 1;
    }

    public void SetPaused(bool paused)
    {
        _pauseButton.Content = OverlayChrome.Icon(paused ? "\uE768" : "\uE769");
        AutomationProperties.SetName(_pauseButton, paused ? "继续" : "暂停");
        ToolTipService.SetToolTip(_pauseButton, paused ? "继续录制" : "暂停录制");
        _pauseStyle!.Selected = paused;
        SetStateDescription(paused ? "已暂停" : "录制中");
        _stateDot.Background = OverlayChrome.Brush(paused ? ColorHelper.FromArgb(255, 255, 185, 85) : OverlayChrome.Danger);
        _elapsed.Opacity = paused ? 0.72 : 1;
    }

    public void SetStopping()
    {
        SetStateDescription("保存中");
        _stateDot.Background = OverlayChrome.Brush(OverlayChrome.Muted);
        SetBusy(true);
    }

    public void SetBusy(bool busy)
    {
        _pauseButton.IsEnabled = !busy;
        if (_stopButton is not null) _stopButton.IsEnabled = !busy;
    }

    private void SetStateDescription(string state)
    {
        AutomationProperties.SetName(_stateDot, state);
        ToolTipService.SetToolTip(_stateDot, state);
        AutomationProperties.SetName(_elapsed, $"{state}，录制时长");
        ToolTipService.SetToolTip(_elapsed, state);
    }

    private UIElement BuildContent()
    {
        var root = new Grid
        {
            Background = OverlayChrome.Brush(OverlayChrome.Surface),
            RequestedTheme = ElementTheme.Dark,
            Padding = new Thickness(6)
        };
        root.Children.Add(BuildRecordingPanel());
        var frame = new Border
        {
            Background = OverlayChrome.Brush(OverlayChrome.Surface),
            CornerRadius = new CornerRadius(8),
            BorderThickness = new Thickness(1),
            BorderBrush = OverlayChrome.Brush(OverlayChrome.Border),
            Child = root,
            Shadow = new ThemeShadow()
        };
        root.AddHandler(
            Microsoft.UI.Xaml.UIElement.PointerPressedEvent,
            new Microsoft.UI.Xaml.Input.PointerEventHandler(DragSurface_PointerPressed),
            true);
        return frame;
    }

    private Grid BuildRecordingPanel()
    {
        var root = new Grid { ColumnSpacing = 4, VerticalAlignment = VerticalAlignment.Center };
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        root.Children.Add(BuildGrip());
        Grid.SetColumn(_stateDot, 1);
        root.Children.Add(_stateDot);
        Grid.SetColumn(_targetLabel, 3);
        root.Children.Add(_targetLabel);
        var divider = OverlayChrome.Divider();
        Grid.SetColumn(divider, 4);
        root.Children.Add(divider);
        Grid.SetColumn(_elapsed, 2);
        root.Children.Add(_elapsed);
        _pauseButton.Content = OverlayChrome.Icon("\uE769");
        AutomationProperties.SetName(_pauseButton, "暂停");
        ToolTipService.SetToolTip(_pauseButton, "暂停录制");
        _pauseStyle = new OverlayButtonStyle(_pauseButton);
        _pauseButton.Click += (_, _) =>
        {
            SetBusy(true);
            _pauseOrResume();
        };
        Grid.SetColumn(_pauseButton, 5);
        root.Children.Add(_pauseButton);
        _stopButton = new Button
        {
            Content = OverlayChrome.Icon("\uE71A"),
            Width = 32,
            Height = 32,
            Padding = new Thickness(0)
        };
        AutomationProperties.SetName(_stopButton, "停止");
        ToolTipService.SetToolTip(_stopButton, "停止并保存录制");
        _ = new OverlayButtonStyle(_stopButton, OverlayButtonTone.Accent);
        _stopButton.Click += (_, _) =>
        {
            SetBusy(true);
            _stop();
        };
        Grid.SetColumn(_stopButton, 6);
        root.Children.Add(_stopButton);
        return root;
    }

    private static FontIcon BuildGrip()
    {
        var grip = OverlayChrome.Icon("\uE784", 16);
        grip.Width = 12;
        grip.Height = 32;
        grip.Foreground = OverlayChrome.Brush(OverlayChrome.Muted);
        AutomationProperties.SetName(grip, "拖动录屏控制条");
        ToolTipService.SetToolTip(grip, "拖动控制条");
        return grip;
    }

    private void DragSurface_PointerPressed(object sender, Microsoft.UI.Xaml.Input.PointerRoutedEventArgs e)
    {
        if (!e.GetCurrentPoint((UIElement)sender).Properties.IsLeftButtonPressed) return;
        if (IsInsideButton(e.OriginalSource as DependencyObject)) return;
        ReleaseCapture();
        SendMessage(Handle, WmNcLButtonDown, HtCaption, nint.Zero);
        e.Handled = true;
    }

    private static bool IsInsideButton(DependencyObject? source)
    {
        for (var current = source; current is not null; current = Microsoft.UI.Xaml.Media.VisualTreeHelper.GetParent(current))
            if (current is Button or ComboBox) return true;
        return false;
    }

    public void Dispose() => _window.Close();

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowRect(nint hwnd, out NativeRect rect);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetClientRect(nint hwnd, out NativeRect rect);

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(nint hwnd);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowDisplayAffinity(nint hwnd, uint affinity);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowDisplayAffinity(nint hwnd, out uint affinity);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(nint hwnd, nint insertAfter, int x, int y, int width, int height, uint flags);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShowWindow(nint hwnd, int command);

    [DllImport("user32.dll")]
    private static extern nint ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern nint SendMessage(nint hwnd, uint message, nint wParam, nint lParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindowVisible(nint hwnd);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern nint GetWindowLongPtr(nint hwnd, int index);
}
