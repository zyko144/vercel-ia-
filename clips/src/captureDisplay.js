import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Les indices Electron et DXGI sont différents, y compris avec plusieurs cartes graphiques.
// Lire les sorties DXGI et leurs rectangles physiques évite de filmer le mauvais écran.
export const DXGI_OUTPUTS = `
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class HistoryCaptureDisplays {
  [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid iid, out IntPtr factory);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int EnumItem(IntPtr self, uint index, out IntPtr item);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetDesc(IntPtr self, out OutputDesc desc);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct OutputDesc {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName;
    public Rect DesktopCoordinates;
    [MarshalAs(UnmanagedType.Bool)] public bool AttachedToDesktop;
    public int Rotation;
    public IntPtr Monitor;
  }
  public class Output { public int adapter, output, x, y, width, height; }
  static T Method<T>(IntPtr obj, int slot) {
    return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj), slot * IntPtr.Size), typeof(T));
  }
  public static Output[] Read() {
    var found = new List<Output>();
    Guid iid = new Guid("770aae78-f26f-4dba-a829-253c83d1b387");
    IntPtr factory; Marshal.ThrowExceptionForHR(CreateDXGIFactory1(ref iid, out factory));
    try {
      var adapters = Method<EnumItem>(factory, 12);
      for (uint a=0; a<32; a++) {
        IntPtr adapter; if (adapters(factory, a, out adapter) < 0) break;
        try {
          var outputs = Method<EnumItem>(adapter, 7);
          for (uint o=0; o<32; o++) {
            IntPtr output; if (outputs(adapter, o, out output) < 0) break;
            try {
              OutputDesc desc; Marshal.ThrowExceptionForHR(Method<GetDesc>(output, 7)(output, out desc));
              var r = desc.DesktopCoordinates;
              if (desc.AttachedToDesktop && r.Right>r.Left && r.Bottom>r.Top)
                found.Add(new Output { adapter=(int)a, output=(int)o, x=r.Left, y=r.Top, width=r.Right-r.Left, height=r.Bottom-r.Top });
            } finally { Marshal.Release(output); }
          }
        } finally { Marshal.Release(adapter); }
      }
    } finally { Marshal.Release(factory); }
    return found.ToArray();
  }
}
'@
ConvertTo-Json -Compress -InputObject @([HistoryCaptureDisplays]::Read())
`;

export async function readCaptureDisplays() {
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', DXGI_OUTPUTS], { windowsHide: true, timeout: 10000, maxBuffer: 128 * 1024 });
  const outputs = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  return Array.isArray(outputs) ? outputs : [outputs];
}

export function matchCaptureDisplay(outputs, bounds, toDip = r => r) {
  const matches = outputs.filter(o => {
    if (!Number.isInteger(o.adapter) || !Number.isInteger(o.output) || o.adapter < 0 || o.output < 0 || !(o.width > 0 && o.height > 0)) return false;
    const r = toDip({ x: o.x, y: o.y, width: o.width, height: o.height });
    return ['x', 'y', 'width', 'height'].every(k => Math.abs(r[k] - bounds[k]) <= 1);
  });
  return matches.length === 1 ? matches[0] : null;
}
