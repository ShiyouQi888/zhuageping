using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Windows.ApplicationModel.DataTransfer;
using Windows.Graphics;
using Windows.Graphics.Imaging;
using Windows.Storage;
using Windows.Storage.Streams;
using WinRT.Interop;

namespace Zhuageping_WinUI;

internal sealed class PinnedImageWindow
{
    private const int GwlStyle = -16;
    private const int GwlExStyle = -20;
    private const int WsOverlappedWindow = 0x00CF0000;
    private const int WsPopup = unchecked((int)0x80000000);
    private const int WsExToolWindow = 0x00000080;
    private const long WsExTransparent = 0x00000020;
    private const long WsExLayered = 0x00080000;
    private const uint SwpFrameChanged = 0x0020;
    private const uint SwpShowWindow = 0x0040;
    private static readonly List<PinnedImageWindow> OpenWindows = [];
    private static bool _pinsVisible = true;

    private readonly Window _window = new();
    private readonly string _imagePath;
    private readonly double _aspectRatio;
    private readonly int _naturalWidth;
    private readonly int _naturalHeight;
    private readonly Grid _root = new();
    private readonly Image _image;
    private readonly Border _toolbar;
    private Button? _lockButton;
    private Button? _copyButton;
    private Button? _closeButton;
    private OverlayButtonStyle? _lockStyle;
    private ToggleMenuFlyoutItem? _lockMenuItem;
    private ToggleMenuFlyoutItem? _clickThroughMenuItem;
    private readonly List<FrameworkElement> _expandedControls = [];
    private Button? _moreButton;
    private bool _locked;
    private bool _clickThrough;
    private bool _toolbarFlyoutOpen;
    private long _baseExStyle;
    private readonly Slider _opacity = new() { Minimum = 35, Maximum = 100, Value = 100, Width = 168, VerticalAlignment = VerticalAlignment.Center };
    private readonly TextBlock _opacityLabel = new() { Text = "100%", FontSize = 12, Foreground = OverlayChrome.Brush(OverlayChrome.Text), VerticalAlignment = VerticalAlignment.Center, MinWidth = 34 };

    private PinnedImageWindow(string imagePath, int imageWidth, int imageHeight)
    {
        _imagePath = imagePath;
        _naturalWidth = imageWidth;
        _naturalHeight = imageHeight;
        _aspectRatio = imageWidth / (double)imageHeight;
        _image = new Image
        {
            Source = new BitmapImage(new Uri(imagePath)),
            Stretch = Stretch.Uniform,
            Opacity = 1
        };
        _root.Background = new SolidColorBrush(Colors.Transparent);
        _root.RequestedTheme = ElementTheme.Dark;
        _root.Children.Add(new Border
        {
            Background = new SolidColorBrush(ColorHelper.FromArgb(255, 24, 28, 34)),
            BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 87, 157, 235)),
            BorderThickness = new Thickness(1),
            Child = _image
        });
        _toolbar = BuildToolbar();
        _root.Children.Add(_toolbar);
        _root.SizeChanged += (_, _) => UpdateToolbarLayout();
        _root.PointerEntered += (_, _) => _toolbar.Visibility = Visibility.Visible;
        _root.PointerExited += (_, _) =>
        {
            if (!_toolbarFlyoutOpen) _toolbar.Visibility = Visibility.Collapsed;
        };
        _root.PointerPressed += Root_PointerPressed;
        _root.PointerWheelChanged += Root_PointerWheelChanged;
        _root.KeyDown += Root_KeyDown;
        _opacity.ValueChanged += (_, args) =>
        {
            var value = Math.Round(args.NewValue);
            _opacityLabel.Text = $"{value:0}%";
            _image.Opacity = value / 100;
        };

        _window.Title = "抓个屏 · 贴图";
        _window.Content = _root;
        _window.Closed += (_, _) => OpenWindows.Remove(this);
    }

    public static async Task OpenAsync(string imagePath)
    {
        var file = await StorageFile.GetFileFromPathAsync(imagePath);
        using var stream = await file.OpenReadAsync();
        var decoder = await BitmapDecoder.CreateAsync(stream);
        var pin = new PinnedImageWindow(imagePath, (int)decoder.PixelWidth, (int)decoder.PixelHeight);
        pin.ShowNearCursor();
    }

    private Border BuildToolbar()
    {
        var controls = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 2, VerticalAlignment = VerticalAlignment.Center };
        var zoomOut = OverlayChrome.CompactIconButton("\uE71F", "缩小", () => Resize(0.88));
        var actualSize = OverlayChrome.CompactIconButton("\uE9A6", "恢复原始大小", ResetSize);
        var zoomIn = OverlayChrome.CompactIconButton("\uE721", "放大", () => Resize(1.14));
        var divider = OverlayChrome.Divider();
        _lockButton = new Button { Content = OverlayChrome.Icon("\uE785"), Width = OverlayChrome.CompactButtonSize, Height = OverlayChrome.CompactButtonSize };
        ToolTipService.SetToolTip(_lockButton, "锁定贴图");
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(_lockButton, "锁定贴图");
        _lockButton.Click += (_, _) => ToggleLock();
        _lockStyle = new OverlayButtonStyle(_lockButton);
        _expandedControls.AddRange([zoomOut, actualSize, zoomIn, divider, _lockButton]);
        foreach (var control in _expandedControls) controls.Children.Add(control);
        _copyButton = OverlayChrome.CompactIconButton("\uE8C8", "复制图片", () => _ = CopyImageAsync());
        controls.Children.Add(_copyButton);
        _moreButton = OverlayChrome.CompactIconButton("\uE712", "更多贴图操作", () => { });
        var menu = new MenuFlyout();
        KeepToolbarVisible(menu);
        menu.Items.Add(MenuItem("缩小", "\uE71F", () => Resize(0.88)));
        menu.Items.Add(MenuItem("放大", "\uE721", () => Resize(1.14)));
        menu.Items.Add(MenuItem("原始大小", "\uE9A6", ResetSize));
        menu.Items.Add(new MenuFlyoutSeparator());
        _lockMenuItem = new ToggleMenuFlyoutItem { Text = "锁定贴图", Icon = OverlayChrome.Icon("\uE785") };
        _lockMenuItem.Click += (_, _) => ToggleLock();
        _clickThroughMenuItem = new ToggleMenuFlyoutItem { Text = "鼠标穿透", Icon = OverlayChrome.Icon("\uE7B3") };
        _clickThroughMenuItem.Click += (_, _) => ToggleClickThrough();
        menu.Items.Add(_lockMenuItem);
        menu.Items.Add(_clickThroughMenuItem);
        var opacityContent = new StackPanel { Spacing = 8, Width = 168 };
        var opacityHeader = new Grid();
        opacityHeader.Children.Add(new TextBlock { Text = "透明度", FontSize = 12, Foreground = OverlayChrome.Brush(OverlayChrome.Muted) });
        _opacityLabel.HorizontalAlignment = HorizontalAlignment.Right;
        opacityHeader.Children.Add(_opacityLabel);
        opacityContent.Children.Add(opacityHeader);
        opacityContent.Children.Add(_opacity);
        var opacityFlyout = new Flyout { Content = opacityContent };
        KeepToolbarVisible(opacityFlyout);
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(_opacity, "贴图透明度");
        menu.Items.Add(MenuItem("透明度…", "\uE790", () => _window.DispatcherQueue.TryEnqueue(() => opacityFlyout.ShowAt(_moreButton))));
        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(MenuItem("复制图片", "\uE8C8", () => _ = CopyImageAsync()));
        menu.Items.Add(MenuItem("打开源文件", "\uE8A7", OpenSource));
        menu.Items.Add(MenuItem("关闭贴图", "\uE711", _window.Close));
        _moreButton.Flyout = menu;
        controls.Children.Add(_moreButton);
        _closeButton = OverlayChrome.CompactIconButton("\uE711", "关闭贴图", _window.Close, OverlayButtonTone.Danger);
        controls.Children.Add(_closeButton);
        return new Border
        {
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(4),
            Padding = new Thickness(4),
            Background = OverlayChrome.Brush(OverlayChrome.Surface),
            BorderBrush = OverlayChrome.Brush(OverlayChrome.Border),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Child = controls,
            Visibility = Visibility.Collapsed,
            Shadow = new ThemeShadow()
        };
    }

    private void UpdateToolbarLayout()
    {
        var expanded = _root.ActualWidth >= 296;
        foreach (var control in _expandedControls) control.Visibility = expanded ? Visibility.Visible : Visibility.Collapsed;
        if (_copyButton is not null) _copyButton.Visibility = _root.ActualWidth >= 116 ? Visibility.Visible : Visibility.Collapsed;
        if (_closeButton is not null) _closeButton.Visibility = _root.ActualWidth >= 84 ? Visibility.Visible : Visibility.Collapsed;
        _toolbar.Padding = _root.ActualHeight < 56 ? new Thickness(4, 0, 4, 0) : new Thickness(4);
        _toolbar.Margin = _root.ActualHeight < 56 ? new Thickness(2) : new Thickness(4);
    }

    private static MenuFlyoutItem MenuItem(string text, string glyph, Action action)
    {
        var item = new MenuFlyoutItem { Text = text, Icon = OverlayChrome.Icon(glyph) };
        item.Click += (_, _) => action();
        return item;
    }

    private void KeepToolbarVisible(Microsoft.UI.Xaml.Controls.Primitives.FlyoutBase flyout)
    {
        flyout.Opened += (_, _) =>
        {
            _toolbarFlyoutOpen = true;
            _toolbar.Visibility = Visibility.Visible;
        };
        flyout.Closed += (_, _) => _toolbarFlyoutOpen = false;
    }

    private void ShowNearCursor()
    {
        GetCursorPos(out var cursor);
        var displays = MonitorEnumerator.GetAll();
        var display = displays.OrderBy(item => DistanceToRect(cursor.X, cursor.Y, item.WorkArea)).FirstOrDefault();
        var workArea = display?.WorkArea ?? new RectInt32(0, 0, 1280, 720);
        var maxWidth = Math.Min(720, (int)(workArea.Width * 0.56));
        var maxHeight = Math.Min(520, (int)(workArea.Height * 0.56));
        var fit = Math.Min(1d, Math.Min(maxWidth / (double)_naturalWidth, maxHeight / (double)_naturalHeight));
        var width = Math.Max(120, (int)Math.Round(_naturalWidth * fit));
        var height = Math.Max(80, (int)Math.Round(_naturalHeight * fit));
        var offset = Math.Min(OpenWindows.Count * 26, 156);
        var x = Math.Clamp(cursor.X + 24 + offset, workArea.X, workArea.X + workArea.Width - width);
        var y = Math.Clamp(cursor.Y + 24 + offset, workArea.Y, workArea.Y + workArea.Height - height);

        _window.Activate();
        var hwnd = WindowNative.GetWindowHandle(_window);
        var style = GetWindowLongPtr(hwnd, GwlStyle).ToInt64();
        var exStyle = GetWindowLongPtr(hwnd, GwlExStyle).ToInt64();
        SetWindowLongPtr(hwnd, GwlStyle, new nint((style & ~WsOverlappedWindow) | WsPopup));
        SetWindowLongPtr(hwnd, GwlExStyle, new nint(exStyle | WsExToolWindow));
        _baseExStyle = exStyle | WsExToolWindow;
        SetWindowPos(hwnd, new nint(-1), x, y, width, height, SwpFrameChanged | SwpShowWindow);
        OpenWindows.Add(this);
        if (!_pinsVisible) _window.AppWindow.Hide();
    }

    public static bool ToggleAllVisibility()
    {
        _pinsVisible = !_pinsVisible;
        foreach (var pin in OpenWindows.ToArray())
        {
            if (_pinsVisible) pin._window.AppWindow.Show();
            else pin._window.AppWindow.Hide();
        }
        return _pinsVisible;
    }

    public static void SetAllClickThrough(bool enabled)
    {
        foreach (var pin in OpenWindows.ToArray()) pin.SetClickThrough(enabled);
    }

    private void Root_PointerPressed(object sender, PointerRoutedEventArgs e)
    {
        if (_locked) return;
        if (!e.GetCurrentPoint(_root).Properties.IsLeftButtonPressed || e.OriginalSource is FrameworkElement element && IsToolbarElement(element)) return;
        var hwnd = WindowNative.GetWindowHandle(_window);
        ReleaseCapture();
        SendMessage(hwnd, 0x00A1, new nint(2), 0);
        e.Handled = true;
    }

    private bool IsToolbarElement(FrameworkElement element)
    {
        DependencyObject? current = element;
        while (current is not null)
        {
            if (ReferenceEquals(current, _toolbar)) return true;
            current = VisualTreeHelper.GetParent(current);
        }
        return false;
    }

    private void Root_PointerWheelChanged(object sender, PointerRoutedEventArgs e)
    {
        if (!_locked) Resize(e.GetCurrentPoint(_root).Properties.MouseWheelDelta > 0 ? 1.08 : 0.92);
        e.Handled = true;
    }

    private void Root_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == Windows.System.VirtualKey.Escape) _window.Close();
        else if (e.Key == Windows.System.VirtualKey.Add) Resize(1.14);
        else if (e.Key == Windows.System.VirtualKey.Subtract) Resize(0.88);
        else if (e.Key == Windows.System.VirtualKey.Number0) ResetSize();
    }

    private void Resize(double factor)
    {
        if (_locked) return;
        var bounds = _window.AppWindow.Position;
        var size = _window.AppWindow.Size;
        var width = Math.Clamp((int)Math.Round(size.Width * factor), 120, 2400);
        var height = Math.Clamp((int)Math.Round(width / _aspectRatio), 80, 1800);
        width = Math.Min(width, (int)Math.Round(height * _aspectRatio));
        SetWindowPos(WindowNative.GetWindowHandle(_window), new nint(-1), bounds.X, bounds.Y, width, height, SwpShowWindow);
    }

    private void ResetSize()
    {
        if (_locked) return;
        var bounds = _window.AppWindow.Position;
        SetWindowPos(WindowNative.GetWindowHandle(_window), new nint(-1), bounds.X, bounds.Y, _naturalWidth, _naturalHeight, SwpShowWindow);
    }

    private void ToggleLock()
    {
        _locked = !_locked;
        if (_lockMenuItem is not null) _lockMenuItem.IsChecked = _locked;
        if (_lockStyle is not null) _lockStyle.Selected = _locked;
        UpdateToggleButton(_lockButton, _locked, "\uE72E", "\uE785", "锁定贴图", "解锁贴图");
    }

    private void ToggleClickThrough() => SetClickThrough(!_clickThrough);

    private void SetClickThrough(bool enabled)
    {
        if (_clickThrough == enabled) return;
        var hwnd = WindowNative.GetWindowHandle(_window);
        var updated = enabled ? _baseExStyle | WsExTransparent | WsExLayered : _baseExStyle;
        SetWindowLongPtr(hwnd, GwlExStyle, new nint(updated));
        if (enabled) SetLayeredWindowAttributes(hwnd, 0, 255, 0x00000002);
        var position = _window.AppWindow.Position;
        var size = _window.AppWindow.Size;
        SetWindowPos(hwnd, new nint(-1), position.X, position.Y, size.Width, size.Height, SwpFrameChanged | SwpShowWindow);
        _clickThrough = enabled;
        if (_clickThroughMenuItem is not null) _clickThroughMenuItem.IsChecked = enabled;
    }

    private static void UpdateToggleButton(Button? button, bool active, string activeGlyph, string inactiveGlyph, string inactiveName, string activeName)
    {
        if (button is null) return;
        var name = active ? activeName : inactiveName;
        button.Content = OverlayChrome.Icon(active ? activeGlyph : inactiveGlyph);
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(button, name);
        ToolTipService.SetToolTip(button, name);
    }

    private async Task CopyImageAsync()
    {
        var file = await StorageFile.GetFileFromPathAsync(_imagePath);
        var package = new DataPackage { RequestedOperation = DataPackageOperation.Copy };
        package.SetBitmap(RandomAccessStreamReference.CreateFromFile(file));
        Clipboard.SetContent(package);
    }

    private void OpenSource() => Process.Start(new ProcessStartInfo(_imagePath) { UseShellExecute = true });

    private static double DistanceToRect(int x, int y, RectInt32 rect)
    {
        var dx = Math.Max(Math.Max(rect.X - x, 0), x - (rect.X + rect.Width));
        var dy = Math.Max(Math.Max(rect.Y - y, 0), y - (rect.Y + rect.Height));
        return Math.Sqrt((double)dx * dx + (double)dy * dy);
    }

    [StructLayout(LayoutKind.Sequential)] private struct Point { public int X; public int Y; }
    [DllImport("user32.dll", SetLastError = true)] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)] private static extern nint GetWindowLongPtr(nint hwnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)] private static extern nint SetWindowLongPtr(nint hwnd, int index, nint value);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetLayeredWindowAttributes(nint hwnd, uint colorKey, byte alpha, uint flags);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(nint hwnd, nint insertAfter, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern nint SendMessage(nint hwnd, uint message, nint wParam, nint lParam);
}
