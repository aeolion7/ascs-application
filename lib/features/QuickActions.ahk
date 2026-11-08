; ==========================================
; QUICK ACTIONS (1.7.0)
; ==========================================

SendQuickActions() {
    global ASCS_QuickActions

    if !IsObject(ASCS_QuickActions) {
        SendToFrontend('{"type":"quickActions","items":null}')
        return
    }
    json := "["
    for index, id in ASCS_QuickActions
        json .= (index > 1 ? "," : "") JsonQuote(id)
    SendToFrontend('{"type":"quickActions","items":' json ']}')
}

SaveQuickActions(content) {
    global ASCS_SettingsFile
    global ASCS_QuickActions

    try {
        ids := ParseQuickActionsPayload(content)
        IniDelete(ASCS_SettingsFile, "QuickActions")
        IniWrite(ids.Length, ASCS_SettingsFile, "QuickActions", "Count")
        for index, id in ids
            IniWrite(id, ASCS_SettingsFile, "QuickActions", "Action" index)
        ASCS_QuickActions := ids
    } catch as err {
        WriteLog("Quick actions save failed: " err.Message)
        SendToFrontend('{"type":"error","scope":"quickActions","message":' JsonQuote(err.Message) '}')
    }
    SendQuickActions()
}
