; ==========================================
; QUICK CAPTURE AND SNIPPETS (1.6.0)
; ==========================================

; Super + Shift + C: copies the selection in the active window (or
; uses the current clipboard text when nothing is selected) into a new note
; without showing ASCS. The clipboard is restored afterwards.
QuickCapture() {
    global ASCS_PageReady

    if !ASCS_PageReady {
        ShowDesktopTooltip("ASCS is still starting; try again in a moment.")
        return
    }

    source := ""
    try source := WinGetTitle("A")
    previousText := A_Clipboard
    saved := ClipboardAll()
    A_Clipboard := ""
    Send("^c")
    captured := ClipWait(0.5) ? A_Clipboard : ""
    A_Clipboard := saved

    fromClipboard := false
    if (Trim(captured, " `t`r`n") = "") {
        captured := previousText
        fromClipboard := true
    }
    if (Trim(captured, " `t`r`n") = "") {
        ShowDesktopTooltip(
            "Nothing to capture. Select or copy text, then press Super+Shift+C."
        )
        return
    }
    if (StrLen(captured) > 200000)
        captured := SubStr(captured, 1, 200000)

    SendToFrontend(
        '{"type":"captureNote","text":' JsonQuote(captured)
        ',"source":' JsonQuote(SubStr(source, 1, 120)) '}'
    )
    what := fromClipboard ? "clipboard" : "selection"
    ShowDesktopTooltip("Captured " what " to Quick Notes.")
    RecordActivity("note", "Captured " what (source != "" ? " from " SubStr(source, 1, 60) : ""))
}

; Pastes a note into the window that was active before ASCS opened (1.8.0;
; snippets before). The page has filled its placeholders; {clipboard} and
; {cursor} arrive as marks that PrepareNoteText resolves here. The text is
; pasted through the clipboard, which is restored afterwards.
PasteNote(text, *) {
    global ASCS_PreviousWindow

    prepared := PrepareNoteText(text, A_Clipboard)
    text := prepared["text"]
    if (text = "")
        return
    HandleClose()

    target := ASCS_PreviousWindow
    if !(target && WinExist("ahk_id " target)) {
        A_Clipboard := text
        ShowDesktopTooltip("Note copied to the clipboard.")
        return
    }

    try {
        WinActivate("ahk_id " target)
        if !WinWaitActive("ahk_id " target, , 1)
            throw Error("The previous window could not be focused.")
        saved := ClipboardAll()
        A_Clipboard := text
        if !ClipWait(1)
            throw Error("The clipboard did not accept the note.")
        Send("^v")
        ; {cursor}: walk back from the end of what was pasted, once the
        ; target has taken the paste.
        if (prepared["left"] > 0) {
            Sleep(120)
            Send("{Left " prepared["left"] "}")
        }
        SetTimer(() => (A_Clipboard := saved), -500)
        title := ""
        try title := WinGetTitle("ahk_id " target)
        RecordActivity("snippet", "Pasted a note" (title != "" ? " into " SubStr(title, 1, 60) : ""))
    } catch as err {
        A_Clipboard := text
        WriteLog("Note paste failed: " err.Message)
        ShowDesktopTooltip("Note copied to the clipboard; paste it with Ctrl+V.")
    }
}

; Copies a note with its placeholders filled ({clipboard} becomes the
; clipboard's current text; {cursor} is dropped).
CopyNote(text) {
    text := PrepareNoteText(text, A_Clipboard)["text"]
    if (text = "")
        return
    A_Clipboard := text
}

