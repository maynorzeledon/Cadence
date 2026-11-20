param([switch]$LoadHelpersOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-TextChange {
    param([string]$Before, [string]$After)
    if ($Before -ceq $After) { return }
    $start = 0
    $commonLength = [Math]::Min($Before.Length, $After.Length)
    while ($start -lt $commonLength -and $Before[$start] -ceq $After[$start]) {
        $start++
    }
    $oldEnd = $Before.Length
    $newEnd = $After.Length
    while ($oldEnd -gt $start -and $newEnd -gt $start -and
           $Before[$oldEnd - 1] -ceq $After[$newEnd - 1]) {
        $oldEnd--
        $newEnd--
    }
    # Keep surrogate pairs intact in the JSON strings.
    if ($start -gt 0 -and [char]::IsHighSurrogate($Before[$start - 1])) {
        $start--
    }
    if ($oldEnd -gt 0 -and $oldEnd -lt $Before.Length -and
        [char]::IsHighSurrogate($Before[$oldEnd - 1])) {
        $oldEnd++
        $newEnd++
    }
    return @{
        offset = $start
        deleted = $Before.Substring($start, $oldEnd - $start)
        inserted = $After.Substring($start, $newEnd - $start)
    }
}

if ($LoadHelpersOnly) { return }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:recording = $false
$script:startedUtc = $null
$script:initialText = ''
$script:previousText = ''
$script:exported = $false
$clock = [System.Diagnostics.Stopwatch]::new()
$history = [System.Collections.Generic.List[object]]::new()

$form = [System.Windows.Forms.Form]::new()
$form.Text = 'Cadence Recorder'
$form.Size = [System.Drawing.Size]::new(850, 560)
$form.MinimumSize = [System.Drawing.Size]::new(640, 390)
$form.StartPosition = 'CenterScreen'
$form.Font = [System.Drawing.Font]::new('Segoe UI', 11)

$layout = [System.Windows.Forms.TableLayoutPanel]::new()
$layout.Dock = 'Fill'
$layout.Padding = [System.Windows.Forms.Padding]::new(16)
$layout.ColumnCount = 1
$layout.RowCount = 4
[void]$layout.RowStyles.Add([System.Windows.Forms.RowStyle]::new('AutoSize'))
[void]$layout.RowStyles.Add([System.Windows.Forms.RowStyle]::new('AutoSize'))
[void]$layout.RowStyles.Add([System.Windows.Forms.RowStyle]::new('Percent', 100))
[void]$layout.RowStyles.Add([System.Windows.Forms.RowStyle]::new('AutoSize'))
$form.Controls.Add($layout)

$instructions = [System.Windows.Forms.Label]::new()
$instructions.AutoSize = $true
$instructions.Text = 'Start a session, then write naturally in the editor. Recording stays inside this editor.'
$layout.Controls.Add($instructions, 0, 0)

$buttons = [System.Windows.Forms.FlowLayoutPanel]::new()
$buttons.AutoSize = $true
$buttons.Dock = 'Fill'
$layout.Controls.Add($buttons, 0, 1)

$start = [System.Windows.Forms.Button]::new()
$stop = [System.Windows.Forms.Button]::new()
$export = [System.Windows.Forms.Button]::new()
$start.Text = 'Start new session'
$stop.Text = 'Stop recording'
$export.Text = 'Export session JSON'
foreach ($button in @($start, $stop, $export)) {
    $button.AutoSize = $true
    $buttons.Controls.Add($button)
}
$stop.Enabled = $false
$export.Enabled = $false

$editor = [System.Windows.Forms.TextBox]::new()
$editor.AccessibleName = 'Writing editor'
$editor.Multiline = $true
$editor.ScrollBars = 'Vertical'
$editor.AcceptsReturn = $true
$editor.AcceptsTab = $true
$editor.ReadOnly = $true
$editor.Dock = 'Fill'
$layout.Controls.Add($editor, 0, 2)

$status = [System.Windows.Forms.Label]::new()
$status.AutoSize = $true
$status.Text = 'Ready. Your session stays in memory until you export it.'
$layout.Controls.Add($status, 0, 3)

function Add-RecordedEvent {
    param([string]$Kind, [hashtable]$Details = @{})
    if (-not $script:recording) { return }
    $elapsed = [Math]::Round($clock.Elapsed.TotalMilliseconds, 3)
    $entry = [ordered]@{
        sequence = $history.Count
        kind = $Kind
        utc = [DateTimeOffset]::UtcNow.ToString('o')
        elapsed_ms = $elapsed
    }
    foreach ($key in $Details.Keys) { $entry[$key] = $Details[$key] }
    $history.Add($entry)
    $status.Text = "Recording   |   $($history.Count) events"
}

function Confirm-Discard {
    if ($history.Count -eq 0 -or $script:exported) { return $true }
    $answer = [System.Windows.Forms.MessageBox]::Show(
        $form, 'This session has not been exported. Discard it?', 'Cadence Recorder',
        'YesNo', 'Question', 'Button2')
    return $answer -eq [System.Windows.Forms.DialogResult]::Yes
}

$editor.Add_KeyDown({
    param($sender, $event)
    Add-RecordedEvent 'key_down' @{
        key = $event.KeyCode.ToString()
        virtual_key = $event.KeyValue
        modifiers = $event.Modifiers.ToString()
    }
})
$editor.Add_KeyUp({
    param($sender, $event)
    Add-RecordedEvent 'key_up' @{
        key = $event.KeyCode.ToString()
        virtual_key = $event.KeyValue
        modifiers = $event.Modifiers.ToString()
    }
})
$editor.Add_Enter({ Add-RecordedEvent 'focus_in' })
$editor.Add_Leave({ Add-RecordedEvent 'focus_out' })
$editor.Add_TextChanged({
    if (-not $script:recording) { return }
    $change = Get-TextChange $script:previousText $editor.Text
    if ($null -ne $change) {
        Add-RecordedEvent 'text_edit' $change
        $script:previousText = $editor.Text
    }
})

$start.Add_Click({
    if (-not (Confirm-Discard)) { return }
    $history.Clear()
    $editor.Clear()
    $script:initialText = $editor.Text
    $script:previousText = $editor.Text
    $script:exported = $false
    $script:startedUtc = [DateTimeOffset]::UtcNow.ToString('o')
    $clock.Restart()
    $script:recording = $true
    Add-RecordedEvent 'session_start'
    $start.Enabled = $false
    $stop.Enabled = $true
    $export.Enabled = $false
    $editor.ReadOnly = $false
    [void]$editor.Focus()
})
$stop.Add_Click({
    Add-RecordedEvent 'session_stop'
    $script:recording = $false
    $clock.Stop()
    $editor.ReadOnly = $true
    $start.Enabled = $true
    $stop.Enabled = $false
    $export.Enabled = $true
    $status.Text = "Stopped   |   $($history.Count) events available to export"
})
$export.Add_Click({
    $dialog = [System.Windows.Forms.SaveFileDialog]::new()
    try {
        $dialog.Filter = 'JSON files (*.json)|*.json'
        $dialog.FileName = 'cadence-session-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json'
        if ($dialog.ShowDialog($form) -ne [System.Windows.Forms.DialogResult]::OK) { return }
        $data = [ordered]@{
            schema_version = 1
            started_utc = $script:startedUtc
            initial_text = $script:initialText
            final_text = $editor.Text
            events = $history.ToArray()
        }
        $json = ConvertTo-Json -InputObject $data -Depth 6
        [System.IO.File]::WriteAllText($dialog.FileName, $json, [System.Text.UTF8Encoding]::new($false))
        $script:exported = $true
        $status.Text = 'Session exported.'
    } catch {
        $status.Text = "Export failed. $($_.Exception.Message)"
    } finally {
        $dialog.Dispose()
    }
})
$form.Add_FormClosing({
    param($sender, $event)
    if (-not (Confirm-Discard)) { $event.Cancel = $true }
})
try {
    [void]$form.ShowDialog()
} finally {
    $form.Dispose()
}
