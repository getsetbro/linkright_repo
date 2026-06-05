package main

import (
	"embed"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	args := os.Args[1:]
	devMode := isDevMode(args)
	app := NewApp(devMode)

	// Detect launch mode from args
	urlArg := extractURLArg(args)
	chooserMode := urlArg != ""
	trayMode := isTrayMode(args)

	// Window dimensions and options depend on mode
	width, height := 900, 650
	minWidth, minHeight := 700, 500
	frameless := false
	alwaysOnTop := false
	resizable := true
	title := "Link Right"

	if trayMode {
		width, height = 320, 480
		minWidth, minHeight = 320, 480
		frameless = true
		alwaysOnTop = true
		resizable = false
		title = ""
	} else if chooserMode {
		width, height = 520, 380
		minWidth, minHeight = 520, 380
	}

	err := wails.Run(&options.App{
		Title:         title,
		Width:         width,
		Height:        height,
		MinWidth:      minWidth,
		MinHeight:     minHeight,
		Frameless:     frameless,
		AlwaysOnTop:   alwaysOnTop,
		DisableResize: !resizable,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 30, G: 30, B: 30, A: 255},
		OnStartup:        app.startup,
		OnDomReady:       app.domReady,
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}

// extractURLArg returns the first URL-like argument from the command line.
// Skips flag arguments (starting with --).
func extractURLArg(args []string) string {
	for _, arg := range args {
		if strings.HasPrefix(arg, "--") {
			continue
		}
		if ExtractScheme(arg) != "" {
			return arg
		}
	}
	return ""
}

// isTrayMode returns true when the app was launched with the --tray flag.
func isTrayMode(args []string) bool {
	for _, arg := range args {
		if arg == "--tray" {
			return true
		}
	}
	return false
}
