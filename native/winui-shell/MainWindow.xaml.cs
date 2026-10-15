using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Windowing;
using System.Windows.Input;
using Windows.Graphics;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace Zhuageping_WinUI;

/// <summary>
/// The application window. This hosts a Frame that displays pages. Add your
/// UI and logic to MainPage.xaml / MainPage.xaml.cs instead of here so you
/// can use Page features such as navigation events and the Loaded lifecycle.
/// </summary>
public sealed partial class MainWindow : Window
{
    public static MainWindow? Instance { get; private set; }
    public bool TrayIsCreated => TrayIcon.IsCreated;
    private bool _exitRequested;
    private bool _exitInProgress;

    public MainWindow()
    {
        InitializeComponent();
        Instance = this;

        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

        AppWindow.SetIcon(System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico"));
        AppWindow.Resize(new SizeInt32(620, 500));
        Title = "抓个屏 · Windows App SDK 预览";

        // Navigate the root frame to the main page on startup.
        RootFrame.Navigate(typeof(MainPage));

        var menu = new MenuFlyout();
        var openItem = new MenuFlyoutItem { Text = "打开抓个屏预览" };
        openItem.Click += (_, _) => ShowFromTray();
        var exitItem = new MenuFlyoutItem { Text = "退出抓个屏" };
        exitItem.Click += (_, _) => ExitFromTray();
        menu.Items.Add(openItem);
        menu.Items.Add(exitItem);
        TrayIcon.ContextFlyout = menu;
        TrayIcon.DoubleClickCommand = new ActionCommand(ShowFromTray);

        AppWindow.Closing += (_, args) =>
        {
            if (_exitRequested) return;
            args.Cancel = true;
            AppWindow.Hide();
        };
        Closed += (_, _) =>
        {
            TrayIcon.Dispose();
            if (ReferenceEquals(Instance, this)) Instance = null;
        };
    }

    private void ShowFromTray()
    {
        AppWindow.Show();
        Activate();
    }

    private void ExitFromTray()
    {
        if (_exitInProgress) return;
        _exitInProgress = true;
        _exitRequested = true;
        _ = ExitApplicationAsync();
    }

    public void ExitAfterRelaunch() => ExitFromTray();

    private async Task ExitApplicationAsync()
    {
        try
        {
            TrayIcon.ContextFlyout = null;
            TrayIcon.DoubleClickCommand = null;
            if (RootFrame.Content is MainPage page)
                await page.ShutdownAsync();
        }
        catch (Exception exception)
        {
            System.Diagnostics.Trace.TraceError($"Application shutdown cleanup failed: {exception}");
        }
        finally
        {
            try
            {
                Close();
            }
            finally
            {
                Application.Current.Exit();
            }
        }
    }

    private sealed class ActionCommand(Action action) : ICommand
    {
        public event EventHandler? CanExecuteChanged { add { } remove { } }
        public bool CanExecute(object? parameter) => true;
        public void Execute(object? parameter) => action();
    }
}
