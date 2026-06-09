package main

import (
	"embed"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	syswindows "golang.org/x/sys/windows"
)

// singleInstanceMutex holds the Windows named mutex handle for the lifetime of
// the process so it is not garbage-collected or closed prematurely.
var singleInstanceMutex syswindows.Handle

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	args := os.Args[1:]

	// Handle --uninstall flag before starting the Wails UI
	for _, arg := range args {
		if arg == "--uninstall" {
			RunUninstall()
			return
		}
	}

	devMode := isDevMode(args)
	app := NewApp(devMode)

	// Detect launch mode from args
	urlArg := extractURLArg(args)
	chooserMode := urlArg != ""

	// Single-instance guard: only enforce for settings mode (not chooser mode).
	// Uses a Windows named mutex so a second settings window cannot be opened.
	if !chooserMode && !devMode {
		const mutexName = "LinkRight_SingleInstance_Mutex"
		mutexNamePtr, _ := syswindows.UTF16PtrFromString(mutexName)
		mutex, mutexErr := syswindows.CreateMutex(nil, false, mutexNamePtr)
		if mutexErr != nil {
			// CreateMutex failed — exit anyway
			os.Exit(0)
		}
		// Store in package-level var so the handle stays alive for the process lifetime.
		singleInstanceMutex = mutex
		if syswindows.GetLastError() == syswindows.ERROR_ALREADY_EXISTS {
			// Another settings window is already open — exit silently
			os.Exit(0)
		}
	}

	// Window dimensions and options depend on mode
	width, height := 900, 650
	minWidth, minHeight := 700, 500
	frameless := true
	alwaysOnTop := false
	resizable := true
	title := "Link Right"

	if chooserMode {
		width, height = 520, 380
		minWidth, minHeight = 520, 380
		title = "Linker"
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
		BackgroundColour: &options.RGBA{R: 13, G: 13, B: 31, A: 255},
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

