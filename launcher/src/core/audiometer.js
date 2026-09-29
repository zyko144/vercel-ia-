// Niveau sonore de Spotify seulement (pas du jeu ni du reste) : compteur de crête Windows (Core Audio) de ses
// sessions audio, lu ~12 fois par seconde par un PowerShell qui écrit une valeur 0..1 par ligne.
export const SPOTIFY_METER_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom {}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int NotImpl1(); [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev); }
[Guid("D666063F-1587-4E43-81F1-B948E807363E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 { int NotImpl1(); int NotImpl2(); [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e); }
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator { [PreserveSig] int GetCount(out int n); [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s); }
[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 { int N1(); int N2(); int N3(); int N4(); int N5(); int N6(); int N7(); int N8(); int N9(); int N10(); int N11(); [PreserveSig] int GetProcessId(out uint pid); }
[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation { [PreserveSig] int GetPeakValue(out float v); }
public static class SpMeter {
  public static float Peak(uint[] pids) {
    float max = 0;
    var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
    IMMDevice dev; if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0) return 0;
    Guid iid = typeof(IAudioSessionManager2).GUID; object o; dev.Activate(ref iid, 23, IntPtr.Zero, out o);
    IAudioSessionEnumerator se; ((IAudioSessionManager2)o).GetSessionEnumerator(out se);
    int n; se.GetCount(out n);
    for (int i = 0; i < n; i++) {
      IAudioSessionControl2 s; se.GetSession(i, out s); uint pid; s.GetProcessId(out pid);
      if (Array.IndexOf(pids, pid) < 0) continue;
      float v; ((IAudioMeterInformation)s).GetPeakValue(out v); if (v > max) max = v;
    }
    return max;
  }
}
"@
$pids = [uint32[]]@(); $i = 0
while ($true) {
  if ($i % 25 -eq 0) { $pids = [uint32[]]@(Get-Process Spotify -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }) }
  $i++
  $v = 0; if ($pids.Count) { try { $v = [SpMeter]::Peak($pids) } catch { $v = 0 } }
  [Console]::Out.WriteLine($v.ToString('0.000', [Globalization.CultureInfo]::InvariantCulture))
  Start-Sleep -Milliseconds 80
}
`;
