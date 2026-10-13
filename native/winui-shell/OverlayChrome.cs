using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Zhuageping_WinUI;

internal static class OverlayChrome
{
    public const double CompactButtonSize = 32;
    public static readonly Windows.UI.Color Surface = ColorHelper.FromArgb(255, 32, 34, 37);
    public static readonly Windows.UI.Color Raised = ColorHelper.FromArgb(255, 47, 50, 54);
    public static readonly Windows.UI.Color Pressed = ColorHelper.FromArgb(255, 57, 61, 65);
    public static readonly Windows.UI.Color Border = ColorHelper.FromArgb(255, 69, 74, 80);
    public static readonly Windows.UI.Color Text = ColorHelper.FromArgb(255, 243, 246, 249);
    public static readonly Windows.UI.Color Muted = ColorHelper.FromArgb(255, 166, 178, 190);
    public static readonly Windows.UI.Color Accent = ColorHelper.FromArgb(255, 255, 126, 83);
    public static readonly Windows.UI.Color AccentSoft = ColorHelper.FromArgb(255, 72, 48, 41);
    public static readonly Windows.UI.Color Danger = ColorHelper.FromArgb(255, 255, 108, 103);
    public static readonly Windows.UI.Color DangerSoft = ColorHelper.FromArgb(255, 69, 43, 47);

    private static readonly FontFamily IconFont = new(
        OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000) ? "Segoe Fluent Icons" : "Segoe MDL2 Assets");

    public static SolidColorBrush Brush(Windows.UI.Color color) => new(color);

    public static FontIcon Icon(string glyph, double size = 16) => new()
    {
        Glyph = glyph,
        FontFamily = IconFont,
        FontSize = size,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center
    };

    public static Button IconButton(string glyph, string name, Action action, OverlayButtonTone tone = OverlayButtonTone.Neutral)
    {
        var button = new Button
        {
            Content = Icon(glyph),
            Width = 36,
            Height = 36,
            Padding = new Thickness(0)
        };
        AutomationProperties.SetName(button, name);
        ToolTipService.SetToolTip(button, name);
        _ = new OverlayButtonStyle(button, tone);
        button.Click += (_, _) => action();
        return button;
    }

    public static Button CompactIconButton(string glyph, string name, Action action, OverlayButtonTone tone = OverlayButtonTone.Neutral)
    {
        var button = IconButton(glyph, name, action, tone);
        button.Width = button.Height = CompactButtonSize;
        return button;
    }

    public static Border Divider() => new()
    {
        Width = 1, Height = 20, Margin = new Thickness(4, 0, 4, 0),
        Background = Brush(Border), VerticalAlignment = VerticalAlignment.Center
    };
}

internal enum OverlayButtonTone { Neutral, Accent, Danger, Field }

internal sealed class OverlayButtonStyle
{
    private readonly Button _button;
    private readonly OverlayButtonTone _tone;
    private bool _hovered;
    private bool _pressed;
    private bool _selected;

    public OverlayButtonStyle(Button button, OverlayButtonTone tone = OverlayButtonTone.Neutral)
    {
        _button = button;
        _tone = tone;
        button.CornerRadius = new CornerRadius(6);
        button.BorderThickness = new Thickness(1);
        button.UseSystemFocusVisuals = true;
        button.PointerEntered += (_, _) => { _hovered = true; Refresh(); };
        button.PointerExited += (_, _) => { _hovered = false; _pressed = false; Refresh(); };
        button.PointerPressed += (_, _) => { _pressed = true; Refresh(); };
        button.PointerReleased += (_, _) => { _pressed = false; Refresh(); };
        button.IsEnabledChanged += (_, _) => Refresh();
        Refresh();
    }

    public bool Selected
    {
        get => _selected;
        set { _selected = value; Refresh(); }
    }

    public void Refresh()
    {
        var background = _tone switch
        {
            OverlayButtonTone.Accent => _pressed ? ColorHelper.FromArgb(255, 217, 91, 55)
                : _hovered ? ColorHelper.FromArgb(255, 255, 151, 107) : OverlayChrome.Accent,
            OverlayButtonTone.Danger => _pressed ? ColorHelper.FromArgb(255, 91, 51, 54)
                : _hovered ? ColorHelper.FromArgb(255, 82, 47, 50) : OverlayChrome.DangerSoft,
            OverlayButtonTone.Field => _pressed ? OverlayChrome.Pressed : OverlayChrome.Raised,
            _ => _selected ? OverlayChrome.AccentSoft
                : _pressed ? OverlayChrome.Pressed : _hovered ? OverlayChrome.Raised : Colors.Transparent
        };
        var foreground = _tone switch
        {
            OverlayButtonTone.Accent => OverlayChrome.Surface,
            OverlayButtonTone.Danger => OverlayChrome.Danger,
            _ => _selected ? OverlayChrome.Accent : OverlayChrome.Text
        };
        var border = _tone switch
        {
            OverlayButtonTone.Accent => Colors.Transparent,
            OverlayButtonTone.Danger => _hovered ? OverlayChrome.Danger : OverlayChrome.DangerSoft,
            OverlayButtonTone.Field => _hovered ? OverlayChrome.Border : Colors.Transparent,
            _ => _selected ? OverlayChrome.Accent : _hovered ? OverlayChrome.Border : Colors.Transparent
        };
        _button.Background = OverlayChrome.Brush(background);
        _button.Foreground = OverlayChrome.Brush(foreground);
        _button.BorderBrush = OverlayChrome.Brush(border);
        _button.Opacity = _button.IsEnabled ? 1 : 0.4;
    }
}
