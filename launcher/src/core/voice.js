// Voix du launcher, avec ce que Windows fournit gratuitement (System.Speech, sans internet) :
//  - écoute « Hey History … » : reconnaissance vocale française de Windows, qui envoie chaque phrase entendue ;
//  - réponse à voix haute : voix française de Windows (Hortense, Paul…).
// Aucun texte venu de l'utilisateur n'est collé dans une commande : il passe par une variable d'environnement.
import { spawn } from 'node:child_process';

const LISTEN = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
try {
  $fr = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -like 'fr*' } | Select-Object -First 1
  if (-not $fr) { [Console]::Out.WriteLine('ERREUR:Aucune reconnaissance vocale en français n''est installée sur Windows.'); exit 2 }
  $r = New-Object System.Speech.Recognition.SpeechRecognitionEngine($fr)
  $r.SetInputToDefaultAudioDevice()
  $r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  [Console]::Out.WriteLine('PRET'); [Console]::Out.Flush()
  while ($true) {
    $res = $r.Recognize([TimeSpan]::FromSeconds(10))
    if ($res -and $res.Confidence -gt 0.25) { [Console]::Out.WriteLine('TEXTE:' + $res.Text); [Console]::Out.Flush() }
  }
} catch { [Console]::Out.WriteLine('ERREUR:' + $_.Exception.Message); exit 1 }
`;

/** Démarre l'écoute. onText(phrase) pour chaque phrase, onState('pret' | 'erreur', message). Renvoie une fonction pour arrêter. */
export function startListening(onText, onState) {
  if (process.platform !== 'win32') { onState?.('erreur', 'La voix n’est disponible que sous Windows.'); return () => {}; }
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', LISTEN], { windowsHide: true });
  let buffer = '';
  ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (line === 'PRET') onState?.('pret');
      else if (line.startsWith('ERREUR:')) onState?.('erreur', line.slice(7));
      else if (line.startsWith('TEXTE:')) onText(line.slice(6).trim());
    }
  });
  ps.on('error', (err) => onState?.('erreur', err.message));
  ps.on('exit', (code) => { if (code) onState?.('arret'); });
  return () => { try { ps.kill(); } catch { /* déjà arrêté */ } };
}

/** Réponse à voix haute (voix française de Windows). */
export function speak(text) {
  if (process.platform !== 'win32' || !text) return;
  const cmd = "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'fr*' } | Select-Object -First 1; if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.Rate = 1; $s.Speak($env:HL_SAY)";
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, stdio: 'ignore', env: { ...process.env, HL_SAY: String(text).slice(0, 400) } });
}
