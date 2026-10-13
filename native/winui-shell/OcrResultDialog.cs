using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Windows.ApplicationModel.DataTransfer;

namespace Zhuageping_WinUI;

internal static class OcrResultDialog
{
    public static async Task<bool> ShowAsync(RapidOcrResult result, TimeSpan elapsed, bool copied, XamlRoot xamlRoot)
    {
        var width = Math.Max(120, Math.Min(620, xamlRoot.Size.Width - 96));
        var height = Math.Max(64, Math.Min(440, xamlRoot.Size.Height - 240));
        var editor = new TextBox
        {
            Text = result.Text,
            AcceptsReturn = true,
            TextWrapping = TextWrapping.Wrap,
            IsSpellCheckEnabled = false,
            IsTextPredictionEnabled = false,
            FontSize = 14,
            Padding = new Thickness(12),
            Height = height,
            CornerRadius = new CornerRadius(6),
            Background = OverlayChrome.Brush(OverlayChrome.Surface),
            Foreground = OverlayChrome.Brush(OverlayChrome.Text),
            BorderBrush = OverlayChrome.Brush(OverlayChrome.Border),
            PlaceholderText = "未识别到文字",
            RequestedTheme = ElementTheme.Dark
        };
        foreach (var key in new[] { "TextControlBackground", "TextControlBackgroundPointerOver", "TextControlBackgroundFocused" })
            editor.Resources[key] = OverlayChrome.Brush(OverlayChrome.Surface);
        foreach (var key in new[] { "TextControlForeground", "TextControlForegroundPointerOver", "TextControlForegroundFocused" })
            editor.Resources[key] = OverlayChrome.Brush(OverlayChrome.Text);
        ScrollViewer.SetHorizontalScrollBarVisibility(editor, ScrollBarVisibility.Disabled);
        ScrollViewer.SetVerticalScrollBarVisibility(editor, ScrollBarVisibility.Auto);
        ScrollViewer.SetHorizontalScrollMode(editor, ScrollMode.Disabled);
        AutomationProperties.SetName(editor, "识别文本");

        var statistics = new TextBlock { FontSize = 12, Foreground = OverlayChrome.Brush(OverlayChrome.Muted) };
        var status = new TextBlock
        {
            Text = !result.Success ? result.Error : result.Lines.Count == 0 ? "未识别到文字" : copied ? "已复制到剪贴板" : "剪贴板暂不可用",
            FontSize = 12,
            TextWrapping = TextWrapping.Wrap,
            Foreground = OverlayChrome.Brush(result.Success ? OverlayChrome.Muted : OverlayChrome.Danger),
            MaxHeight = 72
        };
        AutomationProperties.SetLiveSetting(status, Microsoft.UI.Xaml.Automation.Peers.AutomationLiveSetting.Polite);
        var content = new Grid { Width = width, RowSpacing = 12 };
        content.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        content.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        content.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        content.Children.Add(statistics);
        Grid.SetRow(editor, 1);
        content.Children.Add(editor);
        Grid.SetRow(status, 2);
        content.Children.Add(status);
        var title = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        title.Children.Add(OverlayChrome.Icon("\uEE6F", 20));
        title.Children.Add(new TextBlock { Text = "文字识别", FontSize = 18, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        var dialog = new ContentDialog
        {
            Title = title,
            Content = content,
            PrimaryButtonText = "复制",
            SecondaryButtonText = "重新识别",
            CloseButtonText = "关闭",
            DefaultButton = ContentDialogButton.None,
            RequestedTheme = ElementTheme.Dark,
            MinWidth = 0,
            MaxWidth = width + 48,
            XamlRoot = xamlRoot
        };
        dialog.Resources["ContentDialogMaxWidth"] = width + 48;
        dialog.Resources["ContentDialogMinWidth"] = 0d;
        dialog.Resources["ContentDialogBackground"] = OverlayChrome.Brush(OverlayChrome.Surface);
        dialog.Resources["AccentButtonBackground"] = OverlayChrome.Brush(OverlayChrome.Accent);
        dialog.Resources["AccentButtonForeground"] = OverlayChrome.Brush(OverlayChrome.Surface);
        void UpdateStatistics()
        {
            var value = editor.Text;
            var lines = string.IsNullOrWhiteSpace(value) ? 0 : value.Split('\n').Length;
            statistics.Text = $"{lines} 行 · {value.Length} 字符 · {elapsed.TotalSeconds:0.00} 秒";
            dialog.IsPrimaryButtonEnabled = !string.IsNullOrWhiteSpace(value);
        }
        UpdateStatistics();
        editor.TextChanged += (_, _) =>
        {
            UpdateStatistics();
            status.Text = "内容已修改";
            status.Foreground = OverlayChrome.Brush(OverlayChrome.Muted);
        };
        dialog.PrimaryButtonClick += (_, args) =>
        {
            args.Cancel = true;
            try
            {
                var package = new DataPackage();
                package.SetText(editor.Text);
                Clipboard.SetContent(package);
                status.Text = "已复制到剪贴板";
                status.Foreground = OverlayChrome.Brush(OverlayChrome.Muted);
            }
            catch
            {
                status.Text = "剪贴板暂不可用";
                status.Foreground = OverlayChrome.Brush(OverlayChrome.Danger);
            }
        };
        return await dialog.ShowAsync() == ContentDialogResult.Secondary;
    }
}
