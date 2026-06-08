package main

import (
	"syscall"
	"unsafe"
)

var (
	user32               = syscall.NewLazyDLL("user32.dll")
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	procOpenClipboard    = user32.NewProc("OpenClipboard")
	procCloseClipboard   = user32.NewProc("CloseClipboard")
	procGetClipboardData = user32.NewProc("GetClipboardData")
	procGlobalLock       = kernel32.NewProc("GlobalLock")
	procGlobalUnlock     = kernel32.NewProc("GlobalUnlock")
	procMessageBoxW      = user32.NewProc("MessageBoxW")
)

const cfUnicodeText = 13

// ReadClipboardText reads the current clipboard contents as a UTF-16 string
// and returns it as a Go string.  Returns "" on any error.
func ReadClipboardText() string {
	r, _, _ := procOpenClipboard.Call(0)
	if r == 0 {
		return ""
	}
	defer procCloseClipboard.Call()

	h, _, _ := procGetClipboardData.Call(cfUnicodeText)
	if h == 0 {
		return ""
	}

	ptr, _, _ := procGlobalLock.Call(h)
	if ptr == 0 {
		return ""
	}
	defer procGlobalUnlock.Call(h)

	// ptr points to a null-terminated UTF-16 string
	// Walk it to find the length
	p := (*[1 << 20]uint16)(unsafe.Pointer(ptr))
	n := 0
	for p[n] != 0 {
		n++
	}
	return syscall.UTF16ToString(p[:n])
}
