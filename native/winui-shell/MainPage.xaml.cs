using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.UI.Dispatching;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using Windows.ApplicationModel.DataTransfer;
using Windows.ApplicationModel;
using Windows.Graphics;
using Windows.Storage;
using Windows.Storage.Streams;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace Zhuageping_WinUI;

public sealed partial class MainPage : Page
{
    private readonly List<MonitorDisplay> _displays = [];
    private readonly ComboBox _displayPicker = new() { MinWidth = 290 };
    private readonly TextBlock _boundsText = new();
    private readonly TextBlock _workAreaText = new();
    private readonly TextBlock _statusText = new() { TextWrapping = TextWrapping.Wrap };
    private readonly TextBlock _screenshotStatus = new() { TextWrapping = TextWrapping.Wrap };
    private readonly TextBlock _pinStatus = new() { TextWrapping = TextWrapping.Wrap };
    private readonly StackPanel _screenshotLibraryRows = new() { Spacing = 12 };
    private readonly TextBlock _screenshotLibraryStatus = new() { TextWrapping = TextWrapping.Wrap };
    private readonly StackPanel _recordingLibraryRows = new() { Spacing = 12 };
    private readonly TextBlock _recordingLibraryStatus = new() { TextWrapping = TextWrapping.Wrap };
    private readonly TextBox _previewScreenshotDir = new() { PlaceholderText = "预览截图输出目录" };
    private readonly TextBox _recordingOutputDir = new() { PlaceholderText = "录屏输出目录" };
    private readonly ComboBox _recordingMode = Combo("整个显示器", "识别窗口", "自定义区域");
    private readonly TextBlock _recordingStatus = new() { TextWrapping = TextWrapping.Wrap };
    private readonly TextBlock _topmostStatus = new() { Text = "置顶：待验证" };
    private readonly TextBlock _clickThroughStatus = new() { Text = "鼠标穿透：待验证" };
    private readonly TextBlock _captureStatus = new() { Text = "采集排除：待验证" };
    private readonly CheckBox _startPreference = new() { Content = "开机启动" };
    private readonly TextBlock _startupTaskStatus = new() { TextWrapping = TextWrapping.Wrap };
    private readonly CheckBox _responsivePreference = new() { Content = "保持快速响应偏好", IsChecked = true };
    private readonly CheckBox _autoBackup = new() { Content = "自动备份" };
    private readonly CheckBox _runAsAdmin = new() { Content = "以管理员身份运行" };
    private readonly CheckBox _trayMenu = new() { Content = "增强托盘菜单" };
    private readonly CheckBox _autoCopy = new() { Content = "截图后自动复制", IsChecked = true };
    private readonly CheckBox _autoPin = new() { Content = "截图后自动钉图" };
    private readonly CheckBox _watermarkEnabled = new() { Content = "启用时间与位置水印", IsChecked = true };
    private readonly CheckBox _recordingMic = new() { Content = "录制麦克风" };
    private readonly CheckBox _recordingCountdown = new() { Content = "录制前倒计时", IsChecked = true };
    private readonly CheckBox _recordingShowCursor = new() { Content = "录制鼠标指针", IsChecked = true };
    private readonly CheckBox _recordingClickHighlight = new() { Content = "显示鼠标点击高亮", IsChecked = true };
    private readonly CheckBox _previewHotkeyEnabled = new() { Content = "启用全局快捷键" };
    private readonly TextBlock _previewHotkeyStatus = new() { TextWrapping = TextWrapping.Wrap };
    private readonly TextBox _shortcutCapture = new() { Text = "F1" };
    private readonly TextBox _shortcutCaptureCopy = new() { Text = "Ctrl+F1" };
    private readonly TextBox _shortcutArea = new() { Text = "Shift+F1" };
    private readonly TextBox _shortcutScrollCapture = new() { Text = "Ctrl+Shift+F1" };
    private readonly TextBox _shortcutPin = new() { Text = "F3" };
    private readonly TextBox _shortcutTogglePins = new() { Text = "Shift+F3" };
    private readonly TextBox _location = new() { PlaceholderText = "位置" };
    private readonly TextBox _project = new() { PlaceholderText = "项目" };
    private readonly TextBox _note = new() { PlaceholderText = "备注" };
    private readonly TextBox _screenshotDir = new() { PlaceholderText = "截图保存目录" };
    private readonly ComboBox _language = Combo("简体中文", "English");
    private readonly ComboBox _theme = Combo("跟随系统", "浅色", "深色");
    private readonly ComboBox _outputFormat = Combo("PNG", "JPG");
    private readonly ComboBox _watermarkPosition = Combo("左上", "右上", "左下", "右下", "底栏");
    private readonly ComboBox _recordingFps = Combo("15", "30", "60");
    private readonly ComboBox _recordingQuality = Combo("标准", "高清", "省空间");
    private readonly TextBlock _settingsStatus = new() { TextWrapping = TextWrapping.Wrap };
    private readonly TextBlock _footerStatus = new() { Text = "准备就绪" };
    private readonly TextBlock _migrationStatus = new() { TextWrapping = TextWrapping.Wrap };
    private readonly TextBlock _diagnosticsText = new() { TextWrapping = TextWrapping.Wrap, FontFamily = new FontFamily("Consolas") };
    private readonly string _settingsFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Zhuageping.WinUI", "preview-settings.json");
    private readonly string _stagedElectronSettingsFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Zhuageping.WinUI", "electron-settings-import.json");
    private readonly TextBlock _title = new() { Text = "原生录屏窗口验证", FontSize = 24, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold };
    private RecordingFrameSet? _frame;
    private bool _loadingDisplays;
    private bool _loadingSettings;
    private PreviewSettings _previewSettings = new();
    private NativeHotKeyService? _previewHotKey;
    private RecorderHostSession? _recorderSession;
    private RecordingControlWindow? _recordingControl;
    private RecordingFrameSet? _recordingFrame;
    private DispatcherQueueTimer? _recordingTimer;
    private readonly Stopwatch _recordingClock = new();
    private readonly SemaphoreSlim _recordingCommandLock = new(1, 1);
    private bool _recordingStopRequested;
    private bool _shortcutCaptureRunning;
    private string? _lastCapturePath;

    private enum RecordingState
    {
        Idle,
        Starting,
        Recording,
        Paused,
        Stopping
    }

    private RecordingState _recordingState;

    public MainPage()
    {
        InitializeComponent();
        Content = BuildPage();
        Loaded += (_, _) => RefreshDisplays();
        Loaded += async (_, _) => await RefreshStartupTaskStatusAsync();
        Unloaded += (_, _) =>
        {
            HideFrame();
            _recordingControl?.Dispose();
            _recordingControl = null;
            _recordingFrame?.Dispose();
            _recordingFrame = null;
        };
    }

    private UIElement BuildPage()
    {
        foreach (var checkBox in new[]
        {
            _startPreference, _responsivePreference, _autoBackup, _runAsAdmin, _trayMenu,
            _autoCopy, _autoPin, _watermarkEnabled, _recordingMic, _recordingCountdown,
            _recordingShowCursor, _recordingClickHighlight, _previewHotkeyEnabled
        }) StyleCheckBox(checkBox);
        foreach (var textBlock in new[]
        {
            _boundsText, _workAreaText, _statusText, _screenshotStatus, _pinStatus,
            _recordingStatus, _startupTaskStatus, _previewHotkeyStatus, _settingsStatus,
            _footerStatus, _migrationStatus, _diagnosticsText
        }) textBlock.Foreground = Brush("TextFillColorPrimaryBrush");

        var root = new Grid { Background = Brush("AppBackground") };
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        var main = new Grid();
        main.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(132) });
        main.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var sidebar = new Border
        {
            Background = Brush("SidebarBackground"),
            BorderBrush = Brush("CardStrokeColorDefaultBrush"),
            BorderThickness = new Thickness(0, 0, 1, 0)
        };
        var sidebarStack = new StackPanel { Padding = new Thickness(8, 10, 8, 8), Spacing = 2 };
        sidebar.Child = sidebarStack;
        main.Children.Add(sidebar);

        var content = new ScrollViewer
        {
            Padding = new Thickness(20, 16, 24, 20),
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalContentAlignment = HorizontalAlignment.Stretch
        };
        var contentRoot = new StackPanel { Spacing = 18, MaxWidth = 760, HorizontalAlignment = HorizontalAlignment.Stretch };
        var header = new Border
        {
            Padding = new Thickness(0, 0, 0, 10),
            BorderBrush = Brush("CardStrokeColorDefaultBrush"),
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = _title
        };
        _title.FontSize = 22;
        _title.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
        _title.Foreground = Brush("TextFillColorPrimaryBrush");
        contentRoot.Children.Add(header);
        var pageHost = new Grid();
        contentRoot.Children.Add(pageHost);
        content.Content = contentRoot;
        Grid.SetColumn(content, 1);
        main.Children.Add(content);
        Grid.SetRow(main, 0);
        root.Children.Add(main);

        var footer = new Border
        {
            Background = Brush("FooterBackground"),
            BorderBrush = Brush("CardStrokeColorDefaultBrush"),
            BorderThickness = new Thickness(0, 1, 0, 0),
            Padding = new Thickness(16, 7, 14, 7)
        };
        var footerGrid = new Grid();
        footerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        footerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        footerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        _footerStatus.FontSize = 12;
        _footerStatus.Foreground = Brush("TextFillColorSecondaryBrush");
        footerGrid.Children.Add(_footerStatus);
        var resetButton = ActionButton("恢复默认", "\uE72A");
        resetButton.Click += (_, _) => RestoreDefaults();
        Grid.SetColumn(resetButton, 2);
        footerGrid.Children.Add(resetButton);
        footer.Child = footerGrid;
        Grid.SetRow(footer, 1);
        root.Children.Add(footer);

        var pages = new Dictionary<string, StackPanel>();
        var navButtons = new Dictionary<string, Button>();
        var titles = new Dictionary<string, string>
        {
            ["general"] = "常规",
            ["capture"] = "截屏",
            ["recording"] = "录屏",
            ["pin"] = "贴图",
            ["output"] = "输出",
            ["control"] = "控制",
            ["about"] = "关于"
        };

        StackPanel PageStack() => new() { Spacing = 16 };
        TextBlock SectionTitle(string text) => new()
        {
            Text = text,
            FontSize = 14,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            Foreground = Brush("TextFillColorPrimaryBrush")
        };
        Border Section(string title, params UIElement[] children)
        {
            var stack = new StackPanel { Spacing = 9 };
            stack.Children.Add(SectionTitle(title));
            foreach (var child in children) stack.Children.Add(child);
            return new Border
            {
                Padding = new Thickness(0, 0, 0, 16),
                Margin = new Thickness(0, 0, 0, 0),
                BorderBrush = Brush("CardStrokeColorDefaultBrush"),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Child = stack
            };
        }
        Grid TwoColumns(FrameworkElement left, FrameworkElement right)
        {
            var grid = new Grid { ColumnSpacing = 22 };
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.Children.Add(left);
            Grid.SetColumn(right, 1);
            grid.Children.Add(right);
            return grid;
        }
        StackPanel ActionRow(params Button[] buttons)
        {
            var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
            foreach (var button in buttons) row.Children.Add(button);
            return row;
        }
        void AddPage(string key, StackPanel page)
        {
            page.Visibility = Visibility.Collapsed;
            pages[key] = page;
            pageHost.Children.Add(page);
        }
        void SelectPage(string key)
        {
            foreach (var pair in pages) pair.Value.Visibility = pair.Key == key ? Visibility.Visible : Visibility.Collapsed;
            foreach (var pair in navButtons)
            {
                var selected = pair.Key == key;
                pair.Value.Background = Brush(selected ? "NavSelectedBackground" : "TransparentBackground");
                pair.Value.BorderBrush = Brush(selected ? "AccentBrush" : "TransparentBackground");
                pair.Value.BorderThickness = new Thickness(selected ? 3 : 0, 0, 0, 0);
                var foreground = Brush(selected ? "AccentBrush" : "TextFillColorSecondaryBrush");
                pair.Value.Foreground = foreground;
                if (pair.Value.Content is UIElement contentElement) SetContentForeground(contentElement, foreground);
            }
            _title.Text = titles[key];
            content.ChangeView(null, 0, null);
            if (key == "output")
            {
                _previewScreenshotDir.Text = string.IsNullOrWhiteSpace(_previewSettings.PreviewScreenshotDir) ? DefaultPreviewCaptureDirectory() : _previewSettings.PreviewScreenshotDir;
                _recordingOutputDir.Text = string.IsNullOrWhiteSpace(_previewSettings.RecordingOutputDir) ? DefaultPreviewRecordingDirectory() : _previewSettings.RecordingOutputDir;
            }
        }
        Button NavButton(string key, string text, string glyph)
        {
            var button = new Button
            {
                Height = 42,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                Padding = new Thickness(10, 0, 8, 0),
                BorderThickness = new Thickness(0),
                Background = Brush("TransparentBackground"),
                Foreground = Brush("TextFillColorSecondaryBrush"),
                Content = new StackPanel
                {
                    Orientation = Orientation.Horizontal,
                    Spacing = 12,
                    VerticalAlignment = VerticalAlignment.Center,
                    Children = { OverlayChrome.Icon(glyph, 17), new TextBlock { Text = text, FontSize = 13, VerticalAlignment = VerticalAlignment.Center } }
                }
            };
            AutomationProperties.SetName(button, text);
            SetContentForeground((UIElement)button.Content, Brush("TextFillColorSecondaryBrush"));
            button.Click += (_, _) => SelectPage(key);
            navButtons[key] = button;
            sidebarStack.Children.Add(button);
            return button;
        }

        NavButton("general", "常规", "\uE713");
        NavButton("capture", "截屏", "\uE8A7");
        NavButton("recording", "录屏", "\uE714");
        NavButton("pin", "贴图", "\uE718");
        NavButton("output", "输出", "\uE8B7");
        NavButton("control", "控制", "\uE765");
        NavButton("about", "关于", "\uE946");

        var general = PageStack();
        var runtimeLeft = new StackPanel { Spacing = 8, Children = { _startPreference, _autoBackup, _runAsAdmin } };
        var runtimeRight = new StackPanel { Spacing = 8, Children = { _responsivePreference, _trayMenu } };
        general.Children.Add(Section("启动与响应", TwoColumns(runtimeLeft, runtimeRight)));
        general.Children.Add(_startupTaskStatus);
        general.Children.Add(Section("语言和外观", Field("界面语言", _language), Field("主题", _theme)));
        var updatePanel = new Border
        {
            Padding = new Thickness(12),
            Background = Brush("UpdateBackground"),
            BorderBrush = Brush("CardStrokeColorDefaultBrush"),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(6)
        };
        var updateStack = new StackPanel { Spacing = 8 };
        updateStack.Children.Add(SectionTitle("软件更新"));
        var updateMeta = new Grid { ColumnSpacing = 18 };
        updateMeta.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        updateMeta.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        updateMeta.Children.Add(new TextBlock { Text = "当前版本  0.1.27", Foreground = Brush("TextFillColorSecondaryBrush") });
        var latest = new TextBlock { Text = "最新版本  -", Foreground = Brush("TextFillColorSecondaryBrush") };
        Grid.SetColumn(latest, 1);
        updateMeta.Children.Add(latest);
        updateStack.Children.Add(updateMeta);
        updateStack.Children.Add(new TextBlock { Text = "可手动检查新版本，正式安装版启动后也会自动静默检查。", FontSize = 12, Foreground = Brush("TextFillColorSecondaryBrush"), TextWrapping = TextWrapping.Wrap });
        var updateButton = ActionButton("检查更新", "\uE72C");
        updateButton.Click += (_, _) => _settingsStatus.Text = "当前预览版已是最新版本。";
        updateStack.Children.Add(updateButton);
        updatePanel.Child = updateStack;
        general.Children.Add(updatePanel);
        var dataPath = new TextBox { Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Zhuageping.WinUI"), IsReadOnly = true };
        general.Children.Add(Section("高级设置", Field("日志级别", Combo("普通", "详细", "静默")), Field("路径", dataPath), ActionRow(ActionButton("打开配置文件夹", "\uE8B7"), ActionButton("打开日志文件夹", "\uE8B7"), ActionButton("复制诊断信息", "\uE8C8"), ActionButton("以管理员身份重启", "\uE7EF"))));
        AddPage("general", general);

        var capture = PageStack();
        var captureRowOne = ActionRow(
            ActionButton("全屏截图", "\uE74E", true),
            ActionButton("全屏截图并复制", "\uE8C8"),
            ActionButton("区域截图", "\uE7C5"));
        var fullCapture = (Button)captureRowOne.Children[0];
        var copyCapture = (Button)captureRowOne.Children[1];
        var regionCapture = (Button)captureRowOne.Children[2];
        fullCapture.Click += (_, _) => _ = CaptureSelectedDisplayAsync(false, false, fullCapture);
        copyCapture.Click += (_, _) => _ = CaptureSelectedDisplayAsync(true, false, copyCapture);
        regionCapture.Click += (_, _) => _ = CaptureSelectedDisplayAsync(_autoCopy.IsChecked == true, true, regionCapture);
        var captureRowTwo = ActionRow(ActionButton("滚动截图", "\uE7C5"), ActionButton("贴图", "\uE718"));
        ((Button)captureRowTwo.Children[0]).Click += (_, _) => _screenshotStatus.Text = "滚动截图将在滚动采集迁移完成后启用。";
        ((Button)captureRowTwo.Children[1]).Click += (_, _) => _ = PinLatestCaptureAsync();
        capture.Children.Add(Section("截屏", captureRowOne, captureRowTwo));
        capture.Children.Add(Section("截屏设置", Field("默认项目", _project), Field("备注", _note), Field("水印位置", _watermarkPosition), _watermarkEnabled, _autoCopy));
        capture.Children.Add(_screenshotStatus);
        AddPage("capture", capture);

        var recording = PageStack();
        recording.Children.Add(Section("屏幕录制", Field("录制显示器", _displayPicker), _recordingStatus));
        recording.Children.Add(new TextBlock
        {
            Text = "开始、暂停和停止均由桌面底部 Dock 控制。",
            Foreground = Brush("TextFillColorSecondaryBrush"),
            TextWrapping = TextWrapping.Wrap
        });
        recording.Children.Add(Section("录屏设置", Field("帧率", _recordingFps), Field("画质", _recordingQuality), _recordingMic, _recordingCountdown, _recordingShowCursor, _recordingClickHighlight));
        var openLatest = ActionButton("打开最新录屏", "\uE8B7");
        openLatest.Click += (_, _) => OpenRecordingFolder();
        recording.Children.Add(openLatest);
        AddPage("recording", recording);

        var pin = PageStack();
        var pinLatest = ActionButton("贴最近截图", "\uE718", true);
        pinLatest.Click += (_, _) => _ = PinLatestCaptureAsync();
        var togglePins = ActionButton("显示/隐藏所有贴图", "\uE718");
        togglePins.Click += (_, _) => ToggleAllPins();
        pin.Children.Add(Section("贴图", ActionRow(pinLatest, togglePins), _autoPin, _pinStatus));
        AddPage("pin", pin);

        var output = PageStack();
        var openScreenshots = ActionButton("打开文件夹", "\uE8B7");
        openScreenshots.Click += (_, _) => OpenOutputFolder(_previewScreenshotDir, DefaultPreviewCaptureDirectory());
        var chooseScreenshots = ActionButton("更改", "\uE70F");
        chooseScreenshots.Click += async (_, _) => await ChooseOutputFolderAsync(_previewScreenshotDir, PickerLocationId.PicturesLibrary, RefreshScreenshotLibrary);
        output.Children.Add(Section("截图保存位置", Field("路径", _previewScreenshotDir), ActionRow(openScreenshots, chooseScreenshots)));
        var openRecordings = ActionButton("打开文件夹", "\uE8B7");
        openRecordings.Click += (_, _) => OpenRecordingFolder();
        var chooseRecordings = ActionButton("更改", "\uE70F");
        chooseRecordings.Click += async (_, _) => await ChooseOutputFolderAsync(_recordingOutputDir, PickerLocationId.VideosLibrary, RefreshRecordingLibrary);
        output.Children.Add(Section("录屏保存位置", Field("路径", _recordingOutputDir), ActionRow(openRecordings, chooseRecordings)));
        output.Children.Add(Section("格式和历史", Field("图片格式", _outputFormat), Field("录屏格式", new TextBox { Text = "MP4", IsReadOnly = true }), new TextBlock { Text = "截图和录屏文件均按最新修改时间排序。", Foreground = Brush("TextFillColorSecondaryBrush") }));
        AddPage("output", output);

        var control = PageStack();
        control.Children.Add(Section("快捷键", _previewHotkeyEnabled, _previewHotkeyStatus,
            Field("截图", _shortcutCapture), Field("截图并复制", _shortcutCaptureCopy), Field("自定义截图", _shortcutArea), Field("滚动截图", _shortcutScrollCapture), Field("贴图", _shortcutPin), Field("显示/隐藏贴图", _shortcutTogglePins)));
        var clearHistory = ActionButton("清除历史记录", "\uE74D");
        clearHistory.Click += (_, _) => { RefreshScreenshotLibrary(); RefreshRecordingLibrary(); _settingsStatus.Text = "历史记录已刷新。"; };
        control.Children.Add(clearHistory);
        AddPage("control", control);

        var about = PageStack();
        var aboutBrand = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12 };
        aboutBrand.Children.Add(OverlayChrome.Icon("\uE8A7", 34));
        aboutBrand.Children.Add(new StackPanel { Spacing = 2, Children = { new TextBlock { Text = "抓个屏", FontSize = 16, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold }, new TextBlock { Text = "Windows local screenshot tool", Foreground = Brush("TextFillColorSecondaryBrush") } } });
        about.Children.Add(aboutBrand);
        about.Children.Add(new TextBlock { Text = "作者：Qi Shiyou\n邮箱：blacklaw@foxmail.com\n本地截图、贴图、时间与位置水印工具。\n不使用云端，不需要账户，不上传文件。", TextWrapping = TextWrapping.Wrap, Foreground = Brush("TextFillColorSecondaryBrush") });
        var privacy = new Border { Padding = new Thickness(12), Background = Brush("UpdateBackground"), BorderBrush = Brush("CardStrokeColorDefaultBrush"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(6) };
        var privacyStack = new StackPanel { Spacing = 8 };
        privacyStack.Children.Add(SectionTitle("隐私策略"));
        privacyStack.Children.Add(new TextBlock { Text = "生效日期：2026年10月6日", Foreground = Brush("TextFillColorSecondaryBrush") });
        privacyStack.Children.Add(new TextBlock
        {
            Text = "抓个屏以本地处理为主。除检查软件更新、截图、录屏、OCR 结果及设置外，应用不会将内容上传到我们的服务器。",
            Foreground = Brush("TextFillColorPrimaryBrush"),
            TextWrapping = TextWrapping.Wrap
        });
        var policyButton = ActionButton("查看在线隐私策略", "\uE8A7");
        policyButton.Click += (_, _) => Process.Start(new ProcessStartInfo("https://github.com/ShiyouQi888/zhuageping/blob/main/PRIVACY.md") { UseShellExecute = true });
        privacyStack.Children.Add(policyButton);
        privacy.Child = privacyStack;
        about.Children.Add(privacy);
        AddPage("about", about);

        // Enumerate displays before registering global shortcuts so the first
        // shortcut press after launch can execute immediately.
        RefreshDisplays();
        LoadPreviewSettings();
        WireSettingsControls();
        _startPreference.Checked += StartupPreference_Changed;
        _startPreference.Unchecked += StartupPreference_Changed;
        _previewHotkeyEnabled.Checked += PreviewHotkeyEnabled_Changed;
        _previewHotkeyEnabled.Unchecked += PreviewHotkeyEnabled_Changed;
        _displayPicker.SelectionChanged += (_, _) =>
        {
            if (!_loadingDisplays)
            {
                UpdateDisplayDetails();
                if (_frame is not null) ShowSelectedFrame();
            }
        };
        SelectPage("general");
        return root;
    }

    private UIElement BuildLegacyPage()
    {
        var navigation = new NavigationView
        {
            IsBackButtonVisible = NavigationViewBackButtonVisible.Collapsed,
            IsSettingsVisible = false,
            PaneDisplayMode = NavigationViewPaneDisplayMode.Left,
            IsPaneOpen = true,
            IsPaneToggleButtonVisible = true,
            OpenPaneLength = 204,
            CompactPaneLength = 56,
            Background = Brush("AppBackground"),
            Foreground = Brush("TextFillColorPrimaryBrush")
        };
        navigation.Resources["NavigationViewDefaultPaneBackground"] = Brush("SidebarBackground");
        navigation.Resources["NavigationViewTopPaneBackground"] = Brush("SidebarBackground");
        navigation.Resources["NavigationViewContentBackground"] = Brush("AppBackground");
        navigation.PaneHeader = new Border
        {
            Padding = new Thickness(14, 12, 10, 14),
            Child = new StackPanel
            {
                Spacing = 4,
                Children =
                {
                    new StackPanel
                    {
                        Orientation = Orientation.Horizontal,
                         Spacing = 8,
                        Children =
                        {
                            OverlayChrome.Icon("\uE8A7", 20),
                            new TextBlock
                            {
                                Text = "抓个屏",
                                 FontSize = 15,
                                FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                                Foreground = Brush("TextFillColorPrimaryBrush")
                            }
                        }
                    },
                    new TextBlock
                    {
                        Text = "Windows App SDK 预览",
                        FontSize = 11,
                        Foreground = Brush("TextFillColorSecondaryBrush")
                    }
                }
            }
        };
        navigation.PaneFooter = new Border
        {
            Padding = new Thickness(16, 12, 12, 16),
            Child = new TextBlock
            {
                Text = "预览模式 · 本地处理",
                FontSize = 11,
                Foreground = Brush("TextFillColorSecondaryBrush")
            }
        };
        var screenshotLibraryItem = new NavigationViewItem { Content = "截图", Tag = "library-captures", Icon = OverlayChrome.Icon("\uE8A7", 20) };
        var recordingLibraryItem = new NavigationViewItem { Content = "录屏", Tag = "library-recordings", Icon = OverlayChrome.Icon("\uE714", 20) };
        navigation.MenuItems.Add(screenshotLibraryItem);
        navigation.MenuItems.Add(recordingLibraryItem);
        navigation.MenuItems.Add(new NavigationViewItem { Content = "常规设置", Tag = "settings", Icon = OverlayChrome.Icon("\uE713", 20) });
        navigation.MenuItems.Add(new NavigationViewItem { Content = "迁移计划", Tag = "plan", Icon = OverlayChrome.Icon("\uE8A5", 20) });
        var body = new StackPanel
        {
            Spacing = 12,
            Width = 980,
            MaxWidth = 1040,
            HorizontalAlignment = HorizontalAlignment.Stretch
        };
        body.Children.Add(new Border
        {
            Background = Brush("HeaderBackground"),
            BorderBrush = Brush("CardStrokeColorDefaultBrush"),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(14, 11, 14, 11),
            Child = new StackPanel
            {
                Spacing = 3,
                Children =
                {
                    _title,
                    new TextBlock
                    {
                        Text = "选择屏幕，完成截图、标注和录屏工作流。",
                        Foreground = Brush("TextFillColorSecondaryBrush"),
                        FontSize = 12
                    }
                }
            }
        });
        body.Children.Add(new TextBlock
        {
            Text = "截图与录屏使用所选显示器；录屏由独立原生 RecorderHost 执行，控制窗在启动前验证采集排除。",
            Foreground = Brush("TextFillColorSecondaryBrush"),
            TextWrapping = TextWrapping.Wrap,
            Visibility = Visibility.Collapsed
        });

        var displayCard = Card();
        displayCard.Child = new StackPanel { Spacing = 10, HorizontalAlignment = HorizontalAlignment.Stretch };
        var displayStack = (StackPanel)displayCard.Child;
        StyleInput(_displayPicker);
        _displayPicker.Width = 360;
        _displayPicker.HorizontalAlignment = HorizontalAlignment.Stretch;
        displayStack.Children.Add(SectionHeading("CAPTURE SOURCE", "显示器", "目标屏幕使用完整物理像素范围，包含任务栏。"));
        displayStack.Children.Add(_displayPicker);

        displayStack.Children.Add(MetricTile("完整范围", _boundsText));
        displayStack.Children.Add(MetricTile("工作区", _workAreaText));

        var controls = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        var showButton = ActionButton("显示测试边框", "\uE7C5");
        showButton.Click += ShowFrame_Click;
        controls.Children.Add(showButton);
        var hideButton = ActionButton("隐藏边框", "\uE711");
        hideButton.Click += HideFrame_Click;
        controls.Children.Add(hideButton);
        var refreshButton = ActionButton("刷新显示器", "\uE72C");
        refreshButton.Click += RefreshDisplays_Click;
        controls.Children.Add(refreshButton);
        displayStack.Children.Add(controls);
        body.Children.Add(displayCard);

        var screenshotLibraryCard = Card();
        screenshotLibraryCard.Child = new StackPanel { Spacing = 12 };
        var screenshotLibraryStack = (StackPanel)screenshotLibraryCard.Child;
        screenshotLibraryStack.Children.Add(SectionHeading("SCREENSHOT LIBRARY", "截图", "浏览截图输出文件夹中的全部图片，最新内容显示在最上方。"));
        var screenshotLibraryHeader = new Grid { ColumnSpacing = 8 };
        screenshotLibraryHeader.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        screenshotLibraryHeader.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        screenshotLibraryHeader.Children.Add(_screenshotLibraryStatus);
        var refreshScreenshotLibraryButton = ActionButton("刷新", "\uE72C");
        refreshScreenshotLibraryButton.Click += (_, _) => RefreshScreenshotLibrary();
        Grid.SetColumn(refreshScreenshotLibraryButton, 1);
        screenshotLibraryHeader.Children.Add(refreshScreenshotLibraryButton);
        screenshotLibraryStack.Children.Add(screenshotLibraryHeader);
        screenshotLibraryStack.Children.Add(_screenshotLibraryRows);
        screenshotLibraryCard.Visibility = Visibility.Collapsed;
        body.Children.Add(screenshotLibraryCard);

        var recordingLibraryCard = Card();
        recordingLibraryCard.Child = new StackPanel { Spacing = 12 };
        var recordingLibraryStack = (StackPanel)recordingLibraryCard.Child;
        recordingLibraryStack.Children.Add(SectionHeading("RECORDING LIBRARY", "录屏", "浏览录屏输出文件夹中的全部视频，最新内容显示在最上方。"));
        var recordingLibraryHeader = new Grid { ColumnSpacing = 8 };
        recordingLibraryHeader.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        recordingLibraryHeader.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        recordingLibraryHeader.Children.Add(_recordingLibraryStatus);
        var refreshRecordingLibraryButton = ActionButton("刷新", "\uE72C");
        refreshRecordingLibraryButton.Click += (_, _) => RefreshRecordingLibrary();
        Grid.SetColumn(refreshRecordingLibraryButton, 1);
        recordingLibraryHeader.Children.Add(refreshRecordingLibraryButton);
        recordingLibraryStack.Children.Add(recordingLibraryHeader);
        recordingLibraryStack.Children.Add(_recordingLibraryRows);
        recordingLibraryCard.Visibility = Visibility.Collapsed;
        body.Children.Add(recordingLibraryCard);

        var screenshotCard = Card();
        screenshotCard.Child = new StackPanel { Spacing = 8 };
        var screenshotStack = (StackPanel)screenshotCard.Child;
        screenshotStack.Children.Add(SectionHeading("SCREENSHOT WORKFLOW", "截图与标注", "全屏、区域、标注和钉图都在当前工作流完成。"));
        screenshotStack.Children.Add(Field("预览输出目录", _previewScreenshotDir));
        var captureActions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        var saveCaptureButton = ActionButton("全屏截图并保存", "\uE74E", primary: true);
        saveCaptureButton.Click += (_, _) => _ = CaptureSelectedDisplayAsync(copyToClipboard: false, selectRegion: false, saveCaptureButton);
        var copyCaptureButton = ActionButton("截图并复制", "\uE8C8");
        copyCaptureButton.Click += (_, _) => _ = CaptureSelectedDisplayAsync(copyToClipboard: true, selectRegion: false, copyCaptureButton);
        var regionCaptureButton = ActionButton("区域截图", "\uE7C5");
        regionCaptureButton.Click += (_, _) => _ = CaptureSelectedDisplayAsync(copyToClipboard: false, selectRegion: true, regionCaptureButton);
        var fullAnnotationButton = ActionButton("全屏标注", "\uE70F");
        fullAnnotationButton.Click += (_, _) => _ = CaptureSelectedDisplayAsync(copyToClipboard: false, selectRegion: false, sourceButton: fullAnnotationButton, annotate: true);
        var regionAnnotationButton = ActionButton("区域标注", "\uE70F");
        regionAnnotationButton.Click += (_, _) => _ = CaptureSelectedDisplayAsync(copyToClipboard: false, selectRegion: true, sourceButton: regionAnnotationButton, annotate: true);
        captureActions.Children.Add(saveCaptureButton);
        captureActions.Children.Add(copyCaptureButton);
        captureActions.Children.Add(regionCaptureButton);
        captureActions.Children.Add(fullAnnotationButton);
        captureActions.Children.Add(regionAnnotationButton);
        screenshotStack.Children.Add(captureActions);
        var pinActions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        var togglePinsButton = ActionButton("显示/隐藏所有贴图", "\uE718");
        togglePinsButton.Click += (_, _) =>
        {
            var visible = PinnedImageWindow.ToggleAllVisibility();
            _pinStatus.Text = visible ? "所有贴图已显示。" : "所有贴图已隐藏。";
        };
        pinActions.Children.Add(togglePinsButton);
        var restorePinsButton = ActionButton("恢复贴图鼠标交互", "\uE72C");
        restorePinsButton.Click += (_, _) =>
        {
            PinnedImageWindow.SetAllClickThrough(false);
            _pinStatus.Text = "已关闭所有贴图的鼠标穿透。";
        };
        pinActions.Children.Add(restorePinsButton);
        screenshotStack.Children.Add(pinActions);
        screenshotStack.Children.Add(_pinStatus);
        screenshotStack.Children.Add(_screenshotStatus);
        body.Children.Add(screenshotCard);

        var statusCard = Card();
        statusCard.Visibility = Visibility.Collapsed;
        statusCard.Child = new StackPanel { Spacing = 8 };
        var checks = (StackPanel)statusCard.Child;
        checks.Children.Add(SectionHeading("RECORDING READINESS", "录制准备", "开始录制前自动检查控制窗状态，避免控制条进入视频。"));
        var readinessGrid = new Grid { ColumnSpacing = 12, HorizontalAlignment = HorizontalAlignment.Stretch };
        readinessGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        readinessGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        readinessGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        AddCell(readinessGrid, StatusTile("置顶显示", _topmostStatus), 0, 0);
        AddCell(readinessGrid, StatusTile("鼠标交互", _clickThroughStatus), 0, 1);
        AddCell(readinessGrid, StatusTile("采集排除", _captureStatus), 0, 2);
        checks.Children.Add(readinessGrid);
        checks.Children.Add(_statusText);
        checks.Children.Add(SectionHeading("RECORDING WORKFLOW", "屏幕录制", "先选择录制范围，再启动；窗口或区域需在屏幕上确认选区后才会开始录制。"));
        checks.Children.Add(Field("保存到", _recordingOutputDir));
        var openRecordingFolderButton = ActionButton("打开文件夹", "\uE8B7");
        openRecordingFolderButton.Click += (_, _) => OpenRecordingFolder();
        checks.Children.Add(new TextBlock
        {
            Text = "开始、暂停和停止均在桌面底部 Dock 控制。Dock 中选择范围并开始；区域录制拖出矩形后松开即确认。",
            Foreground = Brush("TextFillColorSecondaryBrush"),
            TextWrapping = TextWrapping.Wrap
        });
        checks.Children.Add(openRecordingFolderButton);
        checks.Children.Add(_recordingStatus);
        body.Children.Add(statusCard);

        var settingsCard = Card();
        settingsCard.Visibility = Visibility.Collapsed;
        settingsCard.Child = new StackPanel { Spacing = 8 };
        var settings = (StackPanel)settingsCard.Child;
        settings.Children.Add(new TextBlock { Text = "启动与响应", FontSize = 16, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        settings.Children.Add(new TextBlock
        {
            Text = "偏好保存在独立预览配置；开机启动由 Windows 启动任务管理，不会改写正式版设置。",
            Foreground = Brush("TextFillColorSecondaryBrush"),
            TextWrapping = TextWrapping.Wrap
        });
        settings.Children.Add(_startPreference);
        settings.Children.Add(_startupTaskStatus);
        settings.Children.Add(_responsivePreference);
        settings.Children.Add(_previewHotkeyEnabled);
        settings.Children.Add(_previewHotkeyStatus);
        settings.Children.Add(new TextBlock { Text = "快捷键", FontSize = 16, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        settings.Children.Add(Field("截图", _shortcutCapture));
        settings.Children.Add(Field("截图并复制", _shortcutCaptureCopy));
        settings.Children.Add(Field("区域截图", _shortcutArea));
        settings.Children.Add(Field("滚动截图", _shortcutScrollCapture));
        settings.Children.Add(new TextBlock { Text = "录屏：F2（单击识别窗口，拖拽框选自定义区域）", Foreground = Brush("TextFillColorSecondaryBrush") });
        settings.Children.Add(Field("钉图", _shortcutPin));
        settings.Children.Add(Field("显示/隐藏贴图", _shortcutTogglePins));
        settings.Children.Add(_autoBackup);
        settings.Children.Add(_runAsAdmin);
        settings.Children.Add(_trayMenu);
        settings.Children.Add(new TextBlock { Text = "截图与输出", FontSize = 16, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        settings.Children.Add(Field("默认位置", _location));
        settings.Children.Add(Field("默认项目", _project));
        settings.Children.Add(Field("备注", _note));
        settings.Children.Add(Field("截图目录", _screenshotDir));
        settings.Children.Add(Field("界面语言", _language));
        settings.Children.Add(Field("主题", _theme));
        settings.Children.Add(Field("图片格式", _outputFormat));
        settings.Children.Add(Field("水印位置", _watermarkPosition));
        settings.Children.Add(_watermarkEnabled);
        settings.Children.Add(_autoCopy);
        settings.Children.Add(_autoPin);
        settings.Children.Add(new TextBlock { Text = "录屏偏好", FontSize = 16, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        settings.Children.Add(Field("帧率", _recordingFps));
        settings.Children.Add(Field("画质", _recordingQuality));
        settings.Children.Add(_recordingMic);
        settings.Children.Add(_recordingCountdown);
        settings.Children.Add(_recordingShowCursor);
        settings.Children.Add(_recordingClickHighlight);
        settings.Children.Add(_settingsStatus);
        settings.Children.Add(new TextBlock { Text = "配置迁移演练", FontSize = 16, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        settings.Children.Add(new TextBlock
        {
            Text = "选择正式版 settings.json。只读取并复制到预览目录，不会修改正式版配置。",
            Foreground = Brush("TextFillColorSecondaryBrush"),
            TextWrapping = TextWrapping.Wrap
        });
        var importButton = new Button { Content = "校验并导入预览副本" };
        StyleButton(importButton);
        importButton.Click += ImportSettingsPreview_Click;
        settings.Children.Add(importButton);
        settings.Children.Add(_migrationStatus);
        settings.Children.Add(new TextBlock { Text = "诊断信息", FontSize = 16, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        var diagnosticActions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        var refreshDiagnosticsButton = new Button { Content = "刷新诊断" };
        StyleButton(refreshDiagnosticsButton);
        refreshDiagnosticsButton.Click += (_, _) => RefreshDiagnostics();
        var copyDiagnosticsButton = new Button { Content = "复制诊断信息" };
        StyleButton(copyDiagnosticsButton);
        copyDiagnosticsButton.Click += (_, _) =>
        {
            var package = new DataPackage();
            package.SetText(_diagnosticsText.Text);
            Clipboard.SetContent(package);
            _settingsStatus.Text = "诊断信息已复制到剪贴板。";
        };
        diagnosticActions.Children.Add(refreshDiagnosticsButton);
        diagnosticActions.Children.Add(copyDiagnosticsButton);
        settings.Children.Add(diagnosticActions);
        settings.Children.Add(_diagnosticsText);
        body.Children.Add(settingsCard);
        body.Children.Remove(settingsCard);
        body.Children.Insert(2, settingsCard);
        LoadPreviewSettings();
        WireSettingsControls();
        _startPreference.Checked += StartupPreference_Changed;
        _startPreference.Unchecked += StartupPreference_Changed;
        _previewHotkeyEnabled.Checked += PreviewHotkeyEnabled_Changed;
        _previewHotkeyEnabled.Unchecked += PreviewHotkeyEnabled_Changed;

        var planCard = Card();
        planCard.Child = new StackPanel { Spacing = 10 };
        var plan = (StackPanel)planCard.Child;
        plan.Children.Add(new TextBlock { Text = "迁移顺序", FontSize = 16, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        foreach (var step in new[]
        {
            "01  原生窗口验证：多屏、高 DPI、任务栏、鼠标穿透、采集排除。",
            "02  主窗口与设置：导航、设置存储、托盘、更新和启动行为。",
            "03  截图工作流：选区、标注、颜色拾取、OCR、钉图。",
            "04  录屏工作流：屏幕选择、暂停停止、音频、输出历史。",
            "05  并行打包验收：MSIX、官网安装包、数据迁移和回滚。"
        }) plan.Children.Add(new TextBlock { Text = step, TextWrapping = TextWrapping.Wrap });
        plan.Children.Add(new TextBlock { Text = "Electron 版本继续作为正式基线，直到新实现逐项通过验收。", Foreground = Brush("TextFillColorSecondaryBrush"), TextWrapping = TextWrapping.Wrap });
        planCard.Visibility = Visibility.Collapsed;
        body.Children.Add(planCard);

        navigation.Content = new ScrollViewer
        {
            Padding = new Thickness(20, 16, 20, 20),
            Content = body,
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto
        };
        navigation.SelectionChanged += (_, args) =>
        {
            var selected = args.SelectedItemContainer?.Tag?.ToString();
            var isPlan = selected == "plan";
            var isSettings = selected == "settings";
            var isScreenshotLibrary = selected == "library-captures";
            var isRecordingLibrary = selected == "library-recordings";
            _title.Text = isPlan ? "Windows App SDK 迁移计划" : isSettings ? "常规设置" : isScreenshotLibrary ? "截图" : "录屏";
            body.Children[1].Visibility = Visibility.Collapsed;
            displayCard.Visibility = isSettings ? Visibility.Visible : Visibility.Collapsed;
            screenshotLibraryCard.Visibility = isScreenshotLibrary ? Visibility.Visible : Visibility.Collapsed;
            recordingLibraryCard.Visibility = isRecordingLibrary ? Visibility.Visible : Visibility.Collapsed;
            screenshotCard.Visibility = isSettings ? Visibility.Visible : Visibility.Collapsed;
            statusCard.Visibility = isSettings ? Visibility.Visible : Visibility.Collapsed;
            settingsCard.Visibility = isSettings ? Visibility.Visible : Visibility.Collapsed;
            planCard.Visibility = isPlan ? Visibility.Visible : Visibility.Collapsed;
            if (isScreenshotLibrary) RefreshScreenshotLibrary();
            if (isRecordingLibrary) RefreshRecordingLibrary();
        };
        navigation.Loaded += (_, _) =>
        {
            navigation.SelectedItem = screenshotLibraryItem;
            navigation.IsPaneOpen = true;
            DispatcherQueue.TryEnqueue(() => navigation.IsPaneOpen = true);
            DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low, () => navigation.IsPaneOpen = true);
        };
        _displayPicker.SelectionChanged += (_, _) =>
        {
            if (!_loadingDisplays)
            {
                UpdateDisplayDetails();
                if (_frame is not null) ShowSelectedFrame();
            }
        };
        navigation.SelectedItem = screenshotLibraryItem;
        _title.Text = "截图";
        return navigation;
    }

    private async Task CaptureSelectedDisplayAsync(bool copyToClipboard, bool selectRegion, Button? sourceButton, bool annotate = false)
    {
        if (_shortcutCaptureRunning || _recordingState is RecordingState.Starting or RecordingState.Stopping) return;
        if (_displayPicker.SelectedIndex < 0 || _displayPicker.SelectedIndex >= _displays.Count)
        {
            _screenshotStatus.Text = "没有可用的显示器。";
            return;
        }

        _shortcutCaptureRunning = true;
        if (sourceButton is not null) sourceButton.IsEnabled = false;
        var mainWindow = MainWindow.Instance;
        var wasHidden = false;
        var restoreDock = _recordingState is RecordingState.Recording or RecordingState.Paused && _recordingControl is not null;
        try
        {
            HideFrame();
            if (restoreDock) _recordingControl?.HideDock();
            mainWindow?.AppWindow.Hide();
            wasHidden = mainWindow is not null;
            await Task.Delay(180);

            var display = _displays[_displayPicker.SelectedIndex];
            var captureDirectory = string.IsNullOrWhiteSpace(_previewScreenshotDir.Text)
                ? DefaultPreviewCaptureDirectory()
                : _previewScreenshotDir.Text.Trim();
            captureDirectory = Path.GetFullPath(captureDirectory);
            var path = Path.Combine(captureDirectory, $"Zhuageping-{DateTime.Now:yyyyMMdd-HHmmss-fff}.png");
            RectInt32? selectedCaptureRegion = null;
            FrozenDisplayFrame? frozenFrame = null;
            if (selectRegion)
            {
                var target = await RegionSelectionWindow.SelectAcrossDisplaysAsync(_displays.ToArray(), display, forRecording: false);
                if (target is null)
                {
                    _screenshotStatus.Text = "区域截图已取消，未生成文件。";
                    return;
                }
                display = target.Frame.Display;
                selectedCaptureRegion = target.Region;
                frozenFrame = target.Frame;
            }
            if (annotate)
            {
                if (!selectRegion)
                {
                    frozenFrame = new FrozenDisplayFrame(display,
                        await Task.Run(() => NativeScreenshotCapture.CaptureDisplayPixels(display.OuterBounds)));
                }
                var initialRegion = selectedCaptureRegion ?? new RectInt32(0, 0, display.OuterBounds.Width, display.OuterBounds.Height);
                var saved = await RegionSelectionWindow.AnnotateAsync(frozenFrame!, path, initialRegion);
                if (saved != true)
                {
                    _screenshotStatus.Text = "标注已取消，未生成文件。";
                    return;
                }
                _screenshotStatus.Text = copyToClipboard
                    ? $"标注截图已保存并复制：{path}"
                    : $"标注截图已保存：{path}";
            }
            else if (selectRegion)
            {
                await Task.Run(() => NativeScreenshotCapture.SaveRegionPixelsAsPng(display.OuterBounds,
                    frozenFrame!.Pixels, selectedCaptureRegion!.Value, path));
            }
            else
            {
                await Task.Run(() => NativeScreenshotCapture.SaveDisplayAsPng(display.OuterBounds, path));
            }
            if (!File.Exists(path) || new FileInfo(path).Length == 0)
                throw new IOException("截图文件未写入预期目录。");
            _lastCapturePath = path;
            if (!annotate && copyToClipboard)
            {
                var file = await StorageFile.GetFileFromPathAsync(path);
                var data = new DataPackage { RequestedOperation = DataPackageOperation.Copy };
                data.SetBitmap(RandomAccessStreamReference.CreateFromFile(file));
                Clipboard.SetContent(data);
                _screenshotStatus.Text = $"截图已保存并复制到剪贴板：{path}";
            }
            else if (!annotate)
            {
                _screenshotStatus.Text = $"截图已保存：{path}";
            }
            RefreshScreenshotLibrary();
        }
        catch (Exception ex)
        {
            var detail = ex is System.ComponentModel.Win32Exception win32
                ? $"{ex.Message}（Win32 {win32.NativeErrorCode}）"
                : ex.Message;
            _screenshotStatus.Text = $"截图失败：{detail}";
        }
        finally
        {
            if (wasHidden && mainWindow is not null)
            {
                mainWindow.AppWindow.Show();
                mainWindow.Activate();
            }
            if (restoreDock) _recordingControl?.ShowDock();
            if (sourceButton is not null) sourceButton.IsEnabled = true;
            _shortcutCaptureRunning = false;
        }
    }

    private void RefreshScreenshotLibrary()
    {
        var folder = string.IsNullOrWhiteSpace(_previewScreenshotDir.Text)
            ? DefaultPreviewCaptureDirectory()
            : _previewScreenshotDir.Text.Trim();
        RefreshMediaLibrary(
            folder,
            [".png", ".jpg", ".jpeg"],
            _screenshotLibraryRows,
            _screenshotLibraryStatus,
            "暂无截图。",
            isVideo: false);
    }

    private void RefreshRecordingLibrary()
    {
        var folder = string.IsNullOrWhiteSpace(_recordingOutputDir.Text)
            ? DefaultPreviewRecordingDirectory()
            : _recordingOutputDir.Text.Trim();
        RefreshMediaLibrary(
            folder,
            [".mp4", ".mov", ".mkv", ".avi", ".webm"],
            _recordingLibraryRows,
            _recordingLibraryStatus,
            "暂无录屏。",
            isVideo: true);
    }

    private readonly Dictionary<StackPanel, int> _mediaRefreshVersions = [];

    private async void RefreshMediaLibrary(
        string folder,
        string[] extensions,
        StackPanel rows,
        TextBlock status,
        string emptyText,
        bool isVideo)
    {
        _mediaRefreshVersions.TryGetValue(rows, out var version);
        version++;
        _mediaRefreshVersions[rows] = version;
        try
        {
            folder = Path.GetFullPath(folder);
            var snapshot = await Task.Run(() =>
            {
                if (!Directory.Exists(folder)) return (Exists: false, Files: Array.Empty<FileInfo>());
                var entries = Directory.EnumerateFiles(folder)
                    .Where(path => extensions.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase))
                    .Select(path => new FileInfo(path))
                    .OrderByDescending(file => file.LastWriteTimeUtc)
                    .ThenByDescending(file => file.Name, StringComparer.OrdinalIgnoreCase)
                    .ToArray();
                return (Exists: true, Files: entries);
            });
            if (_mediaRefreshVersions[rows] != version) return;
            rows.Children.Clear();
            if (!snapshot.Exists)
            {
                status.Text = "输出目录尚未创建。";
                rows.Children.Add(LibraryEmptyState("文件夹还没有内容。"));
                return;
            }

            var files = snapshot.Files;

            status.Text = files.Length == 0 ? emptyText : $"{files.Length} 个文件 · {folder}";
            if (files.Length == 0)
            {
                rows.Children.Add(LibraryEmptyState(emptyText));
                return;
            }

            for (var index = 0; index < files.Length; index += 3)
            {
                if (index > 0 && index % 12 == 0)
                {
                    await Task.Delay(1);
                    if (_mediaRefreshVersions[rows] != version) return;
                }
                var row = new Grid { ColumnSpacing = 10 };
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                row.Children.Add(BuildMediaCard(files[index], isVideo));
                if (index + 1 < files.Length)
                {
                    var second = BuildMediaCard(files[index + 1], isVideo);
                    Grid.SetColumn(second, 1);
                    row.Children.Add(second);
                }
                if (index + 2 < files.Length)
                {
                    var third = BuildMediaCard(files[index + 2], isVideo);
                    Grid.SetColumn(third, 2);
                    row.Children.Add(third);
                }
                rows.Children.Add(row);
            }
        }
        catch (Exception ex)
        {
            if (_mediaRefreshVersions[rows] != version) return;
            status.Text = $"无法读取媒体库：{ex.Message}";
            rows.Children.Add(LibraryEmptyState("请检查输出目录权限。"));
        }
    }

    private Border BuildMediaCard(FileInfo file, bool isVideo)
    {
        var preview = new Border
        {
            Height = 108,
            Background = Brush("SidebarBackground"),
            CornerRadius = new CornerRadius(8),
            HorizontalAlignment = HorizontalAlignment.Stretch
        };
        if (isVideo)
        {
            preview.Child = new StackPanel
            {
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Spacing = 6,
                Children =
                {
                    OverlayChrome.Icon("\uE714", 28),
                    new TextBlock
                    {
                        Text = file.Extension.TrimStart('.').ToUpperInvariant(),
                        FontSize = 11,
                        FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        Foreground = Brush("TextFillColorSecondaryBrush")
                    }
                }
            };
        }
        else
        {
            preview.Child = new Image
            {
                Source = new BitmapImage
                {
                    UriSource = new Uri(file.FullName),
                    DecodePixelWidth = 640
                },
                Stretch = Stretch.UniformToFill,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                VerticalAlignment = VerticalAlignment.Stretch
            };
        }

        var details = new StackPanel { Spacing = 3, VerticalAlignment = VerticalAlignment.Center };
        details.Children.Add(new TextBlock
        {
            Text = file.Name,
            FontSize = 13,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            TextTrimming = TextTrimming.CharacterEllipsis
        });
        details.Children.Add(new TextBlock
        {
            Text = $"{file.LastWriteTime:yyyy-MM-dd HH:mm} · {FormatFileSize(file.Length)}",
            FontSize = 11,
            Foreground = Brush("TextFillColorSecondaryBrush")
        });

        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 4, HorizontalAlignment = HorizontalAlignment.Right };
        AddMediaAction(actions, "打开", "\uE8E5", () => OpenMediaFile(file.FullName));
        AddMediaAction(actions, "文件夹", "\uE8B7", () => OpenMediaFolder(file.FullName));
        var footer = new Grid { ColumnSpacing = 6, Margin = new Thickness(0, 8, 0, 0) };
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        footer.Children.Add(details);
        Grid.SetColumn(actions, 1);
        footer.Children.Add(actions);

        var content = new StackPanel { Spacing = 0 };
        content.Children.Add(preview);
        content.Children.Add(footer);
        return new Border
        {
            Background = Brush("CardBackgroundFillColorDefaultBrush"),
            BorderBrush = Brush("CardStrokeColorDefaultBrush"),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(10),
            Child = content
        };
    }

    private static void AddMediaAction(StackPanel actions, string label, string glyph, Action action)
    {
        var button = ActionButton(label, glyph);
        button.MinWidth = 48;
        button.Padding = new Thickness(8, 0, 8, 0);
        button.Click += (_, _) => action();
        actions.Children.Add(button);
    }

    private static Border LibraryEmptyState(string text) => new()
    {
        Background = Brush("SidebarBackground"),
        BorderBrush = Brush("CardStrokeColorDefaultBrush"),
        BorderThickness = new Thickness(1),
        CornerRadius = new CornerRadius(8),
        Padding = new Thickness(16),
        Child = new TextBlock
        {
            Text = text,
            Foreground = Brush("TextFillColorSecondaryBrush"),
            TextWrapping = TextWrapping.Wrap
        }
    };

    private static void OpenMediaFile(string path)
    {
        if (File.Exists(path))
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
    }

    private static void OpenMediaFolder(string path)
    {
        if (File.Exists(path))
        {
            var arguments = $"/select,{(char)34}{path}{(char)34}";
            Process.Start(new ProcessStartInfo("explorer.exe", arguments) { UseShellExecute = true });
        }
    }

    private static string FormatFileSize(long bytes) => bytes switch
    {
        >= 1024 * 1024 => $"{bytes / (1024d * 1024):0.0} MB",
        >= 1024 => $"{bytes / 1024d:0} KB",
        _ => $"{bytes} B"
    };

    private void RefreshDisplays_Click(object sender, RoutedEventArgs e) => RefreshDisplays();

    private void RefreshDisplays()
    {
        _loadingDisplays = true;
        _displays.Clear();
        _displayPicker.Items.Clear();
        foreach (var display in MonitorEnumerator.GetAll())
        {
            _displays.Add(display);
            var bounds = display.OuterBounds;
            _displayPicker.Items.Add($"显示器 {_displays.Count}{(display.IsPrimary ? " · 主显示器" : string.Empty)} · {bounds.Width} × {bounds.Height} · {display.DeviceName}");
        }
        if (_displays.Count > 0) _displayPicker.SelectedIndex = 0;
        _loadingDisplays = false;
        UpdateDisplayDetails();
    }

    private void UpdateDisplayDetails()
    {
        if (_displayPicker.SelectedIndex < 0 || _displayPicker.SelectedIndex >= _displays.Count)
        {
            _boundsText.Text = _workAreaText.Text = "未检测到显示器";
            return;
        }
        var display = _displays[_displayPicker.SelectedIndex];
        _boundsText.Text = Format(display.OuterBounds);
        _workAreaText.Text = Format(display.WorkArea);
    }

    private void ShowFrame_Click(object sender, RoutedEventArgs e)
    {
        if (_displayPicker.SelectedIndex < 0 || _displayPicker.SelectedIndex >= _displays.Count)
        {
            _statusText.Text = "没有可用的显示器。";
            return;
        }
        ShowSelectedFrame();
    }

    private void ShowSelectedFrame()
    {
        if (_displayPicker.SelectedIndex < 0 || _displayPicker.SelectedIndex >= _displays.Count) return;
        _frame?.Dispose();
        _frame = new RecordingFrameSet(_displays[_displayPicker.SelectedIndex].OuterBounds);
        try
        {
            var result = _frame.Show();
            _topmostStatus.Text = $"{Mark(result.Topmost)}  始终置顶";
            _clickThroughStatus.Text = $"{Mark(result.ClickThrough)}  鼠标穿透";
            _captureStatus.Text = $"{Mark(result.CaptureExcluded)}  采集排除标志（仍需录屏验证）";
            _statusText.Text = result.Message;
        }
        catch (Exception ex)
        {
            _topmostStatus.Text = _clickThroughStatus.Text = _captureStatus.Text = "未完成";
            _statusText.Text = $"创建边框失败：{ex.Message}";
        }
    }

    private void HideFrame_Click(object sender, RoutedEventArgs e) => HideFrame();
    private void HideFrame()
    {
        _frame?.Dispose();
        _frame = null;
        _topmostStatus.Text = _clickThroughStatus.Text = _captureStatus.Text = "待验证";
        _statusText.Text = "测试边框已隐藏。";
    }

    private async Task StartRecordingAsync(int? requestedMode = null)
    {
        if (_recordingState != RecordingState.Idle || _recorderSession is not null) return;
        if (_displayPicker.SelectedIndex < 0 || _displayPicker.SelectedIndex >= _displays.Count)
        {
            _recordingStatus.Text = "没有可用的显示器。";
            return;
        }

        _recordingState = RecordingState.Starting;
        _recordingStopRequested = false;
        var recordingMode = requestedMode ?? 3;
        if (recordingMode is < 0 or > 3)
        {
            _recordingStatus.Text = "录屏范围无效，请按 F2 重新选择窗口或区域。";
            _recordingState = RecordingState.Idle;
            return;
        }
        var recordingTarget = recordingMode switch { 1 => "窗口", 2 => "自定义区域", 3 => "自动选择", _ => "全屏" };
        var mainWindow = MainWindow.Instance;
        try
        {
            _recordingStatus.Text = "准备录制…";
            await Task.Yield();
            var display = _displays[_displayPicker.SelectedIndex];
            if (string.IsNullOrWhiteSpace(display.DeviceName)) throw new InvalidOperationException("无法获取所选显示器的 Windows 设备名。");
            RectInt32? selectedRegion = null;
            if (recordingMode is 1 or 2 or 3)
            {
                HideFrame();
                mainWindow?.AppWindow.Hide();
                var selectionIntent = recordingMode switch
                {
                    1 => RegionSelectionIntent.Window,
                    2 => RegionSelectionIntent.Region,
                    _ => RegionSelectionIntent.Any
                };
                var target = await RegionSelectionWindow.SelectAcrossDisplaysAsync(_displays.ToArray(), display, forRecording: true, selectionIntent);
                if (target is not null)
                {
                    display = target.Frame.Display;
                    selectedRegion = target.Region;
                    recordingMode = target.IsWindow ? 1 : 2;
                    recordingTarget = target.IsWindow ? "窗口" : "自定义区域";
                }
                if (selectedRegion is null)
                {
                    _recordingStatus.Text = "录制范围选择已取消，未启动录制。";
                    await FinishRecordingUiAsync(mainWindow);
                    return;
                }
                if (selectedRegion.Value.Width < 16 || selectedRegion.Value.Height < 16 ||
                    selectedRegion.Value.X < 0 || selectedRegion.Value.Y < 0 ||
                    selectedRegion.Value.X + selectedRegion.Value.Width > display.OuterBounds.Width ||
                    selectedRegion.Value.Y + selectedRegion.Value.Height > display.OuterBounds.Height)
                    throw new InvalidOperationException("选中的录制范围无效或超出显示器边界，请重新选择。");
                _recordingMode.SelectedIndex = recordingMode;
            }
            var region = selectedRegion.GetValueOrDefault();
            if (selectedRegion is not null)
            {
                region = new RectInt32(region.X, region.Y, region.Width / 2 * 2, region.Height / 2 * 2);
                selectedRegion = region;
            }
            var outputDirectoryInput = string.IsNullOrWhiteSpace(_recordingOutputDir.Text)
                ? DefaultPreviewRecordingDirectory()
                : _recordingOutputDir.Text.Trim();
            var outputDirectory = await Task.Run(() =>
            {
                var directory = Path.GetFullPath(outputDirectoryInput);
                Directory.CreateDirectory(directory);
                return directory;
            });
            var outputPath = Path.Combine(outputDirectory, $"Zhuageping-{DateTime.Now:yyyyMMdd-HHmmss-fff}.mp4");
            HideFrame();
            mainWindow?.AppWindow.Hide();
            await Task.Yield();
            var frameBounds = selectedRegion is null
                ? display.OuterBounds
                : new RectInt32(display.OuterBounds.X + region.X, display.OuterBounds.Y + region.Y, region.Width, region.Height);
            _recordingFrame = new RecordingFrameSet(frameBounds);
            _recordingFrame.Show();
            _recordingControl = new RecordingControlWindow(
                () => _ = ToggleRecordingPauseAsync(),
                () => _ = StopRecordingAsync(),
                recordingTarget,
                selectedRegion,
                display.WorkArea);
            _recordingControl.SetStarting();
            if (!_recordingControl.ReadyForCapture)
                throw new InvalidOperationException(_recordingControl.CaptureExcluded
                    ? "录制控制窗未能显示在顶层；已取消启动。"
                    : "录制控制窗无法从采集画面排除；为避免把控件录进去，已取消启动。");

            _recordingStatus.Text = $"正在启动 · {recordingTarget} · {frameBounds.Width} × {frameBounds.Height}";
            var quality = _recordingQuality.SelectedIndex switch
            {
                1 => (Bitrate: 36_000_000, Quality: 94),
                2 => (Bitrate: 7_000_000, Quality: 74),
                _ => (Bitrate: 18_000_000, Quality: 84)
            };
            var config = new RecorderHostConfig(
                outputPath,
                display.DeviceName,
                region.X, region.Y, region.Width, region.Height,
                int.TryParse(_recordingFps.SelectedItem?.ToString(), out var fps) ? fps : 30,
                quality.Bitrate,
                quality.Quality,
                CaptureSystemAudio: true,
                CaptureMicrophone: _recordingMic.IsChecked == true,
                ShowCursor: _recordingShowCursor.IsChecked == true,
                ShowClickHighlight: _recordingClickHighlight.IsChecked == true,
                ExcludeWindowHandles: [_recordingControl.Handle.ToInt64().ToString(),
                    .. _recordingFrame.Handles.Select(handle => handle.ToInt64().ToString())]);
            var hostPath = await Task.Run(FindRecorderHostPath);
            _recorderSession = await RecorderHostSession.StartAsync(hostPath, config);
            if (_recordingStopRequested)
            {
                await StopRecordingAsync();
                return;
            }
            _recordingControl.SetRecording();
            _recordingControl.ShowDock();
            if (!_recordingFrame.EnsureVisible()) throw new InvalidOperationException("录制边界未能显示，已取消录制。");
            _recordingClock.Restart();
            _recordingTimer = DispatcherQueue.CreateTimer();
            _recordingTimer.Interval = TimeSpan.FromSeconds(1);
            _recordingTimer.Tick += (_, _) =>
            {
                _recordingControl?.SetElapsed(_recordingClock.Elapsed);
                _recordingFrame?.EnsureVisible();
            };
            _recordingTimer.Start();
            _recordingState = RecordingState.Recording;
            _recordingStatus.Text = $"录制中 · {outputPath}";
            _ = ObserveRecordingCompletionAsync(_recorderSession);
        }
        catch (Exception ex)
        {
            _recordingStatus.Text = $"录制启动失败：{ex.Message}";
            if (_recorderSession is not null)
            {
                await _recorderSession.DisposeAsync();
                _recorderSession = null;
            }
            await FinishRecordingUiAsync(mainWindow);
        }
        finally
        {
            _recordingControl?.SetBusy(false);
        }
    }

    private async Task ObserveRecordingCompletionAsync(RecorderHostSession session)
    {
        string message;
        try
        {
            var path = await session.Completion;
            message = $"录制已结束 · {path}";
        }
        catch (Exception ex)
        {
            message = $"录制中断：{ex.Message}";
        }
        DispatcherQueue.TryEnqueue(() => _ = FinishUnexpectedRecordingAsync(session, message));
    }

    private async Task FinishUnexpectedRecordingAsync(RecorderHostSession session, string message)
    {
        await _recordingCommandLock.WaitAsync();
        try
        {
            if (!ReferenceEquals(_recorderSession, session) || _recordingState is RecordingState.Idle or RecordingState.Stopping) return;
            _recordingStatus.Text = message;
            _recordingClock.Stop();
            await session.DisposeAsync();
            _recorderSession = null;
            await FinishRecordingUiAsync(MainWindow.Instance);
            RefreshRecordingLibrary();
        }
        finally
        {
            _recordingCommandLock.Release();
        }
    }

    private async Task ToggleRecordingPauseAsync()
    {
        await _recordingCommandLock.WaitAsync();
        try
        {
            var session = _recorderSession;
            if (session is null || _recordingState == RecordingState.Starting)
            {
                _recordingStatus.Text = "录制仍在启动，请稍候…";
                return;
            }
            if (_recordingControl is null || _recordingState is RecordingState.Idle or RecordingState.Stopping) return;
            _recordingControl.SetBusy(true);
            if (_recordingState == RecordingState.Paused)
            {
                await session.ResumeAsync();
                _recordingState = RecordingState.Recording;
                _recordingClock.Start();
                _recordingStatus.Text = "录制中";
                _recordingControl.SetPaused(false);
            }
            else if (_recordingState == RecordingState.Recording)
            {
                await session.PauseAsync();
                _recordingState = RecordingState.Paused;
                _recordingClock.Stop();
                _recordingStatus.Text = "已暂停";
                _recordingControl.SetPaused(true);
            }
        }
        catch (Exception ex)
        {
            _recordingStatus.Text = $"录制控制失败：{ex.Message}";
        }
        finally
        {
            _recordingControl?.SetBusy(false);
            _recordingCommandLock.Release();
        }
    }

    private async Task StopRecordingAsync()
    {
        if (_recordingState == RecordingState.Starting && _recorderSession is null)
        {
            _recordingStopRequested = true;
            _recordingStatus.Text = "正在取消录制启动…";
            return;
        }
        await _recordingCommandLock.WaitAsync();
        RecorderHostSession? session = null;
        try
        {
            session = _recorderSession;
            if (session is null)
            {
                _recordingStopRequested = true;
                _recordingStatus.Text = "正在取消录制启动…";
                return;
            }
            if (_recordingState is RecordingState.Idle or RecordingState.Stopping) return;
            _recordingState = RecordingState.Stopping;
            _recordingStatus.Text = "正在停止并封装 MP4…";
            _recordingClock.Stop();
            _recordingControl?.SetStopping();
            var path = await session.StopAsync();
            if (!File.Exists(path) || new FileInfo(path).Length == 0)
                throw new IOException("RecorderHost 已结束，但没有生成有效文件。");
            _recordingStatus.Text = $"录制完成 · {new FileInfo(path).Length / 1024d / 1024d:0.0} MB · {path}";
            RefreshRecordingLibrary();
        }
        catch (Exception ex)
        {
            _recordingStatus.Text = $"停止录制失败：{ex.Message}";
        }
        finally
        {
            if (session is not null) await session.DisposeAsync();
            _recorderSession = null;
            await FinishRecordingUiAsync(MainWindow.Instance);
            _recordingStopRequested = false;
            _recordingCommandLock.Release();
        }
    }

    private async Task FinishRecordingUiAsync(MainWindow? mainWindow)
    {
        _recordingState = RecordingState.Idle;
        _recordingTimer?.Stop();
        _recordingTimer = null;
        _recordingClock.Reset();
        _recordingControl?.Dispose();
        _recordingControl = null;
        _recordingFrame?.Dispose();
        _recordingFrame = null;
        if (mainWindow is not null)
        {
            mainWindow.AppWindow.Show();
            mainWindow.Activate();
        }
        await Task.CompletedTask;
    }

    private static string FindRecorderHostPath()
    {
        var candidates = new List<string>
        {
            Path.Combine(AppContext.BaseDirectory, "recorder", "ZhuagepingRecorderHost.exe")
        };
        for (var directory = new DirectoryInfo(Environment.CurrentDirectory); directory is not null; directory = directory.Parent)
        {
            candidates.Add(Path.Combine(directory.FullName, "native", "recorder-host", "bin", "Release", "net8.0-windows", "win-x64", "publish", "ZhuagepingRecorderHost.exe"));
            candidates.Add(Path.Combine(directory.FullName, "native", "recorder-host", "bin", "Debug", "net8.0-windows", "win-x64", "publish", "ZhuagepingRecorderHost.exe"));
        }
        return candidates.FirstOrDefault(File.Exists)
            ?? throw new FileNotFoundException("没有找到 RecorderHost。先执行 native/recorder-host 的 win-x64 Release publish。");
    }

    private void OpenRecordingFolder()
    {
        OpenOutputFolder(_recordingOutputDir, DefaultPreviewRecordingDirectory());
    }

    private static void OpenOutputFolder(TextBox pathBox, string fallbackDirectory)
    {
        var directory = string.IsNullOrWhiteSpace(pathBox.Text) ? fallbackDirectory : pathBox.Text.Trim();
        directory = Path.GetFullPath(directory);
        Directory.CreateDirectory(directory);
        Process.Start(new ProcessStartInfo(directory) { UseShellExecute = true });
    }

    private async Task ChooseOutputFolderAsync(TextBox pathBox, PickerLocationId suggestedLocation, Action refreshLibrary)
    {
        try
        {
            var picker = new FolderPicker
            {
                SuggestedStartLocation = suggestedLocation,
                ViewMode = PickerViewMode.List
            };
            picker.FileTypeFilter.Add("*");
            InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(MainWindow.Instance!));
            var folder = await picker.PickSingleFolderAsync();
            if (folder is null) return;

            pathBox.Text = folder.Path;
            SavePreviewSettings(this, new RoutedEventArgs());
            refreshLibrary();
            _footerStatus.Text = $"保存位置已更新：{folder.Path}";
        }
        catch (Exception ex)
        {
            _settingsStatus.Text = $"选择保存位置失败：{ex.Message}";
        }
    }

    private void RestoreDefaults()
    {
        _previewSettings = new PreviewSettings();
        PopulateSettingsControls();
        SavePreviewSettings(this, new RoutedEventArgs());
        UpdatePreviewHotkeyRegistration();
        _footerStatus.Text = "已恢复默认设置。";
    }

    private static string Mark(bool success) => success ? "✓" : "✕";
    private static string Format(RectInt32 rect) => $"X {rect.X}, Y {rect.Y}, {rect.Width} × {rect.Height}";
    private static SolidColorBrush Brush(string key) => key switch
    {
        "AppBackground" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 255, 255, 255)),
        "SidebarBackground" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 244, 247, 249)),
        "FooterBackground" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 247, 249, 251)),
        "HeaderBackground" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 248, 250, 252)),
        "CardBackgroundFillColorDefaultBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 255, 255, 255)),
        "CardStrokeColorDefaultBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 211, 221, 229)),
        "TextFillColorSecondaryBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 86, 108, 128)),
        "TextFillColorPrimaryBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 20, 41, 59)),
        "TextFillColorDisabledBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 149, 164, 177)),
        "ButtonPrimaryTextBrush" => OverlayChrome.Brush(Colors.White),
        "AccentBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 242, 87, 45)),
        "NavSelectedBackground" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 255, 255, 255)),
        "UpdateBackground" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 246, 249, 251)),
        "InputBackgroundBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 255, 255, 255)),
        "InputBackgroundPointerOverBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 252, 254, 255)),
        "InputBackgroundFocusedBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 255, 255, 255)),
        "InputBackgroundDisabledBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 244, 247, 249)),
        "InputBorderBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 183, 198, 210)),
        "InputBorderPointerOverBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 142, 166, 184)),
        "InputBorderFocusedBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 242, 87, 45)),
        "InputBorderDisabledBrush" => OverlayChrome.Brush(ColorHelper.FromArgb(255, 216, 225, 232)),
        "TransparentBackground" => OverlayChrome.Brush(Colors.Transparent),
        _ => OverlayChrome.Brush(ColorHelper.FromArgb(255, 255, 255, 255))
    };

    private static Button ActionButton(string text, string glyph, bool primary = false)
    {
        var button = new Button
        {
            Content = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 6,
                VerticalAlignment = VerticalAlignment.Center,
                Children = { OverlayChrome.Icon(glyph, 14), new TextBlock { Text = text, FontSize = 13 } }
            }
        };
        AutomationProperties.SetName(button, text);
        StyleButton(button, primary);
        return button;
    }

    private static void SetContentForeground(UIElement element, SolidColorBrush brush)
    {
        switch (element)
        {
            case TextBlock textBlock:
                textBlock.Foreground = brush;
                break;
            case FontIcon fontIcon:
                fontIcon.Foreground = brush;
                break;
            case Control control:
                control.Foreground = brush;
                break;
        }

        if (element is Panel panel)
        {
            foreach (var child in panel.Children)
                SetContentForeground(child, brush);
        }
    }

    private static void StyleCheckBox(CheckBox checkBox)
    {
        var foreground = Brush("TextFillColorPrimaryBrush");
        checkBox.Foreground = foreground;
        if (checkBox.Content is string text)
        {
            checkBox.Content = new TextBlock
            {
                Text = text,
                Foreground = foreground,
                VerticalAlignment = VerticalAlignment.Center
            };
        }
        checkBox.Resources["CheckBoxForeground"] = foreground;
        checkBox.Resources["CheckBoxForegroundPointerOver"] = foreground;
        checkBox.Resources["CheckBoxForegroundPressed"] = foreground;
        checkBox.Resources["CheckBoxContentForeground"] = foreground;
        checkBox.Resources["CheckBoxContentForegroundPointerOver"] = foreground;
        checkBox.Resources["CheckBoxContentForegroundPressed"] = foreground;
        checkBox.Resources["CheckBoxCheckGlyphForegroundChecked"] = Brush("ButtonPrimaryTextBrush");
    }

    private static void StyleButton(Button button, bool primary = false)
    {
        button.MinHeight = 34;
        button.Padding = new Thickness(10, 0, 10, 0);
        button.CornerRadius = new CornerRadius(6);
        button.BorderThickness = new Thickness(1);
        button.UseSystemFocusVisuals = true;
        button.Foreground = Brush(primary ? "ButtonPrimaryTextBrush" : "TextFillColorPrimaryBrush");
        var normalBackground = primary ? ColorHelper.FromArgb(255, 242, 87, 45) : ColorHelper.FromArgb(255, 255, 255, 255);
        var normalBorder = primary ? Colors.Transparent : ColorHelper.FromArgb(255, 174, 193, 208);
        button.Resources["ButtonForeground"] = button.Foreground;
        button.Resources["ButtonForegroundPointerOver"] = button.Foreground;
        button.Resources["ButtonForegroundPressed"] = button.Foreground;
        button.Resources["ButtonForegroundDisabled"] = Brush("TextFillColorDisabledBrush");
        if (button.Content is UIElement contentElement)
            SetContentForeground(contentElement, (SolidColorBrush)button.Foreground);
        button.Background = OverlayChrome.Brush(normalBackground);
        button.BorderBrush = OverlayChrome.Brush(normalBorder);

        button.PointerEntered += (_, _) =>
        {
            button.Background = OverlayChrome.Brush(primary
                ? ColorHelper.FromArgb(255, 255, 108, 70)
                : ColorHelper.FromArgb(255, 242, 246, 249));
            button.BorderBrush = OverlayChrome.Brush(primary ? Colors.Transparent : ColorHelper.FromArgb(255, 242, 87, 45));
        };
        button.PointerExited += (_, _) =>
        {
            button.Background = OverlayChrome.Brush(normalBackground);
            button.BorderBrush = OverlayChrome.Brush(normalBorder);
        };
        button.PointerPressed += (_, _) =>
        {
            button.Background = OverlayChrome.Brush(primary
                ? ColorHelper.FromArgb(255, 218, 67, 32)
                : ColorHelper.FromArgb(255, 232, 239, 244));
        };
        button.PointerReleased += (_, _) =>
        {
            button.Background = OverlayChrome.Brush(primary
                ? ColorHelper.FromArgb(255, 255, 108, 70)
                : ColorHelper.FromArgb(255, 242, 246, 249));
        };
    }

    private static void StyleInput(Control control)
    {
        control.MinHeight = 34;
        control.Padding = new Thickness(10, 0, 10, 0);
        control.CornerRadius = new CornerRadius(6);
        control.BorderThickness = new Thickness(1);
        control.RequestedTheme = ElementTheme.Light;
        var inputBackground = Brush("InputBackgroundBrush");
        var inputBackgroundPointerOver = Brush("InputBackgroundPointerOverBrush");
        var inputBackgroundFocused = Brush("InputBackgroundFocusedBrush");
        var inputBackgroundDisabled = Brush("InputBackgroundDisabledBrush");
        var inputBorder = Brush("InputBorderBrush");
        var inputBorderPointerOver = Brush("InputBorderPointerOverBrush");
        var inputBorderFocused = Brush("InputBorderFocusedBrush");
        var inputBorderDisabled = Brush("InputBorderDisabledBrush");
        control.Background = inputBackground;
        control.BorderBrush = inputBorder;
        control.Foreground = Brush("TextFillColorPrimaryBrush");
        control.Resources["TextControlBackground"] = inputBackground;
        control.Resources["TextControlBackgroundPointerOver"] = inputBackgroundPointerOver;
        control.Resources["TextControlBackgroundFocused"] = inputBackgroundFocused;
        control.Resources["TextControlBackgroundDisabled"] = inputBackgroundDisabled;
        control.Resources["TextControlBorderBrush"] = inputBorder;
        control.Resources["TextControlBorderBrushPointerOver"] = inputBorderPointerOver;
        control.Resources["TextControlBorderBrushFocused"] = inputBorderFocused;
        control.Resources["TextControlBorderBrushDisabled"] = inputBorderDisabled;
        control.Resources["TextControlForeground"] = control.Foreground;
        control.Resources["TextControlForegroundFocused"] = control.Foreground;
        control.Resources["TextControlForegroundPointerOver"] = control.Foreground;
        control.Resources["TextControlPlaceholderForeground"] = Brush("TextFillColorSecondaryBrush");
        control.Resources["TextControlPlaceholderForegroundPointerOver"] = Brush("TextFillColorSecondaryBrush");
        control.Resources["TextControlPlaceholderForegroundFocused"] = Brush("TextFillColorSecondaryBrush");
        control.Resources["TextControlButtonForeground"] = Brush("TextFillColorSecondaryBrush");
        control.Resources["TextControlButtonForegroundPointerOver"] = Brush("TextFillColorPrimaryBrush");
        control.Resources["TextControlButtonForegroundPressed"] = Brush("TextFillColorPrimaryBrush");
        control.Resources["ComboBoxBackground"] = inputBackground;
        control.Resources["ComboBoxBackgroundPointerOver"] = inputBackgroundPointerOver;
        control.Resources["ComboBoxBackgroundPressed"] = inputBackgroundFocused;
        control.Resources["ComboBoxBackgroundDisabled"] = inputBackgroundDisabled;
        control.Resources["ComboBoxBorderBrush"] = inputBorder;
        control.Resources["ComboBoxBorderBrushPointerOver"] = inputBorderPointerOver;
        control.Resources["ComboBoxBorderBrushPressed"] = inputBorderFocused;
        control.Resources["ComboBoxBorderBrushDisabled"] = inputBorderDisabled;
        control.Resources["ComboBoxForeground"] = control.Foreground;
        control.Resources["ComboBoxForegroundPointerOver"] = control.Foreground;
        control.Resources["ComboBoxForegroundPressed"] = control.Foreground;
        control.Resources["ComboBoxForegroundDisabled"] = Brush("TextFillColorDisabledBrush");
        control.Resources["ComboBoxPlaceholderForeground"] = Brush("TextFillColorSecondaryBrush");
        control.Resources["ComboBoxDropDownButtonForeground"] = Brush("TextFillColorSecondaryBrush");
        control.Resources["ComboBoxDropDownButtonForegroundPointerOver"] = Brush("TextFillColorPrimaryBrush");
        control.Resources["ComboBoxDropDownButtonForegroundPressed"] = Brush("TextFillColorPrimaryBrush");
        control.Resources["ComboBoxItemForeground"] = control.Foreground;
        control.Resources["ComboBoxItemForegroundPointerOver"] = control.Foreground;
        control.Resources["ComboBoxItemForegroundSelected"] = control.Foreground;
        control.UseSystemFocusVisuals = true;
    }

    private static Border Card() => new()
    {
        Padding = new Thickness(14),
        CornerRadius = new CornerRadius(8),
        BorderThickness = new Thickness(1),
        BorderBrush = Brush("CardStrokeColorDefaultBrush"),
        Background = Brush("CardBackgroundFillColorDefaultBrush")
    };

    private static StackPanel SectionHeading(string eyebrow, string title, string description)
    {
        return new StackPanel
        {
            Spacing = 2,
            VerticalAlignment = VerticalAlignment.Center,
            Children =
            {
                new TextBlock
                {
                    Text = eyebrow,
                    FontSize = 11,
                    FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                    Foreground = OverlayChrome.Brush(OverlayChrome.Accent)
                },
                new TextBlock
                {
                    Text = title,
                    FontSize = 16,
                    FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                    Foreground = Brush("TextFillColorPrimaryBrush")
                },
                new TextBlock
                {
                    Text = description,
                    FontSize = 12,
                    Foreground = Brush("TextFillColorSecondaryBrush"),
                    TextWrapping = TextWrapping.Wrap
                }
            }
        };
    }

    private static Border MetricTile(string label, TextBlock value)
    {
        value.FontSize = 14;
        value.Foreground = Brush("TextFillColorPrimaryBrush");
        value.TextWrapping = TextWrapping.Wrap;
        return new Border
        {
            Padding = new Thickness(10, 8, 10, 8),
            CornerRadius = new CornerRadius(8),
            BorderThickness = new Thickness(1),
            BorderBrush = Brush("CardStrokeColorDefaultBrush"),
            Background = Brush("HeaderBackground"),
            Child = new StackPanel
            {
                Spacing = 4,
                Children =
                {
                    new TextBlock { Text = label, FontSize = 12, Foreground = Brush("TextFillColorSecondaryBrush") },
                    value
                }
            }
        };
    }

    private static Border StatusTile(string label, TextBlock status)
    {
        status.FontSize = 12;
        status.Foreground = Brush("TextFillColorPrimaryBrush");
        status.TextWrapping = TextWrapping.Wrap;
        return new Border
        {
            Padding = new Thickness(10, 8, 10, 8),
            CornerRadius = new CornerRadius(8),
            BorderThickness = new Thickness(1),
            BorderBrush = Brush("CardStrokeColorDefaultBrush"),
            Background = Brush("HeaderBackground"),
            Child = new StackPanel
            {
                Spacing = 4,
                Children =
                {
                    new TextBlock { Text = label, FontSize = 12, Foreground = Brush("TextFillColorSecondaryBrush") },
                    status
                }
            }
        };
    }

    private static void AddCell(Grid grid, string text, int row, int column) => AddCell(grid, new TextBlock { Text = text }, row, column);
    private static void AddCell(Grid grid, FrameworkElement element, int row, int column)
    {
        Grid.SetRow(element, row);
        Grid.SetColumn(element, column);
        grid.Children.Add(element);
    }
    private static ComboBox Combo(params string[] values)
    {
        var combo = new ComboBox { MinWidth = 180, RequestedTheme = ElementTheme.Light };
        foreach (var value in values) combo.Items.Add(value);
        combo.SelectedIndex = values.Length > 0 ? 0 : -1;
        StyleInput(combo);
        combo.Resources["ComboBoxDropDownBackground"] = Brush("AppBackground");
        combo.Resources["ComboBoxDropDownBorderBrush"] = Brush("CardStrokeColorDefaultBrush");
        combo.Resources["ComboBoxItemBackground"] = Brush("AppBackground");
        combo.Resources["ComboBoxItemBackgroundPointerOver"] = Brush("HeaderBackground");
        combo.Resources["ComboBoxItemBackgroundSelected"] = Brush("HeaderBackground");
        combo.Resources["ComboBoxItemForegroundDisabled"] = Brush("TextFillColorDisabledBrush");
        var itemStyle = new Style(typeof(ComboBoxItem));
        itemStyle.Setters.Add(new Setter(Control.ForegroundProperty, Brush("TextFillColorPrimaryBrush")));
        itemStyle.Setters.Add(new Setter(Control.BackgroundProperty, Brush("AppBackground")));
        itemStyle.Setters.Add(new Setter(Control.BorderBrushProperty, Brush("CardStrokeColorDefaultBrush")));
        combo.ItemContainerStyle = itemStyle;
        return combo;
    }
    private static FrameworkElement Field(string label, Control control)
    {
        var grid = new Grid { ColumnSpacing = 8 };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(130) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        StyleInput(control);
        grid.Children.Add(new TextBlock
        {
            Text = label,
            Foreground = Brush("TextFillColorSecondaryBrush"),
            VerticalAlignment = VerticalAlignment.Center
        });
        Grid.SetColumn(control, 1);
        grid.Children.Add(control);
        return grid;
    }

    private void LoadPreviewSettings()
    {
        try
        {
            if (File.Exists(_settingsFile))
                _previewSettings = JsonSerializer.Deserialize<PreviewSettings>(File.ReadAllText(_settingsFile), SettingsJsonOptions()) ?? new();
            PopulateSettingsControls();
            UpdatePreviewHotkeyRegistration();
            _settingsStatus.Text = File.Exists(_settingsFile) ? "已从本地预览配置载入。" : "尚未保存预览设置。";
        }
        catch (Exception ex)
        {
            _settingsStatus.Text = $"载入失败：{ex.Message}";
        }
    }

    private void PopulateSettingsControls()
    {
        _loadingSettings = true;
        _startPreference.IsChecked = _previewSettings.LaunchAtStartup;
        _responsivePreference.IsChecked = _previewSettings.KeepResponsive;
        _previewHotkeyEnabled.IsChecked = _previewSettings.PreviewHotkeyEnabled;
        _shortcutCapture.Text = _previewSettings.ShortcutCapture;
        _shortcutCaptureCopy.Text = _previewSettings.ShortcutCaptureCopy;
        _shortcutArea.Text = _previewSettings.ShortcutArea;
        _shortcutScrollCapture.Text = _previewSettings.ShortcutScrollCapture;
        _shortcutPin.Text = _previewSettings.ShortcutPin;
        _shortcutTogglePins.Text = _previewSettings.ShortcutTogglePins;
        _autoBackup.IsChecked = _previewSettings.AutoBackup;
        _runAsAdmin.IsChecked = _previewSettings.RunAsAdmin;
        _trayMenu.IsChecked = _previewSettings.TrayMenu;
        _autoCopy.IsChecked = _previewSettings.AutoCopy;
        _autoPin.IsChecked = _previewSettings.AutoPinAfterCapture;
        _watermarkEnabled.IsChecked = _previewSettings.WatermarkEnabled;
        _recordingMic.IsChecked = _previewSettings.RecordingMic;
        _recordingCountdown.IsChecked = _previewSettings.RecordingCountdown;
        _recordingShowCursor.IsChecked = _previewSettings.RecordingShowCursor;
        _recordingClickHighlight.IsChecked = _previewSettings.RecordingClickHighlight;
        _location.Text = _previewSettings.Location;
        _project.Text = _previewSettings.Project;
        _note.Text = _previewSettings.Note;
        _screenshotDir.Text = _previewSettings.ScreenshotDir;
        _previewScreenshotDir.Text = string.IsNullOrWhiteSpace(_previewSettings.PreviewScreenshotDir)
            ? DefaultPreviewCaptureDirectory()
            : _previewSettings.PreviewScreenshotDir;
        _recordingOutputDir.Text = string.IsNullOrWhiteSpace(_previewSettings.RecordingOutputDir)
            ? DefaultPreviewRecordingDirectory()
            : _previewSettings.RecordingOutputDir;
        _recordingMode.SelectedIndex = _previewSettings.RecordingMode switch
        {
            "window" => 1,
            "region" => 2,
            _ => 0
        };
        _language.SelectedIndex = _previewSettings.Language == "en-US" ? 1 : 0;
        _theme.SelectedIndex = _previewSettings.Theme switch { "light" => 1, "dark" => 2, _ => 0 };
        _outputFormat.SelectedIndex = _previewSettings.OutputFormat == "jpg" ? 1 : 0;
        _watermarkPosition.SelectedIndex = Array.IndexOf(new[] { "top-left", "top-right", "bottom-left", "bottom-right", "bottom-bar" }, _previewSettings.WatermarkPosition);
        if (_watermarkPosition.SelectedIndex < 0) _watermarkPosition.SelectedIndex = 3;
        _recordingFps.SelectedItem = _previewSettings.RecordingFps.ToString();
        if (_recordingFps.SelectedIndex < 0) _recordingFps.SelectedItem = "30";
        _recordingQuality.SelectedIndex = _previewSettings.RecordingQuality switch { "high" => 1, "compact" => 2, _ => 0 };
        _loadingSettings = false;
    }

    private void SavePreviewSettings(object sender, RoutedEventArgs e)
    {
        if (_loadingSettings) return;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_settingsFile)!);
            ReadSettingsControls();
            File.WriteAllText(_settingsFile, JsonSerializer.Serialize(_previewSettings, SettingsJsonOptions()));
            _settingsStatus.Text = $"已保存到独立预览配置：{_settingsFile}";
        }
        catch (Exception ex)
        {
            _settingsStatus.Text = $"保存失败：{ex.Message}";
        }
    }

    private void WireSettingsControls()
    {
        foreach (var checkBox in new[] { _responsivePreference, _autoBackup, _runAsAdmin, _trayMenu, _autoCopy, _autoPin, _watermarkEnabled, _recordingMic, _recordingCountdown, _recordingShowCursor, _recordingClickHighlight })
        {
            checkBox.Checked += SavePreviewSettings;
            checkBox.Unchecked += SavePreviewSettings;
        }
        foreach (var comboBox in new[] { _language, _theme, _outputFormat, _watermarkPosition, _recordingFps, _recordingQuality, _recordingMode })
            comboBox.SelectionChanged += SavePreviewSettings;
        foreach (var textBox in new[] { _location, _project, _note, _screenshotDir, _previewScreenshotDir, _recordingOutputDir })
            textBox.LostFocus += SavePreviewSettings;
        foreach (var textBox in new[] { _shortcutCapture, _shortcutCaptureCopy, _shortcutArea, _shortcutScrollCapture, _shortcutPin, _shortcutTogglePins })
            textBox.LostFocus += ShortcutTextBox_LostFocus;
    }

    private void ReadSettingsControls()
    {
        _previewSettings.LaunchAtStartup = _startPreference.IsChecked == true;
        _previewSettings.KeepResponsive = _responsivePreference.IsChecked == true;
        _previewSettings.PreviewHotkeyEnabled = _previewHotkeyEnabled.IsChecked == true;
        _previewSettings.AutoBackup = _autoBackup.IsChecked == true;
        _previewSettings.RunAsAdmin = _runAsAdmin.IsChecked == true;
        _previewSettings.TrayMenu = _trayMenu.IsChecked == true;
        _previewSettings.AutoCopy = _autoCopy.IsChecked == true;
        _previewSettings.AutoPinAfterCapture = _autoPin.IsChecked == true;
        _previewSettings.WatermarkEnabled = _watermarkEnabled.IsChecked == true;
        _previewSettings.RecordingMic = _recordingMic.IsChecked == true;
        _previewSettings.RecordingCountdown = _recordingCountdown.IsChecked == true;
        _previewSettings.RecordingShowCursor = _recordingShowCursor.IsChecked == true;
        _previewSettings.RecordingClickHighlight = _recordingClickHighlight.IsChecked == true;
        _previewSettings.Location = _location.Text;
        _previewSettings.Project = _project.Text;
        _previewSettings.Note = _note.Text;
        _previewSettings.ScreenshotDir = _screenshotDir.Text;
        _previewSettings.PreviewScreenshotDir = _previewScreenshotDir.Text.Trim();
        _previewSettings.RecordingOutputDir = _recordingOutputDir.Text.Trim();
        _previewSettings.ShortcutCapture = _shortcutCapture.Text.Trim();
        _previewSettings.ShortcutCaptureCopy = _shortcutCaptureCopy.Text.Trim();
        _previewSettings.ShortcutArea = _shortcutArea.Text.Trim();
        _previewSettings.ShortcutScrollCapture = _shortcutScrollCapture.Text.Trim();
        _previewSettings.ShortcutPin = _shortcutPin.Text.Trim();
        _previewSettings.ShortcutTogglePins = _shortcutTogglePins.Text.Trim();
        _previewSettings.RecordingMode = _recordingMode.SelectedIndex switch
        {
            1 => "window",
            2 => "region",
            _ => "display"
        };
        _previewSettings.Language = _language.SelectedIndex == 1 ? "en-US" : "zh-CN";
        _previewSettings.Theme = _theme.SelectedIndex switch { 1 => "light", 2 => "dark", _ => "system" };
        _previewSettings.OutputFormat = _outputFormat.SelectedIndex == 1 ? "jpg" : "png";
        _previewSettings.WatermarkPosition = _watermarkPosition.SelectedIndex switch { 0 => "top-left", 1 => "top-right", 2 => "bottom-left", 4 => "bottom-bar", _ => "bottom-right" };
        _previewSettings.RecordingFps = int.TryParse(_recordingFps.SelectedItem?.ToString(), out var fps) ? fps : 30;
        _previewSettings.RecordingQuality = _recordingQuality.SelectedIndex switch { 1 => "high", 2 => "compact", _ => "standard" };
    }

    private void PreviewHotkeyEnabled_Changed(object sender, RoutedEventArgs e)
    {
        if (_loadingSettings) return;
        SavePreviewSettings(sender, e);
        UpdatePreviewHotkeyRegistration();
    }

    private void ShortcutTextBox_LostFocus(object sender, RoutedEventArgs e)
    {
        if (_loadingSettings) return;
        SavePreviewSettings(sender, e);
        UpdatePreviewHotkeyRegistration();
    }

    private void UpdatePreviewHotkeyRegistration()
    {
        _previewHotKey?.Dispose();
        _previewHotKey = null;
        if (_previewHotkeyEnabled.IsChecked == true)
        {
            var service = new NativeHotKeyService(BuildHotKeyBindings());
            if (service.Start(out var message))
            {
                _previewHotKey = service;
                _previewHotkeyStatus.Text = message;
                _footerStatus.Text = "快捷键守护已启用";
            }
            else
            {
                _loadingSettings = true;
                _previewHotkeyEnabled.IsChecked = false;
                _loadingSettings = false;
                SavePreviewSettings(this, new RoutedEventArgs());
                _previewHotkeyStatus.Text = message;
                _footerStatus.Text = "快捷键注册失败";
            }
        }
        else
        {
            _previewHotkeyStatus.Text = "全局快捷键已关闭。";
            _footerStatus.Text = "快捷键守护已关闭";
        }
    }

    private IReadOnlyList<NativeHotKeyBinding> BuildHotKeyBindings() =>
    [
        new("录屏", "F2", () => EnqueueShortcut("录屏", RunShortcutRecording)),
        new("截图", _shortcutCapture.Text.Trim(), () => EnqueueShortcut("截图", () => RunShortcutCaptureAsync(copyToClipboard: _autoCopy.IsChecked == true, selectRegion: true, annotate: true))),
        new("截图并复制", _shortcutCaptureCopy.Text.Trim(), () => EnqueueShortcut("截图并复制", () => RunShortcutCaptureAsync(copyToClipboard: true, selectRegion: true, annotate: true))),
        new("区域截图", _shortcutArea.Text.Trim(), () => EnqueueShortcut("区域截图", () => RunShortcutCaptureAsync(copyToClipboard: _autoCopy.IsChecked == true, selectRegion: true, annotate: true))),
        new("滚动截图", _shortcutScrollCapture.Text.Trim(), () => EnqueueShortcut("滚动截图", () => RunShortcutCaptureAsync(copyToClipboard: _autoCopy.IsChecked == true, selectRegion: true, annotate: true))),
        new("钉图", _shortcutPin.Text.Trim(), () => EnqueueShortcut("钉图", PinLatestCaptureAsync)),
        new("显示/隐藏贴图", _shortcutTogglePins.Text.Trim(), () => EnqueueShortcut("显示/隐藏贴图", ToggleAllPins)),
        new("显示/隐藏测试边框", "Ctrl+Alt+F10", () => EnqueueShortcut("测试边框", ToggleTestFrame))
    ];

    private void EnqueueShortcut(string label, Func<Task> action)
    {
        if (!DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.High, () => _ = ExecuteShortcutAsync(label, action)))
            System.Diagnostics.Trace.TraceWarning($"{label}快捷键未执行：界面线程不可用。");
    }

    private void EnqueueShortcut(string label, Action action)
    {
        if (!DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.High, () => ExecuteShortcut(label, action)))
            System.Diagnostics.Trace.TraceWarning($"{label}快捷键未执行：界面线程不可用。");
    }

    private async Task ExecuteShortcutAsync(string label, Func<Task> action)
    {
        try
        {
            await action();
        }
        catch (Exception ex)
        {
            _previewHotkeyStatus.Text = $"{label}快捷键执行失败：{ex.Message}";
        }
    }

    private void ExecuteShortcut(string label, Action action)
    {
        try
        {
            action();
        }
        catch (Exception ex)
        {
            _previewHotkeyStatus.Text = $"{label}快捷键执行失败：{ex.Message}";
        }
    }

    private async Task RunShortcutCaptureAsync(bool copyToClipboard, bool selectRegion, bool annotate = false)
    {
        SelectDisplayAtCursor();
        await CaptureSelectedDisplayAsync(copyToClipboard, selectRegion, sourceButton: null, annotate);
    }

    private void RunShortcutRecording()
    {
        if (_recordingState != RecordingState.Idle || _shortcutCaptureRunning) return;
        if (!SelectDisplayAtCursor())
            _recordingStatus.Text = "未能识别鼠标所在显示器，已使用当前显示器。";
        _ = StartRecordingAsync(requestedMode: 3);
    }

    private bool SelectDisplayAtCursor()
    {
        var display = MonitorEnumerator.GetAtCursor();
        if (display is null) return false;

        var index = _displays.FindIndex(item => string.Equals(item.DeviceName, display.DeviceName, StringComparison.OrdinalIgnoreCase));
        if (index < 0) return false;
        if (_displayPicker.SelectedIndex != index) _displayPicker.SelectedIndex = index;
        return true;
    }

    private async Task PinLatestCaptureAsync()
    {
        var path = _lastCapturePath;
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            var folder = string.IsNullOrWhiteSpace(_previewScreenshotDir.Text)
                ? DefaultPreviewCaptureDirectory()
                : _previewScreenshotDir.Text.Trim();
            path = Directory.Exists(folder)
                ? Directory.EnumerateFiles(folder)
                    .Where(file => new[] { ".png", ".jpg", ".jpeg" }.Contains(Path.GetExtension(file), StringComparer.OrdinalIgnoreCase))
                    .OrderByDescending(file => File.GetLastWriteTimeUtc(file))
                    .FirstOrDefault()
                : null;
        }
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            _pinStatus.Text = "没有可钉住的截图。";
            return;
        }
        try
        {
            await PinnedImageWindow.OpenAsync(path);
            _lastCapturePath = path;
            _pinStatus.Text = $"已钉住：{Path.GetFileName(path)}";
        }
        catch (Exception ex)
        {
            _pinStatus.Text = $"钉图失败：{ex.Message}";
        }
    }

    private void ToggleAllPins()
    {
        var visible = PinnedImageWindow.ToggleAllVisibility();
        _pinStatus.Text = visible ? "所有贴图已显示。" : "所有贴图已隐藏。";
    }

    private void ToggleTestFrame()
    {
        if (_frame is null) ShowFrame_Click(this, new RoutedEventArgs());
        else HideFrame();
        _statusText.Text = _frame is null ? "快捷键已隐藏测试边框。" : "快捷键已显示测试边框。";
    }

    private async Task RefreshStartupTaskStatusAsync()
    {
        try
        {
            if (!PortableStartupRegistration.HasPackageIdentity)
            {
                ApplyPortableStartupState(await Task.Run(() => new PortableStartupRegistration().IsRegistered()));
                return;
            }
            var startupTask = await StartupTask.GetAsync("ZhuagepingWinUIStartup");
            ApplyStartupTaskState(startupTask.State);
        }
        catch (Exception ex)
        {
            _startupTaskStatus.Text = $"Windows 启动任务不可用：{ex.Message}";
            _startPreference.IsEnabled = false;
        }
    }

    private async void StartupPreference_Changed(object sender, RoutedEventArgs e)
    {
        if (_loadingSettings) return;
        _startPreference.IsEnabled = false;
        try
        {
            if (!PortableStartupRegistration.HasPackageIdentity)
            {
                var enabled = _startPreference.IsChecked == true;
                await Task.Run(() => new PortableStartupRegistration().SetEnabled(enabled,
                    Environment.ProcessPath ?? throw new InvalidOperationException("无法确定应用路径。")));
                ApplyPortableStartupState(await Task.Run(() => new PortableStartupRegistration().IsRegistered()));
                SavePreviewSettings(sender, e);
                return;
            }
            var startupTask = await StartupTask.GetAsync("ZhuagepingWinUIStartup");
            if (_startPreference.IsChecked == true)
            {
                if (startupTask.State == StartupTaskState.DisabledByUser)
                {
                    _startupTaskStatus.Text = "启动项已在任务管理器中关闭。请到 Windows 设置 > 应用 > 启动中手动启用。";
                }
                else if (startupTask.State == StartupTaskState.DisabledByPolicy)
                {
                    _startupTaskStatus.Text = "此设备策略禁止应用开机启动。";
                }
                else if (startupTask.State == StartupTaskState.Disabled)
                {
                    ApplyStartupTaskState(await startupTask.RequestEnableAsync());
                }
            }
            else if (startupTask.State == StartupTaskState.Enabled)
            {
                startupTask.Disable();
                ApplyStartupTaskState(startupTask.State);
            }
            else
            {
                ApplyStartupTaskState(startupTask.State);
            }
            ApplyStartupTaskState(startupTask.State);
            SavePreviewSettings(sender, e);
        }
        catch (Exception ex)
        {
            _startupTaskStatus.Text = $"更改开机启动失败：{ex.Message}";
            await RefreshStartupTaskStatusAsync();
        }
        finally
        {
            if (!PortableStartupRegistration.HasPackageIdentity) _startPreference.IsEnabled = true;
        }
    }

    private void ApplyPortableStartupState(bool registered)
    {
        _loadingSettings = true;
        _startPreference.IsChecked = registered;
        _loadingSettings = false;
        _previewSettings.LaunchAtStartup = registered;
        _startPreference.IsEnabled = true;
        _startupTaskStatus.Text = registered
            ? "已注册当前用户启动项。若已在 Windows 启动设置中禁用，请在系统中重新启用；移动应用后需重新勾选。"
            : "登录 Windows 后自动启动，支持便携版，无需管理员权限。";
    }

    private void ApplyStartupTaskState(StartupTaskState state)
    {
        _loadingSettings = true;
        _startPreference.IsChecked = state is StartupTaskState.Enabled or StartupTaskState.EnabledByPolicy;
        _loadingSettings = false;
        _previewSettings.LaunchAtStartup = _startPreference.IsChecked == true;
        _startupTaskStatus.Text = state switch
        {
            StartupTaskState.Enabled => "已启用。你也可以在 Windows 设置或任务管理器中管理此启动项。",
            StartupTaskState.EnabledByPolicy => "已由系统策略启用，无法在应用中更改。",
            StartupTaskState.DisabledByUser => "已在 Windows 中禁用。请到 Windows 设置 > 应用 > 启动中手动启用。",
            StartupTaskState.DisabledByPolicy => "此设备策略禁止应用开机启动。",
            _ => "当前未启用开机启动。"
        };
        _startPreference.IsEnabled = state is not (StartupTaskState.DisabledByPolicy or StartupTaskState.EnabledByPolicy);
    }

    private void RefreshDiagnostics()
    {
        try
        {
            var displays = MonitorEnumerator.GetAll();
            var displayLines = displays.Select((display, index) =>
                $"Display {index + 1}{(display.IsPrimary ? " (primary)" : string.Empty)}: {Format(display.OuterBounds)}; work area {Format(display.WorkArea)}");
            _diagnosticsText.Text = string.Join(Environment.NewLine, new[]
            {
                $"OS: {Environment.OSVersion}",
                $"Architecture: {System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture}",
                $"Runtime: {System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription}",
                $"Windows App SDK: 1.7.250606001",
                $"Tray icon created: {MainWindow.Instance?.TrayIsCreated ?? false}",
                $"Displays: {displays.Count}",
                $"Preview settings: {_settingsFile}",
                $"Staged Electron config: {_stagedElectronSettingsFile}",
                $"Preview screenshot output: {_previewScreenshotDir.Text}",
                string.Join(Environment.NewLine, displayLines)
            });
        }
        catch (Exception ex)
        {
            _diagnosticsText.Text = $"诊断读取失败：{ex.Message}";
        }
    }

    private async void ImportSettingsPreview_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var picker = new FileOpenPicker();
            picker.FileTypeFilter.Add(".json");
            picker.ViewMode = PickerViewMode.List;
            InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(MainWindow.Instance!));
            var file = await picker.PickSingleFileAsync();
            if (file is null) return;

            var source = await File.ReadAllTextAsync(file.Path);
            using var document = JsonDocument.Parse(source);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                _migrationStatus.Text = "迁移取消：配置根节点必须是 JSON 对象。";
                return;
            }

            var root = document.RootElement;
            var schema = root.TryGetProperty("settingsSchemaVersion", out var schemaValue) && schemaValue.TryGetInt32(out var version)
                ? version
                : 0;
            if (schema > 2)
            {
                _migrationStatus.Text = $"迁移取消：配置 schema {schema} 高于当前 Electron schema 2，不能安全识别。";
                return;
            }

            var knownFields = PreviewSettings.KnownElectronFields;
            var present = knownFields.Count(key => root.TryGetProperty(key, out _));
            var converted = JsonSerializer.Deserialize<PreviewSettings>(source, SettingsJsonOptions()) ?? new();
            converted.SourceSchemaVersion = schema;
            Directory.CreateDirectory(Path.GetDirectoryName(_settingsFile)!);
            await File.WriteAllTextAsync(_stagedElectronSettingsFile, source);
            _previewSettings = converted;
            await File.WriteAllTextAsync(_settingsFile, JsonSerializer.Serialize(_previewSettings, SettingsJsonOptions()));
            PopulateSettingsControls();
            UpdatePreviewHotkeyRegistration();
            await RefreshStartupTaskStatusAsync();
            var compatibility = schema == 2 ? "schema 匹配" : "旧版/未标版本，导入为预览副本";
            _migrationStatus.Text = $"转换完成：{compatibility}；映射 {present}/{knownFields.Count} 个已知字段，未知字段也已保留。原文件未改动。\n原始副本：{_stagedElectronSettingsFile}\n原生预览配置：{_settingsFile}";
        }
        catch (JsonException ex)
        {
            _migrationStatus.Text = $"JSON 格式无效：{ex.Message}";
        }
        catch (Exception ex)
        {
            _migrationStatus.Text = $"导入预览失败：{ex.Message}";
        }
    }

    private static JsonSerializerOptions SettingsJsonOptions() => new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private static string DefaultPreviewCaptureDirectory()
    {
        var pictures = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);
        return Path.Combine(string.IsNullOrWhiteSpace(pictures)
            ? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
            : pictures, "Zhuageping Preview");
    }

    private static string DefaultPreviewRecordingDirectory()
    {
        var videos = Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
        return Path.Combine(string.IsNullOrWhiteSpace(videos)
            ? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
            : videos, "Zhuageping Preview");
    }

    private sealed class PreviewSettings
    {
        public int PreviewSchemaVersion { get; set; } = 1;
        public int SourceSchemaVersion { get; set; }
        public bool PreviewHotkeyEnabled { get; set; } = true;
        public string Location { get; set; } = "";
        public string Project { get; set; } = "";
        public string Note { get; set; } = "";
        public bool WatermarkEnabled { get; set; } = true;
        public string WatermarkPosition { get; set; } = "bottom-right";
        public bool LaunchAtStartup { get; set; }
        public bool RunAsAdmin { get; set; }
        public bool AutoBackup { get; set; } = true;
        public bool KeepResponsive { get; set; } = true;
        public bool TrayMenu { get; set; } = true;
        public bool AutoCopy { get; set; } = true;
        public bool AutoPinAfterCapture { get; set; }
        public string OutputFormat { get; set; } = "png";
        public string Language { get; set; } = "zh-CN";
        public string Theme { get; set; } = "system";
        public string LogLevel { get; set; } = "normal";
        public string ScreenshotDir { get; set; } = "";
        public string PreviewScreenshotDir { get; set; } = "";
        public string RecordingOutputDir { get; set; } = "";
        public string RecordingMode { get; set; } = "display";
        public string ShortcutCapture { get; set; } = "F1";
        public string ShortcutCaptureCopy { get; set; } = "Ctrl+F1";
        public string ShortcutArea { get; set; } = "Shift+F1";
        public string ShortcutScrollCapture { get; set; } = "Ctrl+Shift+F1";
        public string ShortcutRecord { get; set; } = "F2";
        public string ShortcutPin { get; set; } = "F3";
        public string ShortcutTogglePins { get; set; } = "Shift+F3";
        public int RecordingFps { get; set; } = 30;
        public string RecordingFormat { get; set; } = "mp4";
        public string RecordingQuality { get; set; } = "standard";
        public bool RecordingMic { get; set; }
        public bool RecordingCountdown { get; set; } = true;
        public bool RecordingShowCursor { get; set; } = true;
        public bool RecordingClickHighlight { get; set; } = true;
        [JsonExtensionData]
        public Dictionary<string, JsonElement>? ExtensionData { get; set; }

        public static IReadOnlyList<string> KnownElectronFields { get; } =
        [
            "settingsSchemaVersion", "location", "project", "note", "watermarkEnabled", "watermarkPosition",
            "launchAtStartup", "runAsAdmin", "autoBackup", "keepResponsive", "trayMenu", "autoCopy",
            "autoPinAfterCapture", "outputFormat", "language", "theme", "logLevel", "screenshotDir",
            "shortcutCapture", "shortcutCaptureCopy", "shortcutArea", "shortcutScrollCapture", "shortcutRecord",
            "shortcutPin", "shortcutTogglePins", "recordingFps", "recordingFormat", "recordingQuality",
            "recordingMic", "recordingCountdown", "recordingShowCursor", "recordingClickHighlight"
        ];
    }
}
