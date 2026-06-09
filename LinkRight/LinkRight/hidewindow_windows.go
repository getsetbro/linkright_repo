package main

import (
	"os/exec"
	"syscall"
)

// hideWindow configures the command so that Windows does not create or show
// a console window when the child process is started. This prevents the
// brief terminal "flash" that would otherwise appear when launching browsers
// or protocol handlers from a GUI application.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}
