using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.UI.Xaml.Shapes;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.ApplicationModel.DataTransfer;
using Windows.Foundation;
using Windows.Graphics;
using Windows.Graphics.Imaging;
using Windows.Storage;
using Windows.Storage.Streams;
using Windows.System;
using WinRT.Interop;

namespace Zhuageping_WinUI;

internal enum RegionSelectionIntent
{
    Any,
    Window,
    Region
}

internal sealed record RecordingTargetSelection(RectInt32 Region, bool IsWindow);

internal sealed class RegionSelectionWindow
{
    private static readonly List<RegionSelectionWindow> OpenWindows = [];
    private const int GwlStyle = -16;
    private const int GwlExStyle = -20;
    private const int WsOverlappedWindow = 0x00CF0000;
    private const int WsPopup = unchecked((int)0x80000000);
    private const int WsExToolWindow = 0x00000080;
    private const uint GwHwndNext = 2;
    private const uint SwpFrameChanged = 0x0020;
    private const uint SwpShowWindow = 0x0040;
    private readonly Window _window = new();
    private RectInt32 _monitorBounds;
    private readonly Image _previewImage = new() { Stretch = Stretch.Fill };
    private Microsoft.UI.Dispatching.DispatcherQueueTimer? _monitorFollowTimer;
    private FrozenDisplayFrame? _currentDisplayFrame;
    private readonly Dictionary<FrozenDisplayFrame, WriteableBitmap> _displayPreviews = [];
    private readonly CancellationTokenSource _ocrLifetime = new();
    private readonly string? _outputPath;
    private readonly RectInt32? _initialRegion;
    private readonly bool _annotationMode;
    private readonly bool _requireExplicitConfirmation;
    private readonly int _minimumSelectionSize;
    private readonly string _frozenScreenshotPath;
    private readonly FrozenScreenshotPixels? _pixelSampler;
    private readonly RegionSelectionIntent _selectionIntent;
    private readonly Grid _captureBoard = new();
    private readonly Canvas _annotationCanvas = new();
    private readonly Canvas _surface = new() { Background = new SolidColorBrush(Colors.Transparent) };
    private readonly Canvas _overlayLayer = new();
    private readonly Rectangle _pickerColorChip = new() { Width = 14, Height = 14, Stroke = new SolidColorBrush(Colors.White), StrokeThickness = 1 };
    private readonly TextBlock _pickerValue = new() { FontSize = 13, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold, Foreground = OverlayChrome.Brush(OverlayChrome.Text) };
    private readonly TextBlock _pickerDetails = new() { FontSize = 11, Foreground = OverlayChrome.Brush(OverlayChrome.Muted) };
    private readonly Border _pickerPanel;
    private readonly Canvas _magnifierGrid = new();
    private readonly List<SolidColorBrush> _magnifierBrushes = [];
    private readonly Rectangle[] _shade = [new(), new(), new(), new()];
    private readonly Rectangle _selection = new()
    {
        Fill = new SolidColorBrush(Colors.Transparent),
        Stroke = new SolidColorBrush(ColorHelper.FromArgb(255, 255, 255, 255)),
        StrokeThickness = 2,
        Visibility = Visibility.Collapsed
    };
    private readonly Rectangle _annotationSelection = new()
    {
        Fill = new SolidColorBrush(Colors.Transparent),
        Stroke = new SolidColorBrush(ColorHelper.FromArgb(255, 92, 205, 255)),
        StrokeThickness = 1,
        Visibility = Visibility.Collapsed,
        IsHitTestVisible = false
    };
    private readonly Dictionary<ResizeHandle, Rectangle> _resizeHandles = [];
    private readonly Dictionary<AnnotationHandle, FrameworkElement> _annotationHandles = [];
    private readonly Line _annotationRotationStem = new()
    {
        Stroke = new SolidColorBrush(ColorHelper.FromArgb(255, 92, 205, 255)),
        StrokeThickness = 1,
        Visibility = Visibility.Collapsed,
        IsHitTestVisible = false
    };
    private readonly Button _finishButton = new() { Content = "完成", IsEnabled = false };
    private readonly TextBlock _instruction = new() { Text = "悬停识别窗口 · 单击选中 · 拖拽自定义区域 · Esc 取消", VerticalAlignment = VerticalAlignment.Center, Foreground = new SolidColorBrush(Colors.White) };
    private readonly Border _instructionToolbar;
    private readonly Border _annotationToolbar;
    private readonly TextBlock _toolbarStatus = new() { Foreground = OverlayChrome.Brush(OverlayChrome.Accent), FontSize = 12, Visibility = Visibility.Collapsed };
    private readonly StackPanel _toolbarGroups = new() { Orientation = Orientation.Horizontal, Spacing = 4, VerticalAlignment = VerticalAlignment.Center };
    private double _toolbarAvailableWidth;
    private readonly List<UIElement> _annotationHistory = [];
    private readonly List<Button> _toolButtons = [];
    private readonly List<OverlayButtonStyle> _toolStyles = [];
    private readonly List<Button> _colorButtons = [];
    private Button? _ocrButton;
    private Button? _pinButton;
    private readonly Button _annotationThickness = new() { Width = 76, Height = 32, Padding = new Thickness(8, 0, 8, 0) };
    private double _annotationStrokeWidth = 4;
    private readonly TaskCompletionSource<RectInt32?> _completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource<bool?> _annotationCompletion = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Point? _dragStart;
    private Point _dragEnd;
    private ResizeHandle? _activeResizeHandle;
    private RectInt32? _selectedRegion;
    private RectInt32? _hoverRegion;
    private bool _windowSelected;
    private Point? _pointerDownPoint;
    private bool _isAnnotating;
    private int _activeTool;
    private Windows.UI.Color _annotationColor = Colors.Red;
    private UIElement? _activeAnnotation;
    private Polyline? _activePath;
    private UIElement? _movingAnnotation;
    private CompositeTransform? _movingTransform;
    private UIElement? _selectedAnnotation;
    private AnnotationHandle? _activeAnnotationHandle;
    private Point _transformCenter;
    private double _transformStartAngle;
    private double _transformStartRotation;
    private double _transformStartDistance;
    private double _transformStartScale;
    private Point _moveStart;
    private double _moveOriginX;
    private double _moveOriginY;
    private TextBox? _inlineTextEditor;
    private Point _annotationStart;
    private readonly Windows.UI.Color[] _palette = [Colors.Red, Colors.DodgerBlue, Colors.LimeGreen, Colors.Yellow, Colors.White];
    private bool _isPickingColor;
    private bool _shiftHeld;
    private bool _showHex = true;
    private int _previousTool;
    private Windows.UI.Color _sampledColor = Colors.White;

    private enum ResizeHandle
    {
        TopLeft,
        Top,
        TopRight,
        Right,
        BottomRight,
        Bottom,
        BottomLeft,
        Left
    }

    private enum AnnotationHandle
    {
        TopLeft,
        TopRight,
        BottomRight,
        BottomLeft,
        Rotation
    }

    private RegionSelectionWindow(string frozenScreenshotPath, RectInt32 monitorBounds, string? outputPath = null, RectInt32? initialRegion = null, FrozenScreenshotPixels? pixelSampler = null, RegionSelectionIntent selectionIntent = RegionSelectionIntent.Any, bool requireExplicitConfirmation = false, int minimumSelectionSize = 4, ImageSource? previewSource = null)
    {
        _monitorBounds = monitorBounds;
        _outputPath = outputPath;
        _initialRegion = initialRegion;
        _annotationMode = outputPath is not null;
        _requireExplicitConfirmation = requireExplicitConfirmation;
        _minimumSelectionSize = Math.Max(4, minimumSelectionSize);
        _frozenScreenshotPath = frozenScreenshotPath;
        _pixelSampler = pixelSampler;
        _selectionIntent = selectionIntent;
        _instruction.Text = selectionIntent switch
        {
            RegionSelectionIntent.Window when requireExplicitConfirmation => "悬停识别窗口 · 单击选中 · 点击确定开始录制 · Esc 取消",
            RegionSelectionIntent.Region when requireExplicitConfirmation => "拖拽框选录制区域 · 点击确定开始录制 · Esc 取消",
            RegionSelectionIntent.Window => "悬停识别窗口 · 单击选中 · Esc 取消",
            RegionSelectionIntent.Region => "按住鼠标拖出录制区域 · 松开立即开始录制 · Esc 取消",
            _ => "悬停识别窗口 · 单击选中 · 拖拽自定义区域 · Esc 取消"
        };
        _finishButton.Content = requireExplicitConfirmation ? "确定" : "完成";
        _window.Title = "区域截图";
        var root = new Grid { Background = new SolidColorBrush(Colors.Black), IsTabStop = true, RequestedTheme = ElementTheme.Dark };
        _previewImage.Source = previewSource ?? new BitmapImage(new Uri(frozenScreenshotPath));
        _captureBoard.Children.Add(_previewImage);
        _captureBoard.Children.Add(_annotationCanvas);
        root.Children.Add(_captureBoard);

        for (var index = 0; index < _shade.Length; index++)
        {
            _shade[index].Fill = new SolidColorBrush(ColorHelper.FromArgb(112, 0, 0, 0));
            _shade[index].IsHitTestVisible = false;
            _surface.Children.Add(_shade[index]);
        }
        _selection.IsHitTestVisible = false;
        _surface.Children.Add(_selection);
        foreach (var handle in Enum.GetValues<ResizeHandle>())
        {
            var resizeHandle = new Rectangle
            {
                Width = 10,
                Height = 10,
                Fill = OverlayChrome.Brush(OverlayChrome.Text),
                Stroke = OverlayChrome.Brush(OverlayChrome.Accent),
                StrokeThickness = 2,
                RadiusX = 2,
                RadiusY = 2,
                IsHitTestVisible = false,
                Visibility = Visibility.Collapsed
            };
            _resizeHandles[handle] = resizeHandle;
            _surface.Children.Add(resizeHandle);
        }
        _surface.Children.Add(_annotationSelection);
        _surface.Children.Add(_annotationRotationStem);
        foreach (var handle in Enum.GetValues<AnnotationHandle>())
        {
            Shape annotationHandle = handle == AnnotationHandle.Rotation
                ? new Ellipse { Width = 10, Height = 10 }
                : new Rectangle { Width = 8, Height = 8, RadiusX = 2, RadiusY = 2 };
            annotationHandle.Fill = OverlayChrome.Brush(OverlayChrome.Text);
            annotationHandle.Stroke = new SolidColorBrush(ColorHelper.FromArgb(255, 92, 205, 255));
            annotationHandle.IsHitTestVisible = false;
            annotationHandle.Visibility = Visibility.Collapsed;
            _annotationHandles[handle] = annotationHandle;
            _surface.Children.Add(annotationHandle);
        }
        _surface.PointerPressed += Surface_PointerPressed;
        _surface.PointerMoved += Surface_PointerMoved;
        _surface.PointerReleased += Surface_PointerReleased;
        _surface.SizeChanged += (_, _) =>
        {
            UpdateSelectionVisual();
            if (_isAnnotating) PositionAnnotationToolbar();
        };
        root.Children.Add(_surface);

        _finishButton.Click += (_, _) => CompleteSelection();
        var cancelButton = new Button { Content = "取消" };
        cancelButton.Click += (_, _) => CancelSelection();
        _instructionToolbar = new Border
        {
            Background = new SolidColorBrush(ColorHelper.FromArgb(245, 28, 32, 38)),
            BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 105, 115, 128)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(12, 8, 12, 8),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(0, 24, 0, 0),
            Child = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 10,
                Children =
                {
                    _instruction,
                    _finishButton,
                    cancelButton
                }
            }
        };
        _finishButton.Visibility = _annotationMode || _requireExplicitConfirmation
            ? Visibility.Visible
            : Visibility.Collapsed;
        root.Children.Add(_instructionToolbar);
        _annotationToolbar = _annotationMode ? BuildAnnotationToolbar() : new Border();
        _annotationToolbar.Visibility = Visibility.Collapsed;
        _pickerPanel = _annotationMode ? BuildPickerPanel() : new Border();
        _pickerPanel.Visibility = Visibility.Collapsed;
        _overlayLayer.Children.Add(_annotationToolbar);
        _overlayLayer.Children.Add(_pickerPanel);
        root.Children.Add(_overlayLayer);
        root.KeyDown += Root_KeyDown;
        root.KeyUp += Root_KeyUp;
        root.Loaded += (_, _) =>
        {
            root.Focus(FocusState.Programmatic);
            if (!_annotationMode && _selectionIntent != RegionSelectionIntent.Region && GetCursorPos(out var cursor))
            {
                var localPoint = new Point(cursor.X - _monitorBounds.X, cursor.Y - _monitorBounds.Y);
                UpdateWindowHover(PhysicalToSurface(localPoint));
            }
            if (_initialRegion is not null)
            {
                _selectedRegion = _initialRegion;
                _dragStart = PhysicalToSurface(new Point(_initialRegion.Value.X, _initialRegion.Value.Y));
                _dragEnd = PhysicalToSurface(new Point(_initialRegion.Value.X + _initialRegion.Value.Width, _initialRegion.Value.Y + _initialRegion.Value.Height));
                EnterAnnotationMode();
            }
        };
        _window.Content = root;
        _window.Closed += (_, _) =>
        {
            OpenWindows.Remove(this);
            _ocrLifetime.Cancel();
            _displayPreviews.Clear();
            _monitorFollowTimer?.Stop();
            _monitorFollowTimer = null;
            _completion.TrySetResult(null);
            _annotationCompletion.TrySetResult(null);
        };
        OpenWindows.Add(this);
    }

    public static void CloseAll()
    {
        foreach (var selection in OpenWindows.ToArray()) selection._window.Close();
    }

    public static async Task<DesktopSelection?> SelectAcrossDisplaysAsync(
        IReadOnlyList<MonitorDisplay> displays, MonitorDisplay initialDisplay, bool forRecording,
        RegionSelectionIntent selectionIntent = RegionSelectionIntent.Any)
    {
        // Freeze all monitors before showing any overlay, so switching cannot capture our own UI.
        var frames = await Task.Run(() => displays.Select(display =>
            new FrozenDisplayFrame(display, NativeScreenshotCapture.CaptureDisplayPixels(display.OuterBounds))).ToArray());
        var initialFrame = frames.First(frame => frame.Display.DeviceName == initialDisplay.DeviceName);
        var selector = new RegionSelectionWindow(string.Empty, initialDisplay.OuterBounds,
            selectionIntent: selectionIntent, minimumSelectionSize: forRecording ? 16 : 4,
            previewSource: CreatePreview(initialFrame));
        selector._currentDisplayFrame = initialFrame;
        selector._displayPreviews.Add(initialFrame, (WriteableBitmap)selector._previewImage.Source);
        selector.Show();
        var timer = selector._window.DispatcherQueue.CreateTimer();
        selector._monitorFollowTimer = timer;
        timer.Interval = TimeSpan.FromMilliseconds(40);
        timer.Tick += (_, _) => selector.FollowCursorDisplay(frames, displays);
        timer.Start();
        var region = await selector._completion.Task;
        timer.Stop();
        GC.KeepAlive(selector);
        return region is { } selected && selector._currentDisplayFrame is { } frame
            ? new DesktopSelection(frame, selected, selector._windowSelected)
            : null;
    }

    private static WriteableBitmap CreatePreview(FrozenDisplayFrame frame)
    {
        var bounds = frame.Display.OuterBounds;
        var preview = new WriteableBitmap(bounds.Width, bounds.Height);
        using (var stream = preview.PixelBuffer.AsStream()) stream.Write(frame.Pixels);
        preview.Invalidate();
        return preview;
    }

    private void FollowCursorDisplay(IReadOnlyList<FrozenDisplayFrame> frames, IReadOnlyList<MonitorDisplay> displays)
    {
        if (_completion.Task.IsCompleted || _pointerDownPoint is not null || _isAnnotating ||
            !GetCursorPos(out var cursor)) return;
        var index = DesktopSelectionMapping.FindDisplay(displays, cursor.X, cursor.Y);
        if (index < 0) return;
        var frame = frames[index];
        if (!ReferenceEquals(frame, _currentDisplayFrame))
        {
            _currentDisplayFrame = frame;
            _monitorBounds = frame.Display.OuterBounds;
            if (!_displayPreviews.TryGetValue(frame, out var preview))
            {
                preview = CreatePreview(frame);
                _displayPreviews.Add(frame, preview);
            }
            _previewImage.Source = preview;
            _hoverRegion = null;
            _selectedRegion = null;
            _dragStart = null;
            _dragEnd = default;
            _windowSelected = false;
            _finishButton.IsEnabled = false;
            _window.AppWindow.MoveAndResize(_monitorBounds);
            var hwnd = WindowNative.GetWindowHandle(_window);
            SetWindowPos(hwnd, new nint(-1), _monitorBounds.X, _monitorBounds.Y,
                _monitorBounds.Width, _monitorBounds.Height, SwpShowWindow | 0x0010);
            UpdateSelectionVisual();
        }
        UpdateWindowHover(PhysicalToSurface(new Point(cursor.X - _monitorBounds.X, cursor.Y - _monitorBounds.Y)));
    }

    public static async Task<RectInt32?> SelectAsync(string frozenScreenshotPath, RectInt32 monitorBounds, RegionSelectionIntent selectionIntent = RegionSelectionIntent.Any, bool requireExplicitConfirmation = false)
    {
        var selector = new RegionSelectionWindow(frozenScreenshotPath, monitorBounds, selectionIntent: selectionIntent, requireExplicitConfirmation: requireExplicitConfirmation);
        selector.Show();
        var result = await selector._completion.Task;
        GC.KeepAlive(selector);
        return result;
    }

    public static async Task<RecordingTargetSelection?> SelectRecordingTargetAsync(byte[] pixels, RectInt32 monitorBounds, RegionSelectionIntent selectionIntent = RegionSelectionIntent.Any)
    {
        var preview = new WriteableBitmap(monitorBounds.Width, monitorBounds.Height);
        using (var stream = preview.PixelBuffer.AsStream())
            await stream.WriteAsync(pixels);
        preview.Invalidate();
        var selector = new RegionSelectionWindow(
            string.Empty,
            monitorBounds,
            selectionIntent: selectionIntent,
            requireExplicitConfirmation: false,
            minimumSelectionSize: 16,
            previewSource: preview);
        selector.Show();
        var region = await selector._completion.Task;
        GC.KeepAlive(selector);
        return region is { } selected
            ? new RecordingTargetSelection(selected, selector._windowSelected)
            : null;
    }

    public static async Task<bool?> AnnotateAsync(string frozenScreenshotPath, RectInt32 monitorBounds, string outputPath, RectInt32? initialRegion)
    {
        var sampler = await FrozenScreenshotPixels.LoadAsync(frozenScreenshotPath);
        var editor = new RegionSelectionWindow(frozenScreenshotPath, monitorBounds, outputPath, initialRegion, sampler);
        editor.Show();
        var result = await editor._annotationCompletion.Task;
        GC.KeepAlive(editor);
        return result;
    }

    public static async Task<bool?> AnnotateAsync(FrozenDisplayFrame frame, string outputPath, RectInt32 initialRegion)
    {
        var bounds = frame.Display.OuterBounds;
        var sampler = new FrozenScreenshotPixels(bounds.Width, bounds.Height, frame.Pixels);
        var editor = new RegionSelectionWindow(string.Empty, bounds, outputPath, initialRegion, sampler,
            previewSource: CreatePreview(frame));
        editor.Show();
        var result = await editor._annotationCompletion.Task;
        GC.KeepAlive(editor);
        return result;
    }

    private void SaveFrozenRegion(string path, RectInt32 region)
    {
        if (_pixelSampler is not null) _pixelSampler.SaveRegion(path, region);
        else NativeScreenshotCapture.CropPng(_frozenScreenshotPath, path, region);
    }

    private void Show()
    {
        _window.Activate();
        _window.AppWindow.MoveAndResize(_monitorBounds);
        var hwnd = WindowNative.GetWindowHandle(_window);
        var style = GetWindowLongPtr(hwnd, GwlStyle).ToInt64();
        SetWindowLongPtr(hwnd, GwlStyle, new nint((style & ~WsOverlappedWindow) | WsPopup));
        SetWindowPos(hwnd, new nint(-1), _monitorBounds.X, _monitorBounds.Y, _monitorBounds.Width, _monitorBounds.Height, SwpFrameChanged | SwpShowWindow);
        if (_window.Content is FrameworkElement root) root.Focus(FocusState.Programmatic);
    }

    private void Surface_PointerPressed(object sender, PointerRoutedEventArgs e)
    {
        var point = e.GetCurrentPoint(_surface);
        if (point.Properties.IsRightButtonPressed)
        {
            CancelSelection();
            e.Handled = true;
            return;
        }
        if (!point.Properties.IsLeftButtonPressed) return;
        if (_isAnnotating)
        {
            if (TryGetResizeHandle(point.Position, out var resizeHandle))
            {
                _activeResizeHandle = resizeHandle;
                _surface.CapturePointer(e.Pointer);
                _toolbarStatus.Text = "拖动控制点调整截图区域";
                _toolbarStatus.Visibility = Visibility.Visible;
                PositionAnnotationToolbar();
                e.Handled = true;
                return;
            }
            var position = ClampToSelection(point.Position);
            if (_isPickingColor)
            {
                UpdateColorSample(position);
                SelectAnnotationColor(_sampledColor);
                SelectAnnotationTool(_previousTool);
            }
            else if (TryBeginAnnotationTransform(position, e.Pointer))
            {
                // Corner handles scale uniformly; the top handle rotates the annotation.
            }
            else if (TryBeginMoveAnnotation(position, e.Pointer))
            {
                // Existing annotations are directly draggable from the canvas.
            }
            else
            {
                HideAnnotationSelection();
                BeginAnnotation(position, e);
            }
            e.Handled = true;
            return;
        }
        if (_selectionIntent != RegionSelectionIntent.Region &&
            _hoverRegion is { Width: >= 4, Height: >= 4 } hoverRegion)
        {
            _selectedRegion = hoverRegion;
            _dragStart = PhysicalToSurface(new Point(hoverRegion.X, hoverRegion.Y));
            _dragEnd = PhysicalToSurface(new Point(hoverRegion.X + hoverRegion.Width, hoverRegion.Y + hoverRegion.Height));
            _windowSelected = true;
            _pointerDownPoint = point.Position;
            _selection.Stroke = new SolidColorBrush(Colors.White);
            _finishButton.IsEnabled = true;
            _instruction.Text = "松开鼠标选择窗口 · 拖拽创建矩形 · Esc 取消";
            _surface.CapturePointer(e.Pointer);
            UpdateSelectionVisual();
            e.Handled = true;
            return;
        }

        if (_selectionIntent == RegionSelectionIntent.Window)
        {
            e.Handled = true;
            return;
        }

        _windowSelected = false;
        _pointerDownPoint = point.Position;
        _hoverRegion = null;
        _selection.Stroke = new SolidColorBrush(Colors.White);
        _dragStart = ClampPoint(point.Position);
        _dragEnd = _dragStart.Value;
        _selectedRegion = null;
        _finishButton.IsEnabled = false;
        _surface.CapturePointer(e.Pointer);
        UpdateSelectionVisual();
        e.Handled = true;
    }

    private void Surface_PointerMoved(object sender, PointerRoutedEventArgs e)
    {
        if (_activeResizeHandle is not null)
        {
            ResizeSelection(e.GetCurrentPoint(_surface).Position);
            e.Handled = true;
            return;
        }
        if (_activeAnnotationHandle is not null)
        {
            UpdateAnnotationTransform(e.GetCurrentPoint(_surface).Position);
            e.Handled = true;
            return;
        }
        if (_movingAnnotation is not null)
        {
            MoveAnnotation(e.GetCurrentPoint(_surface).Position);
            e.Handled = true;
            return;
        }
        if (_isAnnotating)
        {
            var position = ClampToSelection(e.GetCurrentPoint(_surface).Position);
            if (_isPickingColor) UpdateColorSample(position);
            if (_activeAnnotation is not null) UpdateAnnotation(position);
            return;
        }
        var surfacePoint = e.GetCurrentPoint(_surface).Position;
        if (_windowSelected)
        {
            if (_pointerDownPoint is null) return;
            var deltaX = surfacePoint.X - _pointerDownPoint.Value.X;
            var deltaY = surfacePoint.Y - _pointerDownPoint.Value.Y;
            if (Math.Sqrt(deltaX * deltaX + deltaY * deltaY) < 6) return;

            _windowSelected = false;
            _selectedRegion = null;
            _finishButton.IsEnabled = false;
            _instruction.Text = "拖拽框选区域 · 松开鼠标完成 · Esc 取消";
            _dragStart = ClampPoint(_pointerDownPoint.Value);
            _dragEnd = ClampPoint(surfacePoint);
            UpdateSelectionVisual();
            return;
        }
        if (_dragStart is null)
        {
            UpdateWindowHover(surfacePoint);
            return;
        }
        _dragEnd = ClampPoint(surfacePoint);
        UpdateSelectionVisual();
    }

    private void Surface_PointerReleased(object sender, PointerRoutedEventArgs e)
    {
        if (_activeResizeHandle is not null)
        {
            ResizeSelection(e.GetCurrentPoint(_surface).Position);
            _surface.ReleasePointerCapture(e.Pointer);
            _activeResizeHandle = null;
            _toolbarStatus.Text = "截图区域已更新 · 点击重新识别";
            PositionAnnotationToolbar();
            e.Handled = true;
            return;
        }
        if (_activeAnnotationHandle is not null)
        {
            UpdateAnnotationTransform(e.GetCurrentPoint(_surface).Position);
            _surface.ReleasePointerCapture(e.Pointer);
            _activeAnnotationHandle = null;
            _movingAnnotation = null;
            _movingTransform = null;
            ShowAnnotationSelection(_selectedAnnotation);
            e.Handled = true;
            return;
        }
        if (_movingAnnotation is not null)
        {
            MoveAnnotation(e.GetCurrentPoint(_surface).Position);
            _surface.ReleasePointerCapture(e.Pointer);
            _movingAnnotation = null;
            _movingTransform = null;
            ShowAnnotationSelection(_selectedAnnotation);
            PositionAnnotationToolbar();
            e.Handled = true;
            return;
        }
        if (_isAnnotating)
        {
            if (_activeAnnotation is null) return;
            UpdateAnnotation(ClampToSelection(e.GetCurrentPoint(_surface).Position));
            _surface.ReleasePointerCapture(e.Pointer);
            var completedAnnotation = _activeAnnotation;
            _annotationHistory.Add(completedAnnotation);
            _activeAnnotation = null;
            _activePath = null;
            ShowAnnotationSelection(completedAnnotation);
            return;
        }
        if (_windowSelected)
        {
            var releasePoint = ClampPoint(e.GetCurrentPoint(_surface).Position);
            var dragStart = _pointerDownPoint;
            if (dragStart is { } startPoint &&
                Math.Sqrt(Math.Pow(releasePoint.X - startPoint.X, 2) + Math.Pow(releasePoint.Y - startPoint.Y, 2)) >= 6)
            {
                _windowSelected = false;
                _dragStart = ClampPoint(startPoint);
                _dragEnd = releasePoint;
                _selectedRegion = ToPhysicalRect(_dragStart.Value, _dragEnd);
                _finishButton.IsEnabled = _selectedRegion.Value.Width >= _minimumSelectionSize &&
                    _selectedRegion.Value.Height >= _minimumSelectionSize;
                _pointerDownPoint = null;
                _surface.ReleasePointerCapture(e.Pointer);
                UpdateSelectionVisual();
                if (_finishButton.IsEnabled && !_annotationMode && !_requireExplicitConfirmation)
                    CompleteSelection();
                e.Handled = true;
                return;
            }
            _surface.ReleasePointerCapture(e.Pointer);
            _pointerDownPoint = null;
            if (!_annotationMode && !_requireExplicitConfirmation) CompleteSelection();
            e.Handled = true;
            return;
        }
        if (_dragStart is null) return;
        _dragEnd = ClampPoint(e.GetCurrentPoint(_surface).Position);
        _surface.ReleasePointerCapture(e.Pointer);
        _pointerDownPoint = null;
        _selectedRegion = ToPhysicalRect(_dragStart.Value, _dragEnd);
        _finishButton.IsEnabled = _selectedRegion.Value.Width >= _minimumSelectionSize &&
            _selectedRegion.Value.Height >= _minimumSelectionSize;
        UpdateSelectionVisual();
        if (!_annotationMode && _finishButton.IsEnabled && !_requireExplicitConfirmation)
        {
            CompleteSelection();
            e.Handled = true;
            return;
        }
        if (_annotationMode && _finishButton.IsEnabled) EnterAnnotationMode();
        e.Handled = true;
    }

    private void UpdateSelectionVisual()
    {
        if (_surface.ActualWidth <= 0 || _surface.ActualHeight <= 0) return;
        if (_dragStart is null)
        {
            if (_hoverRegion is { Width: >= 4, Height: >= 4 } hoverRegion)
            {
                var hoverStart = PhysicalToSurface(new Point(hoverRegion.X, hoverRegion.Y));
                var hoverEnd = PhysicalToSurface(new Point(hoverRegion.X + hoverRegion.Width, hoverRegion.Y + hoverRegion.Height));
                var hoverLeft = Math.Min(hoverStart.X, hoverEnd.X);
                var hoverTop = Math.Min(hoverStart.Y, hoverEnd.Y);
                var hoverRight = Math.Max(hoverStart.X, hoverEnd.X);
                var hoverBottom = Math.Max(hoverStart.Y, hoverEnd.Y);
                SetRect(_shade[0], 0, 0, _surface.ActualWidth, hoverTop);
                SetRect(_shade[1], 0, hoverTop, hoverLeft, hoverBottom - hoverTop);
                SetRect(_shade[2], hoverRight, hoverTop, _surface.ActualWidth - hoverRight, hoverBottom - hoverTop);
                SetRect(_shade[3], 0, hoverBottom, _surface.ActualWidth, _surface.ActualHeight - hoverBottom);
                _selection.Stroke = new SolidColorBrush(ColorHelper.FromArgb(255, 30, 145, 255));
                _selection.Visibility = Visibility.Visible;
                SetRect(_selection, hoverLeft, hoverTop, hoverRight - hoverLeft, hoverBottom - hoverTop);
            HideResizeHandles();
                return;
            }

            SetRect(_shade[0], 0, 0, _surface.ActualWidth, _surface.ActualHeight);
            SetRect(_shade[1], 0, 0, 0, 0);
            SetRect(_shade[2], 0, 0, 0, 0);
            SetRect(_shade[3], 0, 0, 0, 0);
            _selection.Visibility = Visibility.Collapsed;
            HideResizeHandles();
            return;
        }

        var left = Math.Min(_dragStart.Value.X, _dragEnd.X);
        var top = Math.Min(_dragStart.Value.Y, _dragEnd.Y);
        var right = Math.Max(_dragStart.Value.X, _dragEnd.X);
        var bottom = Math.Max(_dragStart.Value.Y, _dragEnd.Y);
        SetRect(_shade[0], 0, 0, _surface.ActualWidth, top);
        SetRect(_shade[1], 0, top, left, bottom - top);
        SetRect(_shade[2], right, top, _surface.ActualWidth - right, bottom - top);
        SetRect(_shade[3], 0, bottom, _surface.ActualWidth, _surface.ActualHeight - bottom);
        _selection.Visibility = Visibility.Visible;
        SetRect(_selection, left, top, right - left, bottom - top);
        UpdateResizeHandles(left, top, right, bottom);
    }

    private bool TryGetResizeHandle(Point point, out ResizeHandle handle)
    {
        handle = default;
        if (!_isAnnotating || _dragStart is null) return false;
        var left = Math.Min(_dragStart.Value.X, _dragEnd.X);
        var top = Math.Min(_dragStart.Value.Y, _dragEnd.Y);
        var right = Math.Max(_dragStart.Value.X, _dragEnd.X);
        var bottom = Math.Max(_dragStart.Value.Y, _dragEnd.Y);
        var hitRadius = 13d;
        var candidates = new (ResizeHandle Handle, Point Position)[]
        {
            (ResizeHandle.TopLeft, new Point(left, top)),
            (ResizeHandle.Top, new Point((left + right) / 2, top)),
            (ResizeHandle.TopRight, new Point(right, top)),
            (ResizeHandle.Right, new Point(right, (top + bottom) / 2)),
            (ResizeHandle.BottomRight, new Point(right, bottom)),
            (ResizeHandle.Bottom, new Point((left + right) / 2, bottom)),
            (ResizeHandle.BottomLeft, new Point(left, bottom)),
            (ResizeHandle.Left, new Point(left, (top + bottom) / 2))
        };
        foreach (var candidate in candidates)
        {
            if (Math.Abs(point.X - candidate.Position.X) <= hitRadius && Math.Abs(point.Y - candidate.Position.Y) <= hitRadius)
            {
                handle = candidate.Handle;
                return true;
            }
        }
        return false;
    }

    private void ResizeSelection(Point point)
    {
        if (_activeResizeHandle is null || _dragStart is null) return;
        point = ClampPoint(point);
        var left = Math.Min(_dragStart.Value.X, _dragEnd.X);
        var top = Math.Min(_dragStart.Value.Y, _dragEnd.Y);
        var right = Math.Max(_dragStart.Value.X, _dragEnd.X);
        var bottom = Math.Max(_dragStart.Value.Y, _dragEnd.Y);
        const double minimumSize = 12;

        switch (_activeResizeHandle.Value)
        {
            case ResizeHandle.TopLeft:
                left = Math.Min(point.X, right - minimumSize);
                top = Math.Min(point.Y, bottom - minimumSize);
                break;
            case ResizeHandle.Top:
                top = Math.Min(point.Y, bottom - minimumSize);
                break;
            case ResizeHandle.TopRight:
                right = Math.Max(point.X, left + minimumSize);
                top = Math.Min(point.Y, bottom - minimumSize);
                break;
            case ResizeHandle.Right:
                right = Math.Max(point.X, left + minimumSize);
                break;
            case ResizeHandle.BottomRight:
                right = Math.Max(point.X, left + minimumSize);
                bottom = Math.Max(point.Y, top + minimumSize);
                break;
            case ResizeHandle.Bottom:
                bottom = Math.Max(point.Y, top + minimumSize);
                break;
            case ResizeHandle.BottomLeft:
                left = Math.Min(point.X, right - minimumSize);
                bottom = Math.Max(point.Y, top + minimumSize);
                break;
            case ResizeHandle.Left:
                left = Math.Min(point.X, right - minimumSize);
                break;
        }

        _dragStart = new Point(left, top);
        _dragEnd = new Point(right, bottom);
        _selectedRegion = ToPhysicalRect(_dragStart.Value, _dragEnd);
        UpdateSelectionVisual();
        PositionAnnotationToolbar();
    }

    private void UpdateResizeHandles(double left, double top, double right, double bottom)
    {
        foreach (var pair in _resizeHandles) pair.Value.Visibility = _isAnnotating ? Visibility.Visible : Visibility.Collapsed;
        if (!_isAnnotating) return;

        SetResizeHandle(ResizeHandle.TopLeft, left, top);
        SetResizeHandle(ResizeHandle.Top, (left + right) / 2, top);
        SetResizeHandle(ResizeHandle.TopRight, right, top);
        SetResizeHandle(ResizeHandle.Right, right, (top + bottom) / 2);
        SetResizeHandle(ResizeHandle.BottomRight, right, bottom);
        SetResizeHandle(ResizeHandle.Bottom, (left + right) / 2, bottom);
        SetResizeHandle(ResizeHandle.BottomLeft, left, bottom);
        SetResizeHandle(ResizeHandle.Left, left, (top + bottom) / 2);
    }

    private void SetResizeHandle(ResizeHandle pair, double x, double y)
    {
        var handle = _resizeHandles[pair];
        Canvas.SetLeft(handle, x - handle.Width / 2);
        Canvas.SetTop(handle, y - handle.Height / 2);
    }

    private void HideResizeHandles()
    {
        foreach (var handle in _resizeHandles.Values) handle.Visibility = Visibility.Collapsed;
    }

    private void UpdateWindowHover(Point surfacePoint)
    {
        if (_selectionIntent == RegionSelectionIntent.Region)
        {
            _hoverRegion = null;
            UpdateSelectionVisual();
            return;
        }
        if (_surface.ActualWidth <= 0 || _surface.ActualHeight <= 0) return;
        var screenX = _monitorBounds.X + (int)Math.Round(surfacePoint.X * _monitorBounds.Width / _surface.ActualWidth);
        var screenY = _monitorBounds.Y + (int)Math.Round(surfacePoint.Y * _monitorBounds.Height / _surface.ActualHeight);
        _hoverRegion = FindWindowRegion(screenX, screenY);
        _instruction.Text = _hoverRegion is null
            ? "悬停识别窗口 · 单击选中 · 拖拽自定义区域 · Esc 取消"
            : "已识别窗口 · 单击选中 · 拖拽自定义区域 · Esc 取消";
        UpdateSelectionVisual();
    }

    private RectInt32? FindWindowRegion(int screenX, int screenY)
    {
        var overlayHandle = WindowNative.GetWindowHandle(_window);
        var processId = GetCurrentProcessId();
        var candidate = GetWindow(overlayHandle, GwHwndNext);
        while (candidate != IntPtr.Zero)
        {
            if (IsWindowVisible(candidate) && GetWindowThreadProcessId(candidate, out var candidateProcessId) != 0 && candidateProcessId != processId)
            {
                var exStyle = GetWindowLongPtr(candidate, GwlExStyle).ToInt64();
                if ((exStyle & WsExToolWindow) == 0 && GetWindowRect(candidate, out var rect) &&
                    screenX >= rect.Left && screenX < rect.Right && screenY >= rect.Top && screenY < rect.Bottom)
                {
                    var left = Math.Max(rect.Left, _monitorBounds.X) - _monitorBounds.X;
                    var top = Math.Max(rect.Top, _monitorBounds.Y) - _monitorBounds.Y;
                    var right = Math.Min(rect.Right, _monitorBounds.X + _monitorBounds.Width) - _monitorBounds.X;
                    var bottom = Math.Min(rect.Bottom, _monitorBounds.Y + _monitorBounds.Height) - _monitorBounds.Y;
                    if (right - left >= 4 && bottom - top >= 4)
                        return new RectInt32(left, top, right - left, bottom - top);
                }
            }
            candidate = GetWindow(candidate, GwHwndNext);
        }

        return null;
    }

    private void Root_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        // Text editing owns its keys, including multiline Enter and clipboard shortcuts.
        if (e.Handled || _inlineTextEditor is not null || e.OriginalSource is TextBox) return;
        if (_isPickingColor)
        {
            if (e.Key == VirtualKey.C)
            {
                CopySampledColor();
                e.Handled = true;
                return;
            }
            if (IsShiftKey(e.Key) && !_shiftHeld)
            {
                _shiftHeld = true;
                _showHex = !_showHex;
                UpdatePickerText();
                e.Handled = true;
                return;
            }
            if (e.Key == VirtualKey.Escape)
            {
                SelectAnnotationTool(_previousTool);
                e.Handled = true;
                return;
            }
        }
        if (_isAnnotating && !_isPickingColor)
        {
            if (IsControlDown() && e.Key == VirtualKey.Z)
            {
                UndoAnnotation();
                e.Handled = true;
                return;
            }
            if (IsControlDown() && (e.Key == VirtualKey.C || e.Key == VirtualKey.S))
            {
                _ = SaveInlineAsync(copy: e.Key == VirtualKey.C);
                e.Handled = true;
                return;
            }
            if (_selectedAnnotation is not null)
            {
                if (e.Key == VirtualKey.Delete)
                {
                    _annotationHistory.Remove(_selectedAnnotation);
                    _annotationCanvas.Children.Remove(_selectedAnnotation);
                    HideAnnotationSelection();
                    e.Handled = true;
                    return;
                }
                var distance = (GetKeyState(0x10) & 0x8000) != 0 ? 10d : 1d;
                var delta = e.Key switch
                {
                    VirtualKey.Left => new Point(-distance, 0),
                    VirtualKey.Right => new Point(distance, 0),
                    VirtualKey.Up => new Point(0, -distance),
                    VirtualKey.Down => new Point(0, distance),
                    _ => new Point(0, 0)
                };
                if (delta.X != 0 || delta.Y != 0)
                {
                    var transform = GetAnnotationTransform(_selectedAnnotation);
                    var bounds = AnnotationBounds(_selectedAnnotation);
                    var selection = SurfaceSelectionBounds();
                    var dx = delta.X * _surface.ActualWidth / _monitorBounds.Width;
                    var dy = delta.Y * _surface.ActualHeight / _monitorBounds.Height;
                    var minX = selection.X - bounds.X;
                    var maxX = selection.Right - bounds.Right;
                    var minY = selection.Y - bounds.Y;
                    var maxY = selection.Bottom - bounds.Bottom;
                    transform.TranslateX += minX <= maxX ? Math.Clamp(dx, minX, maxX) : 0;
                    transform.TranslateY += minY <= maxY ? Math.Clamp(dy, minY, maxY) : 0;
                    ShowAnnotationSelection(_selectedAnnotation);
                    e.Handled = true;
                    return;
                }
            }
        }
        if (e.Key == VirtualKey.Escape) CancelSelection();
        else if (e.Key == VirtualKey.Enter && _isAnnotating)
        {
            _ = SaveInlineAsync(copy: false);
        }
    }

    private void Root_KeyUp(object sender, KeyRoutedEventArgs e)
    {
        if (IsShiftKey(e.Key)) _shiftHeld = false;
    }

    private static bool IsShiftKey(VirtualKey key) => key is VirtualKey.Shift or VirtualKey.LeftShift or VirtualKey.RightShift;

    private Border BuildAnnotationToolbar()
    {
        var drawTools = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 2, VerticalAlignment = VerticalAlignment.Center };
        var names = new[] { "画笔", "矩形", "箭头", "文字", "取色" };
        var glyphs = new[] { "\uE70F", "\uE739", "\uE72A", "\uE8D2", "\uEF3C" };
        for (var index = 0; index < names.Length; index++)
        {
            var tool = index;
            var button = new Button
            {
                Content = OverlayChrome.Icon(glyphs[index]),
                Width = OverlayChrome.CompactButtonSize,
                Height = OverlayChrome.CompactButtonSize,
                Padding = new Thickness(0),
                Tag = index
            };
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(button, names[index]);
            ToolTipService.SetToolTip(button, names[index]);
            button.Click += (_, _) => SelectAnnotationTool(tool);
            _toolButtons.Add(button);
            _toolStyles.Add(new OverlayButtonStyle(button));
            drawTools.Children.Add(button);
        }

        drawTools.Children.Add(ToolbarDivider());
        _ocrButton = OverlayChrome.CompactIconButton("\uEE6F", "重新识别当前区域", () => _ = RecognizeSelectedRegionAsync());
        ToolTipService.SetToolTip(_ocrButton, "重新识别当前截图区域并复制");
        drawTools.Children.Add(_ocrButton);
        _pinButton = OverlayChrome.CompactIconButton("\uE718", "贴到桌面", () => _ = PinSelectedRegionAsync());
        drawTools.Children.Add(_pinButton);

        var outputTools = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 2, VerticalAlignment = VerticalAlignment.Center };
        outputTools.Children.Add(ToolbarDivider());
        foreach (var color in _palette)
        {
            var button = new Button
            {
                Width = 24,
                Height = 28,
                Padding = new Thickness(0),
                Background = new SolidColorBrush(Colors.Transparent),
                BorderBrush = OverlayChrome.Brush(color == _annotationColor ? OverlayChrome.Accent : Colors.Transparent),
                BorderThickness = new Thickness(2),
                CornerRadius = new CornerRadius(14),
                Content = new Ellipse { Width = 14, Height = 14, Fill = new SolidColorBrush(color) },
                Tag = color
            };
            var colorName = AnnotationColorName(color);
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(button, colorName);
            ToolTipService.SetToolTip(button, colorName);
            button.Click += (_, _) => SelectAnnotationColor((Windows.UI.Color)button.Tag);
            _colorButtons.Add(button);
            outputTools.Children.Add(button);
        }

        var thicknessLabel = new TextBlock
        {
            Text = "4 px", FontSize = 12, VerticalAlignment = VerticalAlignment.Center,
            TextWrapping = TextWrapping.NoWrap, TextTrimming = TextTrimming.None
        };
        var thicknessContent = new Grid { ColumnSpacing = 8 };
        thicknessContent.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        thicknessContent.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        thicknessContent.Children.Add(thicknessLabel);
        var chevron = OverlayChrome.Icon("\uE70D", 10);
        Grid.SetColumn(chevron, 1);
        thicknessContent.Children.Add(chevron);
        _annotationThickness.HorizontalContentAlignment = HorizontalAlignment.Stretch;
        _annotationThickness.Content = thicknessContent;
        _ = new OverlayButtonStyle(_annotationThickness, OverlayButtonTone.Field);
        var thicknessMenu = new MenuFlyout();
        foreach (var width in new[] { 2, 4, 8 })
        {
            var item = new ToggleMenuFlyoutItem { Text = $"{width} px", IsChecked = width == 4 };
            item.Click += (_, _) =>
            {
                _annotationStrokeWidth = width;
                thicknessLabel.Text = $"{width} px";
                foreach (var choice in thicknessMenu.Items.OfType<ToggleMenuFlyoutItem>())
                    choice.IsChecked = ReferenceEquals(choice, item);
                Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(_annotationThickness, $"画笔粗细 {width} px");
            };
            thicknessMenu.Items.Add(item);
        }
        _annotationThickness.Flyout = thicknessMenu;
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(_annotationThickness, "画笔粗细");
        ToolTipService.SetToolTip(_annotationThickness, "画笔粗细");
        outputTools.Children.Add(_annotationThickness);
        outputTools.Children.Add(ToolbarDivider());
        var undo = OverlayChrome.CompactIconButton("\uE7A7", "撤销", UndoAnnotation);
        var copy = OverlayChrome.CompactIconButton("\uE8C8", "复制", () => _ = SaveInlineAsync(copy: true));
        var save = OverlayChrome.CompactIconButton("\uE74E", "保存截图", () => _ = SaveInlineAsync(copy: false), OverlayButtonTone.Accent);
        var cancel = OverlayChrome.CompactIconButton("\uE711", "取消", CancelSelection, OverlayButtonTone.Danger);
        outputTools.Children.Add(undo);
        outputTools.Children.Add(copy);
        outputTools.Children.Add(save);
        outputTools.Children.Add(cancel);

        _toolbarGroups.Children.Add(drawTools);
        _toolbarGroups.Children.Add(outputTools);

        var content = new StackPanel { Spacing = 4 };
        content.Children.Add(_toolbarGroups);
        var toolbar = new Border
        {
            Background = OverlayChrome.Brush(OverlayChrome.Surface),
            BorderBrush = OverlayChrome.Brush(OverlayChrome.Border),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(6),
            Child = content,
            Shadow = new ThemeShadow()
        };
        return toolbar;
    }

    private Border BuildPickerPanel()
    {
        var preview = new Grid { Width = 112, Height = 112, Clip = new Microsoft.UI.Xaml.Media.RectangleGeometry { Rect = new Rect(0, 0, 112, 112) } };
        preview.Children.Add(new Rectangle { Fill = new SolidColorBrush(ColorHelper.FromArgb(255, 28, 32, 38)) });
        _magnifierGrid.IsHitTestVisible = false;
        const double cellSize = 112d / 11;
        for (var row = 0; row < 11; row++)
        {
            for (var column = 0; column < 11; column++)
            {
                var cell = new Rectangle
                {
                    Width = cellSize,
                    Height = cellSize,
                    Stroke = new SolidColorBrush(ColorHelper.FromArgb(105, 255, 255, 255)),
                    StrokeThickness = 1
                };
                var brush = new SolidColorBrush(Colors.Black);
                cell.Fill = brush;
                _magnifierBrushes.Add(brush);
                Canvas.SetLeft(cell, column * cellSize);
                Canvas.SetTop(cell, row * cellSize);
                _magnifierGrid.Children.Add(cell);
            }
        }
        _magnifierGrid.Children.Add(new Rectangle
        {
            Width = 10, Height = 10,
            Stroke = new SolidColorBrush(ColorHelper.FromArgb(255, 255, 94, 55)),
            StrokeThickness = 2,
            Fill = new SolidColorBrush(ColorHelper.FromArgb(24, 255, 255, 255)),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        });
        preview.Children.Add(_magnifierGrid);

        var readout = new StackPanel { Spacing = 5, Margin = new Thickness(0, 9, 0, 0) };
        var valueRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center };
        valueRow.Children.Add(_pickerColorChip);
        valueRow.Children.Add(_pickerValue);
        readout.Children.Add(valueRow);
        readout.Children.Add(_pickerDetails);
        readout.Children.Add(new TextBlock
        {
            Text = "C 复制 · Shift 切换 RGB/HEX",
            FontSize = 10,
            Foreground = OverlayChrome.Brush(OverlayChrome.Muted)
        });

        var content = new StackPanel { Children = { preview, readout } };
        return new Border
        {
            Width = 176,
            Padding = new Thickness(10),
            Background = OverlayChrome.Brush(OverlayChrome.Surface),
            BorderBrush = OverlayChrome.Brush(OverlayChrome.Border),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(9),
            Child = content,
            Shadow = new ThemeShadow()
        };
    }

    private static Border ToolbarDivider() => OverlayChrome.Divider();

    private static string AnnotationColorName(Windows.UI.Color color) => color switch
    {
        var value when value == Colors.Red => "红色",
        var value when value == Colors.DodgerBlue => "蓝色",
        var value when value == Colors.LimeGreen => "绿色",
        var value when value == Colors.Yellow => "黄色",
        _ => "白色"
    };

    private void EnterAnnotationMode()
    {
        if (_selectedRegion is null) return;
        _isAnnotating = true;
        _instructionToolbar.Visibility = Visibility.Collapsed;
        _annotationToolbar.Visibility = Visibility.Visible;
        _annotationCanvas.IsHitTestVisible = false;
        _toolbarStatus.Text = "已选定区域 · 拖动边角或边线调整范围 · 点击识别按钮重新计算";
        _toolbarStatus.Visibility = Visibility.Visible;
        UpdateSelectionVisual();
        SelectAnnotationTool(0);
        PositionAnnotationToolbar();
    }

    private void PositionAnnotationToolbar()
    {
        if (_selectedRegion is null || _surface.ActualWidth <= 0 || _surface.ActualHeight <= 0) return;
        if (_toolbarAvailableWidth != _surface.ActualWidth)
        {
            _toolbarAvailableWidth = _surface.ActualWidth;
            _toolbarGroups.Orientation = Orientation.Horizontal;
            _annotationToolbar.Measure(new Size(double.PositiveInfinity, _surface.ActualHeight));
            if (_annotationToolbar.DesiredSize.Width > _surface.ActualWidth - 16)
                _toolbarGroups.Orientation = Orientation.Vertical;
        }
        _annotationToolbar.Measure(new Size(_surface.ActualWidth, _surface.ActualHeight));
        var size = _annotationToolbar.DesiredSize;
        var region = SurfaceSelectionBounds();
        var left = Math.Clamp(region.X + (region.Width - size.Width) / 2, 8, Math.Max(8, _surface.ActualWidth - size.Width - 8));
        var below = region.Y + region.Height + 10;
        var top = below + size.Height <= _surface.ActualHeight - 8
            ? below
            : Math.Max(8, region.Y - size.Height - 10);
        Canvas.SetLeft(_annotationToolbar, left);
        Canvas.SetTop(_annotationToolbar, top);
    }

    private void UpdateColorSample(Point point)
    {
        if (_pixelSampler is null || _surface.ActualWidth <= 0 || _surface.ActualHeight <= 0) return;
        var x = Math.Clamp((int)(point.X * _pixelSampler.Width / _surface.ActualWidth), 0, _pixelSampler.Width - 1);
        var y = Math.Clamp((int)(point.Y * _pixelSampler.Height / _surface.ActualHeight), 0, _pixelSampler.Height - 1);
        _sampledColor = _pixelSampler.GetColor(x, y);

        for (var row = 0; row < 11; row++)
        {
            for (var column = 0; column < 11; column++)
            {
                var pixelX = Math.Clamp(x + column - 5, 0, _pixelSampler.Width - 1);
                var pixelY = Math.Clamp(y + row - 5, 0, _pixelSampler.Height - 1);
                _magnifierBrushes[row * 11 + column].Color = _pixelSampler.GetColor(pixelX, pixelY);
            }
        }
        _pickerColorChip.Fill = new SolidColorBrush(_sampledColor);
        UpdatePickerText(x, y);

        _pickerPanel.Measure(new Size(_surface.ActualWidth, _surface.ActualHeight));
        var panelSize = _pickerPanel.DesiredSize;
        var cursor = new Point(point.X + 22, point.Y + 18);
        if (cursor.X + panelSize.Width > _surface.ActualWidth - 8) cursor.X = point.X - panelSize.Width - 18;
        if (cursor.Y + panelSize.Height > _surface.ActualHeight - 8) cursor.Y = point.Y - panelSize.Height - 18;
        Canvas.SetLeft(_pickerPanel, Math.Clamp(cursor.X, 8, Math.Max(8, _surface.ActualWidth - panelSize.Width - 8)));
        Canvas.SetTop(_pickerPanel, Math.Clamp(cursor.Y, 8, Math.Max(8, _surface.ActualHeight - panelSize.Height - 8)));
    }

    private void UpdatePickerText(int? x = null, int? y = null)
    {
        var colorValue = _showHex
            ? $"#{_sampledColor.R:X2}{_sampledColor.G:X2}{_sampledColor.B:X2}"
            : $"RGB {_sampledColor.R}, {_sampledColor.G}, {_sampledColor.B}";
        _pickerValue.Text = colorValue;
        if (x is not null && y is not null)
            _pickerDetails.Text = $"坐标 {_monitorBounds.X + x.Value}, {_monitorBounds.Y + y.Value}";
    }

    private void CopySampledColor()
    {
        var package = new DataPackage();
        package.SetText(_pickerValue.Text);
        Clipboard.SetContent(package);
        _toolbarStatus.Text = $"已复制 {_pickerValue.Text}";
        _toolbarStatus.Visibility = Visibility.Visible;
        PositionAnnotationToolbar();
    }

    private async Task RecognizeSelectedRegionAsync()
    {
        if (_selectedRegion is null || (_pixelSampler is null && string.IsNullOrWhiteSpace(_frozenScreenshotPath)) || _ocrButton is null) return;
        if (!_ocrButton.IsEnabled) return;
        var selection = _selectedRegion.Value;
        var originalContent = _ocrButton.Content;
        var temporaryImage = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"zhuageping-ocr-{Guid.NewGuid():N}.png");
        var preparedImage = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"zhuageping-ocr-prepared-{Guid.NewGuid():N}.png");
        var timer = System.Diagnostics.Stopwatch.StartNew();
        _ocrButton.IsEnabled = false;
        _ocrButton.Content = new ProgressRing { IsActive = true, Width = 16, Height = 16, Foreground = OverlayChrome.Brush(OverlayChrome.Accent) };
        ToolTipService.SetToolTip(_ocrButton, "正在识别当前区域");
        _toolbarStatus.Text = "正在识别选区文字…";
        _toolbarStatus.Visibility = Visibility.Visible;
        PositionAnnotationToolbar();
        try
        {
            _toolbarStatus.Text = "正在准备识别区域…";
            await Task.Run(() => SaveFrozenRegion(temporaryImage, selection));
            _ocrLifetime.Token.ThrowIfCancellationRequested();
            await Task.Run(() => OcrImagePreprocessor.PrepareAsync(temporaryImage, preparedImage), _ocrLifetime.Token);
            _toolbarStatus.Text = "正在识别选区文字…";
            var result = await Task.Run(() => RapidOcrService.RecognizeAsync(preparedImage, _ocrLifetime.Token), _ocrLifetime.Token);
            timer.Stop();
            if (_annotationCompletion.Task.IsCompleted) return;
            if (_selectedRegion is not { } current || current.X != selection.X || current.Y != selection.Y ||
                current.Width != selection.Width || current.Height != selection.Height)
            {
                _toolbarStatus.Text = "选区已变更，请重新识别。";
                PositionAnnotationToolbar();
                return;
            }
            if (!result.Success)
            {
                _toolbarStatus.Text = result.Error;
                var retryFailed = await OcrResultDialog.ShowAsync(result, timer.Elapsed, false,
                    ((FrameworkElement)_window.Content!).XamlRoot);
                if (retryFailed) _window.DispatcherQueue.TryEnqueue(() => _ = RecognizeSelectedRegionAsync());
                return;
            }

            var text = result.Text;
            var copied = false;
            if (!string.IsNullOrWhiteSpace(text))
            {
                try
                {
                    var package = new DataPackage();
                    package.SetText(text);
                    Clipboard.SetContent(package);
                    copied = true;
                }
                catch
                {
                    // OCR 结果仍然保留在结果窗口，剪贴板被其他程序占用时不应让识别失败。
                }

                _toolbarStatus.Text = copied
                    ? $"识别完成 · {result.Lines.Count} 行 · {timer.ElapsedMilliseconds} ms · 已复制"
                    : $"识别完成 · {result.Lines.Count} 行 · {timer.ElapsedMilliseconds} ms · 剪贴板暂不可用";
            }
            else
            {
                _toolbarStatus.Text = $"没有识别到文字 · {timer.ElapsedMilliseconds} ms";
            }
            PositionAnnotationToolbar();

            var retry = await OcrResultDialog.ShowAsync(result, timer.Elapsed, copied,
                ((FrameworkElement)_window.Content!).XamlRoot);
            if (retry) _window.DispatcherQueue.TryEnqueue(() => _ = RecognizeSelectedRegionAsync());
        }
        catch (OperationCanceledException) when (_ocrLifetime.IsCancellationRequested) { }
        catch (Exception ex)
        {
            _toolbarStatus.Text = $"OCR 识别失败：{ex.Message}";
            PositionAnnotationToolbar();
        }
        finally
        {
            _ocrButton.Content = originalContent;
            ToolTipService.SetToolTip(_ocrButton, "重新识别当前区域");
            _ocrButton.IsEnabled = true;
            try { File.Delete(temporaryImage); }
            catch { }
            try { File.Delete(preparedImage); }
            catch { }
        }
    }

    private async Task PinSelectedRegionAsync()
    {
        if (_selectedRegion is null || string.IsNullOrWhiteSpace(_outputPath) || _pinButton is null) return;
        _pinButton.IsEnabled = false;
        _toolbarStatus.Text = "正在创建贴图…";
        _toolbarStatus.Visibility = Visibility.Visible;
        PositionAnnotationToolbar();
        try
        {
            var region = _selectedRegion.Value;
            await Task.Run(() => SaveFrozenRegion(_outputPath, region));
            await PinnedImageWindow.OpenAsync(_outputPath);
            _annotationCompletion.TrySetResult(true);
            _window.Close();
        }
        catch (Exception ex)
        {
            _toolbarStatus.Text = $"贴图创建失败：{ex.Message}";
            PositionAnnotationToolbar();
        }
        finally
        {
            _pinButton.IsEnabled = true;
        }
    }

    private Rect SurfaceSelectionBounds()
    {
        if (_selectedRegion is null) return new Rect();
        var sx = _surface.ActualWidth / _monitorBounds.Width;
        var sy = _surface.ActualHeight / _monitorBounds.Height;
        return new Rect(
            _selectedRegion.Value.X * sx,
            _selectedRegion.Value.Y * sy,
            _selectedRegion.Value.Width * sx,
            _selectedRegion.Value.Height * sy);
    }

    private Point PhysicalToSurface(Point point) => new(
        point.X * _surface.ActualWidth / _monitorBounds.Width,
        point.Y * _surface.ActualHeight / _monitorBounds.Height);

    private Point ClampToSelection(Point point)
    {
        var bounds = SurfaceSelectionBounds();
        return new Point(Math.Clamp(point.X, bounds.X, bounds.X + bounds.Width), Math.Clamp(point.Y, bounds.Y, bounds.Y + bounds.Height));
    }

    private void SelectAnnotationTool(int tool)
    {
        if (_inlineTextEditor is not null && tool != 3) CommitInlineTextEditor();
        if (tool == 4)
        {
            if (!_isPickingColor) _previousTool = _activeTool;
            _isPickingColor = true;
            _pickerPanel.Visibility = Visibility.Visible;
        }
        else
        {
            _isPickingColor = false;
            _pickerPanel.Visibility = Visibility.Collapsed;
        }
        _activeTool = tool;
        for (var index = 0; index < _toolButtons.Count; index++)
        {
            _toolStyles[index].Selected = (int)_toolButtons[index].Tag == tool;
        }
    }

    private void SelectAnnotationColor(Windows.UI.Color color)
    {
        _annotationColor = color;
        foreach (var button in _colorButtons)
        {
            var selected = (Windows.UI.Color)button.Tag == color;
            button.BorderBrush = OverlayChrome.Brush(selected ? OverlayChrome.Accent : Colors.Transparent);
            button.Background = OverlayChrome.Brush(selected ? OverlayChrome.AccentSoft : Colors.Transparent);
        }
    }

    private void BeginAnnotation(Point point, PointerRoutedEventArgs args)
    {
        if (_inlineTextEditor is not null) CommitInlineTextEditor();
        _annotationStart = ClampToSelection(point);
        if (_activeTool == 3)
        {
            BeginInlineTextEditor(_annotationStart);
            return;
        }

        _surface.CapturePointer(args.Pointer);
        var width = _annotationStrokeWidth;
        var stroke = new SolidColorBrush(_annotationColor);
        if (_activeTool == 1)
        {
            _activeAnnotation = new Rectangle { Fill = new SolidColorBrush(Colors.Transparent), Stroke = stroke, StrokeThickness = width };
        }
        else
        {
            _activePath = new Polyline { Stroke = stroke, StrokeThickness = width, StrokeLineJoin = PenLineJoin.Round };
            _activePath.Points.Add(_annotationStart);
            _activeAnnotation = _activePath;
        }
        _annotationCanvas.Children.Add(_activeAnnotation);
        UpdateAnnotation(_annotationStart);
    }

    private void UpdateAnnotation(Point point)
    {
        if (_activeAnnotation is null) return;
        var end = ClampToSelection(point);
        if (_activeTool == 1 && _activeAnnotation is Rectangle rectangle)
        {
            Canvas.SetLeft(rectangle, Math.Min(_annotationStart.X, end.X));
            Canvas.SetTop(rectangle, Math.Min(_annotationStart.Y, end.Y));
            rectangle.Width = Math.Abs(end.X - _annotationStart.X);
            rectangle.Height = Math.Abs(end.Y - _annotationStart.Y);
            return;
        }
        if (_activePath is null) return;
        if (_activeTool == 0)
        {
            var last = _activePath.Points.Count == 0 ? _annotationStart : _activePath.Points[^1];
            var deltaX = end.X - last.X;
            var deltaY = end.Y - last.Y;
            if (deltaX * deltaX + deltaY * deltaY >= 4)
            {
                _activePath.Points.Add(end);
            }
            else if (_activePath.Points.Count == 1 && (end.X != _annotationStart.X || end.Y != _annotationStart.Y))
            {
                _activePath.Points.Add(end);
            }
            return;
        }
        _activePath.Points.Clear();
        _activePath.Points.Add(_annotationStart);
        _activePath.Points.Add(end);
        if (_activeTool != 2) return;
        var dx = end.X - _annotationStart.X;
        var dy = end.Y - _annotationStart.Y;
        var length = Math.Sqrt(dx * dx + dy * dy);
        if (length < 1) return;
        var head = Math.Min(20, length * 0.35);
        var angle = Math.Atan2(dy, dx);
        _activePath.Points.Add(new Point(end.X - head * Math.Cos(angle - Math.PI / 6), end.Y - head * Math.Sin(angle - Math.PI / 6)));
        _activePath.Points.Add(end);
        _activePath.Points.Add(new Point(end.X - head * Math.Cos(angle + Math.PI / 6), end.Y - head * Math.Sin(angle + Math.PI / 6)));
    }

    private bool TryBeginMoveAnnotation(Point point, Pointer pointer)
    {
        _annotationCanvas.UpdateLayout();
        for (var index = _annotationHistory.Count - 1; index >= 0; index--)
        {
            var annotation = _annotationHistory[index];
            if (!AnnotationBounds(annotation).Contains(point)) continue;

            _movingAnnotation = annotation;
            _movingTransform = GetAnnotationTransform(annotation);
            _selectedAnnotation = annotation;
            _moveStart = point;
            _moveOriginX = _movingTransform.TranslateX;
            _moveOriginY = _movingTransform.TranslateY;
            Canvas.SetZIndex(annotation, _annotationHistory.Count + 1);
            ShowAnnotationSelection(annotation);
            _surface.CapturePointer(pointer);
            PositionAnnotationToolbar();
            return true;
        }
        return false;
    }

    private bool TryBeginAnnotationTransform(Point point, Pointer pointer)
    {
        if (_selectedAnnotation is null) return false;
        var bounds = AnnotationBounds(_selectedAnnotation);
        foreach (var handle in Enum.GetValues<AnnotationHandle>())
        {
            var handleBounds = AnnotationHandleBounds(bounds, handle);
            if (!handleBounds.Contains(point)) continue;

            _activeAnnotationHandle = handle;
            _movingAnnotation = _selectedAnnotation;
            _movingTransform = GetAnnotationTransform(_selectedAnnotation);
            var center = new Point(bounds.X + bounds.Width / 2, bounds.Y + bounds.Height / 2);
            _transformCenter = center;
            var vector = new Point(point.X - center.X, point.Y - center.Y);
            _transformStartAngle = Math.Atan2(vector.Y, vector.X);
            _transformStartDistance = Math.Max(1, Math.Sqrt(vector.X * vector.X + vector.Y * vector.Y));
            _transformStartRotation = _movingTransform.Rotation;
            _transformStartScale = Math.Max(0.01, Math.Abs(_movingTransform.ScaleX));
            _surface.CapturePointer(pointer);
            return true;
        }
        return false;
    }

    private void UpdateAnnotationTransform(Point point)
    {
        if (_activeAnnotationHandle is null || _movingAnnotation is null || _movingTransform is null) return;
        var vector = new Point(point.X - _transformCenter.X, point.Y - _transformCenter.Y);
        if (_activeAnnotationHandle == AnnotationHandle.Rotation)
        {
            var angle = Math.Atan2(vector.Y, vector.X);
            var delta = (angle - _transformStartAngle) * 180 / Math.PI;
            _movingTransform.Rotation = _transformStartRotation + delta;
        }
        else
        {
            var distance = Math.Sqrt(vector.X * vector.X + vector.Y * vector.Y);
            var scale = Math.Clamp(_transformStartScale * distance / _transformStartDistance, 0.15, 8.0);
            _movingTransform.ScaleX = scale;
            _movingTransform.ScaleY = scale;
        }
        UpdateAnnotationSelectionBounds();
    }

    private static Rect AnnotationHandleBounds(Rect bounds, AnnotationHandle handle)
    {
        const double hitSize = 18;
        var x = handle switch
        {
            AnnotationHandle.TopLeft or AnnotationHandle.BottomLeft => bounds.X,
            AnnotationHandle.TopRight or AnnotationHandle.BottomRight => bounds.Right,
            _ => bounds.X + bounds.Width / 2
        };
        var y = handle switch
        {
            AnnotationHandle.TopLeft or AnnotationHandle.TopRight => bounds.Y,
            AnnotationHandle.BottomLeft or AnnotationHandle.BottomRight => bounds.Bottom,
            _ => bounds.Y - 28
        };
        return new Rect(x - hitSize / 2, y - hitSize / 2, hitSize, hitSize);
    }

    private static CompositeTransform GetAnnotationTransform(UIElement annotation)
    {
        if (annotation.RenderTransform is CompositeTransform composite)
        {
            ConfigureAnnotationTransformCenter(annotation, composite);
            return composite;
        }

        var legacy = annotation.RenderTransform as TranslateTransform;
        var transform = new CompositeTransform
        {
            TranslateX = legacy?.X ?? 0,
            TranslateY = legacy?.Y ?? 0
        };
        ConfigureAnnotationTransformCenter(annotation, transform);
        annotation.RenderTransform = transform;
        return transform;
    }

    private static void ConfigureAnnotationTransformCenter(UIElement annotation, CompositeTransform transform)
    {
        if (annotation is Polyline polyline && polyline.Points.Count > 0)
        {
            transform.CenterX = (polyline.Points.Min(point => point.X) + polyline.Points.Max(point => point.X)) / 2;
            transform.CenterY = (polyline.Points.Min(point => point.Y) + polyline.Points.Max(point => point.Y)) / 2;
            return;
        }

        var framework = annotation as FrameworkElement;
        var width = framework?.ActualWidth > 0 ? framework.ActualWidth : framework?.Width ?? 20;
        var height = framework?.ActualHeight > 0 ? framework.ActualHeight : framework?.Height ?? 20;
        transform.CenterX = width / 2;
        transform.CenterY = height / 2;
    }

    private void MoveAnnotation(Point point)
    {
        if (_movingAnnotation is null || _movingTransform is null) return;

        var originalBounds = AnnotationBounds(_movingAnnotation);
        var selection = SurfaceSelectionBounds();
        var deltaX = point.X - _moveStart.X;
        var deltaY = point.Y - _moveStart.Y;
        var minDeltaX = selection.X - originalBounds.X;
        var maxDeltaX = selection.X + selection.Width - originalBounds.Right;
        var minDeltaY = selection.Y - originalBounds.Y;
        var maxDeltaY = selection.Y + selection.Height - originalBounds.Bottom;
        if (maxDeltaX < minDeltaX) minDeltaX = maxDeltaX = 0;
        if (maxDeltaY < minDeltaY) minDeltaY = maxDeltaY = 0;

        _movingTransform.TranslateX = _moveOriginX + Math.Clamp(deltaX, minDeltaX, maxDeltaX);
        _movingTransform.TranslateY = _moveOriginY + Math.Clamp(deltaY, minDeltaY, maxDeltaY);
        UpdateAnnotationSelectionBounds();
    }

    private void ShowAnnotationSelection(UIElement? annotation)
    {
        _selectedAnnotation = annotation;
        if (annotation is null)
        {
            HideAnnotationSelection();
            return;
        }

        _annotationCanvas.UpdateLayout();
        UpdateAnnotationSelectionBounds();
        _annotationSelection.Visibility = Visibility.Visible;
        _annotationRotationStem.Visibility = Visibility.Visible;
        foreach (var handle in _annotationHandles.Values) handle.Visibility = Visibility.Visible;
    }

    private void HideAnnotationSelection()
    {
        _selectedAnnotation = null;
        _annotationSelection.Visibility = Visibility.Collapsed;
        _annotationRotationStem.Visibility = Visibility.Collapsed;
        foreach (var handle in _annotationHandles.Values) handle.Visibility = Visibility.Collapsed;
    }

    private void UpdateAnnotationSelectionBounds()
    {
        if (_selectedAnnotation is null) return;
        var bounds = AnnotationBounds(_selectedAnnotation);
        Canvas.SetLeft(_annotationSelection, bounds.X);
        Canvas.SetTop(_annotationSelection, bounds.Y);
        _annotationSelection.Width = Math.Max(1, bounds.Width);
        _annotationSelection.Height = Math.Max(1, bounds.Height);

        var handleSize = new Dictionary<AnnotationHandle, double>
        {
            [AnnotationHandle.TopLeft] = 8,
            [AnnotationHandle.TopRight] = 8,
            [AnnotationHandle.BottomRight] = 8,
            [AnnotationHandle.BottomLeft] = 8,
            [AnnotationHandle.Rotation] = 10
        };
        foreach (var handle in Enum.GetValues<AnnotationHandle>())
        {
            var handleBounds = AnnotationHandleBounds(bounds, handle);
            var size = handleSize[handle];
            Canvas.SetLeft(_annotationHandles[handle], handleBounds.X + (handleBounds.Width - size) / 2);
            Canvas.SetTop(_annotationHandles[handle], handleBounds.Y + (handleBounds.Height - size) / 2);
        }
        var centerX = bounds.X + bounds.Width / 2;
        Canvas.SetLeft(_annotationRotationStem, centerX);
        _annotationRotationStem.X1 = 0;
        _annotationRotationStem.X2 = 0;
        _annotationRotationStem.Y1 = bounds.Y;
        _annotationRotationStem.Y2 = bounds.Y - 23;
    }

    private static Rect AnnotationBounds(UIElement annotation)
    {
        var points = new List<Point>();
        if (annotation is Polyline polyline && polyline.Points.Count > 0)
        {
            points.AddRange(polyline.Points.Select(point => ApplyAnnotationTransform(point, annotation.RenderTransform)));
        }
        else
        {
            var framework = annotation as FrameworkElement;
            var left = Canvas.GetLeft(annotation);
            var top = Canvas.GetTop(annotation);
            var width = framework?.ActualWidth > 0 ? framework.ActualWidth : framework?.Width ?? 20;
            var height = framework?.ActualHeight > 0 ? framework.ActualHeight : framework?.Height ?? 20;
            if (double.IsNaN(left)) left = 0;
            if (double.IsNaN(top)) top = 0;
            points.Add(OffsetPoint(ApplyAnnotationTransform(new Point(0, 0), annotation.RenderTransform), left, top));
            points.Add(OffsetPoint(ApplyAnnotationTransform(new Point(width, 0), annotation.RenderTransform), left, top));
            points.Add(OffsetPoint(ApplyAnnotationTransform(new Point(width, height), annotation.RenderTransform), left, top));
            points.Add(OffsetPoint(ApplyAnnotationTransform(new Point(0, height), annotation.RenderTransform), left, top));
        }

        if (points.Count == 0) return new Rect();
        var minX = points.Min(point => point.X);
        var minY = points.Min(point => point.Y);
        var maxX = points.Max(point => point.X);
        var maxY = points.Max(point => point.Y);
        var margin = annotation is Polyline ? 10 : 8;
        return new Rect(minX - margin, minY - margin, Math.Max(margin * 2, maxX - minX + margin * 2), Math.Max(margin * 2, maxY - minY + margin * 2));
    }

    private static Point ApplyAnnotationTransform(Point point, Transform? renderTransform)
    {
        if (renderTransform is TranslateTransform translate)
        {
            return new Point(point.X + translate.X, point.Y + translate.Y);
        }
        if (renderTransform is not CompositeTransform composite) return point;

        var scaledX = (point.X - composite.CenterX) * composite.ScaleX;
        var scaledY = (point.Y - composite.CenterY) * composite.ScaleY;
        var radians = composite.Rotation * Math.PI / 180;
        var cos = Math.Cos(radians);
        var sin = Math.Sin(radians);
        return new Point(
            composite.CenterX + scaledX * cos - scaledY * sin + composite.TranslateX,
            composite.CenterY + scaledX * sin + scaledY * cos + composite.TranslateY);
    }

    private static Point OffsetPoint(Point point, double x, double y) => new(point.X + x, point.Y + y);

    private void BeginInlineTextEditor(Point position)
    {
        var bounds = SurfaceSelectionBounds();
        var left = Math.Clamp(position.X, bounds.X + 4, Math.Max(bounds.X + 4, bounds.X + bounds.Width - 140));
        var top = Math.Clamp(position.Y, bounds.Y + 4, Math.Max(bounds.Y + 4, bounds.Y + bounds.Height - 44));
        var availableWidth = Math.Max(140, bounds.X + bounds.Width - left - 8);
        var editor = new TextBox
        {
            Width = Math.Min(360, availableWidth),
            MinHeight = 42,
            MaxHeight = 140,
            Padding = new Thickness(10, 6, 10, 6),
            FontSize = 24,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            Foreground = OverlayChrome.Brush(_annotationColor),
            Background = OverlayChrome.Brush(ColorHelper.FromArgb(235, 23, 27, 32)),
            BorderBrush = OverlayChrome.Brush(OverlayChrome.Accent),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(6),
            PlaceholderText = "直接输入文字 · Ctrl+Enter 完成",
            AcceptsReturn = true,
            TextWrapping = TextWrapping.Wrap,
            IsSpellCheckEnabled = false
        };
        _inlineTextEditor = editor;
        Canvas.SetLeft(editor, left);
        Canvas.SetTop(editor, top);
        _overlayLayer.Children.Add(editor);
        editor.KeyDown += (_, args) =>
        {
            if (args.Key == VirtualKey.Escape)
            {
                CancelInlineTextEditor();
                args.Handled = true;
            }
            else if (args.Key == VirtualKey.Enter && IsControlDown())
            {
                CommitInlineTextEditor();
                args.Handled = true;
            }
        };
        editor.LostFocus += (_, _) => CommitInlineTextEditor();
        editor.Focus(FocusState.Programmatic);
        editor.SelectionStart = 0;
        editor.SelectionLength = 0;
        _toolbarStatus.Text = "正在编辑文字 · Ctrl+Enter 完成 · Esc 取消";
        _toolbarStatus.Visibility = Visibility.Visible;
        PositionAnnotationToolbar();
    }

    private void CommitInlineTextEditor()
    {
        var editor = _inlineTextEditor;
        if (editor is null) return;
        _inlineTextEditor = null;
        var value = editor.Text.TrimEnd();
        var left = Canvas.GetLeft(editor);
        var top = Canvas.GetTop(editor);
        var width = editor.Width;
        _overlayLayer.Children.Remove(editor);
        if (string.IsNullOrWhiteSpace(value))
        {
            _toolbarStatus.Text = "文字为空，已取消编辑";
            PositionAnnotationToolbar();
            return;
        }

        var text = new TextBlock
        {
            Text = value,
            FontSize = 24,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            Foreground = OverlayChrome.Brush(_annotationColor),
            TextWrapping = TextWrapping.Wrap,
            MaxWidth = width
        };
        Canvas.SetLeft(text, left);
        Canvas.SetTop(text, top);
        _annotationCanvas.Children.Add(text);
        _annotationHistory.Add(text);
        ShowAnnotationSelection(text);
        PositionAnnotationToolbar();
    }

    private void CancelInlineTextEditor()
    {
        var editor = _inlineTextEditor;
        if (editor is null) return;
        _inlineTextEditor = null;
        _overlayLayer.Children.Remove(editor);
        _toolbarStatus.Text = "已取消文字编辑";
        PositionAnnotationToolbar();
    }

    private void UndoAnnotation()
    {
        if (_inlineTextEditor is not null)
        {
            CancelInlineTextEditor();
            return;
        }
        if (_annotationHistory.Count == 0) return;
        var last = _annotationHistory[^1];
        _annotationHistory.RemoveAt(_annotationHistory.Count - 1);
        _annotationCanvas.Children.Remove(last);
        if (ReferenceEquals(last, _selectedAnnotation)) HideAnnotationSelection();
    }

    private async Task SaveInlineAsync(bool copy)
    {
        if (_selectedRegion is null || string.IsNullOrWhiteSpace(_outputPath) || !_annotationToolbar.IsHitTestVisible) return;
        CommitInlineTextEditor();
        try
        {
            _toolbarStatus.Text = "正在保存…";
            _annotationToolbar.IsHitTestVisible = false;
            _captureBoard.UpdateLayout();
            var rendered = new RenderTargetBitmap();
            await rendered.RenderAsync(_captureBoard, _monitorBounds.Width, _monitorBounds.Height);
            var pixels = await rendered.GetPixelsAsync();
            var region = _selectedRegion.Value;
            var bounds = new RectInt32(0, 0, rendered.PixelWidth, rendered.PixelHeight);
            await Task.Run(() => NativeScreenshotCapture.SaveRegionPixelsAsPng(bounds, pixels.ToArray(), region, _outputPath));
            if (copy)
            {
                var imageFile = await StorageFile.GetFileFromPathAsync(_outputPath);
                var package = new DataPackage { RequestedOperation = DataPackageOperation.Copy };
                package.SetBitmap(RandomAccessStreamReference.CreateFromFile(imageFile));
                Clipboard.SetContent(package);
            }
            _annotationCompletion.TrySetResult(true);
            _window.Close();
        }
        catch (Exception ex)
        {
            _toolbarStatus.Text = $"保存失败：{ex.Message}";
            _toolbarStatus.Visibility = Visibility.Visible;
            _annotationToolbar.IsHitTestVisible = true;
        }
    }

    private void CompleteSelection()
    {
        if (_selectedRegion is not { } region ||
            region.Width < _minimumSelectionSize || region.Height < _minimumSelectionSize) return;
        _completion.TrySetResult(region);
        _window.Close();
    }

    private void CancelSelection()
    {
        CancelInlineTextEditor();
        if (_annotationMode)
        {
            _annotationCompletion.TrySetResult(false);
            _window.Close();
            return;
        }
        _completion.TrySetResult(null);
        _window.Close();
    }

    private Point ClampPoint(Point point) => new(
        Math.Clamp(point.X, 0, _surface.ActualWidth),
        Math.Clamp(point.Y, 0, _surface.ActualHeight));

    private RectInt32 ToPhysicalRect(Point start, Point end)
    {
        var left = Math.Min(start.X, end.X);
        var top = Math.Min(start.Y, end.Y);
        var right = Math.Max(start.X, end.X);
        var bottom = Math.Max(start.Y, end.Y);
        var scaleX = _monitorBounds.Width / _surface.ActualWidth;
        var scaleY = _monitorBounds.Height / _surface.ActualHeight;
        var x = Math.Clamp((int)Math.Round(left * scaleX), 0, _monitorBounds.Width);
        var y = Math.Clamp((int)Math.Round(top * scaleY), 0, _monitorBounds.Height);
        var width = Math.Clamp((int)Math.Round((right - left) * scaleX), 0, _monitorBounds.Width - x);
        var height = Math.Clamp((int)Math.Round((bottom - top) * scaleY), 0, _monitorBounds.Height - y);
        return new RectInt32(x, y, width, height);
    }

    private static void SetRect(Rectangle rectangle, double x, double y, double width, double height)
    {
        Canvas.SetLeft(rectangle, x);
        Canvas.SetTop(rectangle, y);
        rectangle.Width = Math.Max(0, width);
        rectangle.Height = Math.Max(0, height);
    }

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)] private static extern nint GetWindowLongPtr(nint hwnd, int index);
    [DllImport("user32.dll")] private static extern short GetKeyState(int virtualKey);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)] private static extern nint SetWindowLongPtr(nint hwnd, int index, nint value);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(nint hwnd, nint insertAfter, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] private static extern nint GetWindow(nint hwnd, uint command);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint hwnd);
    [DllImport("user32.dll", SetLastError = true)] private static extern uint GetWindowThreadProcessId(nint hwnd, out uint processId);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool GetWindowRect(nint hwnd, out NativeRect rect);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool GetCursorPos(out NativePoint point);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentProcessId();

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private static bool IsControlDown() => (GetKeyState(0x11) & 0x8000) != 0;
}

internal sealed class FrozenScreenshotPixels
{
    private readonly byte[] _bgraPixels;

    public FrozenScreenshotPixels(int width, int height, byte[] bgraPixels)
    {
        Width = width;
        Height = height;
        _bgraPixels = bgraPixels;
    }

    public int Width { get; }
    public int Height { get; }

    public void SaveRegion(string path, RectInt32 region) =>
        NativeScreenshotCapture.SaveRegionPixelsAsPng(new RectInt32(0, 0, Width, Height), _bgraPixels, region, path);

    public static async Task<FrozenScreenshotPixels> LoadAsync(string path)
    {
        var file = await StorageFile.GetFileFromPathAsync(path);
        using var stream = await file.OpenReadAsync();
        var decoder = await BitmapDecoder.CreateAsync(stream);
        var pixels = await decoder.GetPixelDataAsync(
            BitmapPixelFormat.Bgra8,
            BitmapAlphaMode.Ignore,
            new BitmapTransform(),
            ExifOrientationMode.IgnoreExifOrientation,
            ColorManagementMode.DoNotColorManage);
        return new FrozenScreenshotPixels((int)decoder.PixelWidth, (int)decoder.PixelHeight, pixels.DetachPixelData());
    }

    public Windows.UI.Color GetColor(int x, int y)
    {
        var offset = checked((y * Width + x) * 4);
        return Windows.UI.Color.FromArgb(255, _bgraPixels[offset + 2], _bgraPixels[offset + 1], _bgraPixels[offset]);
    }
}
