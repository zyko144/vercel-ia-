// Volume d'une appli précise (« baisse le son de Discord ») : mélangeur de volume de Windows (Core Audio),
// sans rien installer. Le nom de l'appli passe par une variable d'environnement, jamais collé dans le script.
import { execFile } from 'node:child_process';

export const APPVOL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Diagnostics;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator { int NotImpl1(); [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionManager2 { int NotImpl1(); int NotImpl2(); [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e); }
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionEnumerator { [PreserveSig] int GetCount(out int n); [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s); }
[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionControl2 { int N0(); int N1(); int N2(); int N3(); int N4(); int N5(); int N6(); int N7(); int N8(); int N9(); int N10(); [PreserveSig] int GetProcessId(out int pid); }
[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISimpleAudioVolume { [PreserveSig] int SetMasterVolume(float l, ref Guid c); [PreserveSig] int GetMasterVolume(out float l); [PreserveSig] int SetMute(bool m, ref Guid c); [PreserveSig] int GetMute(out bool m); }
public static class AppVol {
  public static int Set(string app, string mode) {
    var en = (IMMDeviceEnumerator)(new MMDeviceEnumerator()); IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
    var iid = typeof(IAudioSessionManager2).GUID; object o; dev.Activate(ref iid, 23, IntPtr.Zero, out o);
    IAudioSessionEnumerator list; ((IAudioSessionManager2)o).GetSessionEnumerator(out list);
    int n; list.GetCount(out n); int done = 0; var g = Guid.Empty;
    for (int i = 0; i < n; i++) {
      IAudioSessionControl2 s; list.GetSession(i, out s); int pid; s.GetProcessId(out pid); if (pid == 0) continue;
      string name; try { name = Process.GetProcessById(pid).ProcessName; } catch { continue; }
      if (name.IndexOf(app, StringComparison.OrdinalIgnoreCase) < 0) continue;
      var v = (ISimpleAudioVolume)s; float cur; v.GetMasterVolume(out cur);
      if (mode == "mute") v.SetMute(true, ref g);
      else { v.SetMute(false, ref g); v.SetMasterVolume(mode == "down" ? Math.Max(0.05f, cur * 0.4f) : 1f, ref g); }
      done++;
    }
    return done;
  }
}
"@
[Console]::Out.Write([AppVol]::Set($env:HL_APP, $env:HL_MODE))
`;

/** mode : 'down' (baisse), 'up' (volume à fond), 'mute' (coupe). Renvoie le nombre de sons modifiés. */
export function setAppVolume(app, mode) {
  if (process.platform !== 'win32' || !/^[\w .-]{2,40}$/.test(String(app)) || !['down', 'up', 'mute'].includes(mode)) return Promise.resolve(0);
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', APPVOL_SCRIPT], { windowsHide: true, timeout: 20_000, env: { ...process.env, HL_APP: String(app).trim(), HL_MODE: mode } }, (err, out) => resolve(err ? 0 : Number(String(out).trim()) || 0)));
}
