param([ValidateSet('a','b')][string]$Player = 'a', [switch]$Link)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskDir = Join-Path $taskRoot ".local/native/$Player"
New-Item -ItemType Directory -Force "$taskDir/saves","$taskDir/states","$taskDir/screenshots" | Out-Null
$taskPath = $taskDir.Replace('\','/')
@"
gpsp_bios = "builtin"
gpsp_serial = "mul_poke"
gpsp_drc = "disabled"
gpsp_rtc = "enabled"
gpsp_rtc_time_source = "system"
"@ | Set-Content "$taskDir/core-options.cfg"
@"
config_save_on_exit = "false"
video_driver = "gl"
video_fullscreen = "false"
video_windowed_scale = "3"
video_vsync = "true"
audio_driver = "wasapi"
audio_volume = "-20.0"
pause_nonactive = "false"
input_driver = "dinput"
input_player1_a = "x"
input_player1_b = "z"
input_player1_start = "enter"
input_player1_select = "rshift"
input_player1_up = "up"
input_player1_down = "down"
input_player1_left = "left"
input_player1_right = "right"
savefile_directory = "$taskPath/saves"
savestate_directory = "$taskPath/states"
screenshot_directory = "$taskPath/screenshots"
libretro_log_level = "0"
core_options_path = "$taskPath/core-options.cfg"
netplay_public_announce = "false"
netplay_use_mitm_server = "false"
autosave_interval = "5"
"@ | Set-Content "$taskDir/retroarch.cfg"
$taskExe = Join-Path $taskRoot '.local/tools/retroarch/RetroArch-Win64/retroarch.exe'
$taskCore = Join-Path $taskRoot '.local/tools/gpsp-native/gpsp_libretro.dll'
$taskRom = Join-Path $taskRoot 'pokemon emerald/PokemonQuetzalEnglishAlpha8v4.gba'
$taskArgs = @('-v','--log-file',"`"$taskDir/retroarch.log`"",'-c',"`"$taskDir/retroarch.cfg`"",'-L',"`"$taskCore`"",'--nick',"Quetzal-$Player")
if ($Link) {
  if ($Player -eq 'a') { $taskArgs += '--host' }
  else { $taskArgs += @('--connect','127.0.0.1') }
  $taskArgs += @('--port','55435')
}
$taskArgs += "`"$taskRom`""
# Interactive emulator windows are the test surface; no background console.
Start-Process -FilePath $taskExe -ArgumentList $taskArgs -WorkingDirectory (Split-Path $taskExe) -WindowStyle Normal -PassThru | Select-Object Id
