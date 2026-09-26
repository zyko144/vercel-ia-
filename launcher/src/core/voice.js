// Voix du launcher, avec ce que Windows fournit gratuitement (System.Speech, sans internet) :
//  - écoute « Hey History … » : reconnaissance vocale française de Windows, qui envoie chaque phrase entendue ;
//  - réponse à voix haute : voix française de Windows (Hortense, Paul…).
// Aucun texte venu de l'utilisateur n'est collé dans une commande : il passe par une variable d'environnement.
import { spawn } from 'node:child_process';

// Écoute guidée : Windows reconnaît bien mieux une liste de phrases précises (« Hey History, lance <un de tes jeux> »)
// qu'une dictée libre. La dictée reste en secours pour le reste ; « Hey History » seul déclenche l'écoute par Gemini.
const LISTEN = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
try {
  $fr = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -like 'fr*' } | Select-Object -First 1
  if (-not $fr) { [Console]::Out.WriteLine('ERREUR:Aucune reconnaissance vocale en français n''est installée sur Windows.'); exit 2 }
  $r = New-Object System.Speech.Recognition.SpeechRecognitionEngine($fr)
  $r.SetInputToDefaultAudioDevice()
  $S = 'System.Speech.Recognition'
  function Build($parts, $name, $prio) {
    $gb = New-Object "$S.GrammarBuilder"
    $gb.Culture = $fr.Culture
    foreach ($p in $parts) { if ($p -is [array]) { $gb.Append((New-Object "$S.Choices" (,[string[]]$p))) } else { $gb.Append($p) } }
    $g = New-Object "$S.Grammar" ($gb)
    $g.Name = $name; $g.Priority = $prio
    return $g
  }
  $wake = @('hey history', 'eh history', 'ok history', 'history', 'histoire', 'hé histoire', 'et history', 'hey histoire')
  $verbs = @('lance', 'ouvre', 'ferme', 'quitte', 'installe', 'désinstalle', 'vérifie', 'joue à', 'démarre', 'mets', 'lance moi', 'ouvre moi', 'je veux jouer à')
  $names = @($env:HL_NAMES -split "\`n" | Where-Object { $_ -and $_.Length -lt 60 })
  if ($names.Count -gt 0) { $r.LoadGrammar((Build @($wake, $verbs, $names) 'cmd' 10)) }
  $music = @('mets pause', 'pause', 'musique suivante', 'chanson suivante', 'suivant', 'précédent', 'monte le son', 'baisse le son', 'coupe le son', 'reprends la musique', 'remets la musique')
  $r.LoadGrammar((Build @($wake, $music) 'music' 10))
  $views = @('montre mes amis', 'ouvre mes statistiques', 'montre le classement', 'ouvre mon pc', 'optimise mon pc', 'ouvre la bibliothèque', 'montre mes jeux')
  $r.LoadGrammar((Build @($wake, $views) 'view' 10))
  $r.LoadGrammar((Build @(,$wake) 'wake' 5))
  $d = New-Object "$S.DictationGrammar"
  $d.Name = 'dict'; $d.Weight = 0.4
  $r.LoadGrammar($d)
  [Console]::Out.WriteLine('PRET'); [Console]::Out.Flush()
  while ($true) {
    $res = $r.Recognize([TimeSpan]::FromSeconds(10))
    if ($res -and $res.Confidence -gt 0.2) { [Console]::Out.WriteLine('TEXTE:' + $res.Grammar.Name + '|' + [math]::Round($res.Confidence, 2) + '|' + $res.Text); [Console]::Out.Flush() }
  }
} catch { [Console]::Out.WriteLine('ERREUR:' + $_.Exception.Message); exit 1 }
`;

const NUMBERS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
/** Noms prononçables pour la liste d'écoute (« Counter-Strike 2 » → aussi « counter strike deux »). */
export function speakableNames(names) {
  const out = new Set();
  for (const raw of names) {
    const n = String(raw ?? '').replace(/[®™©:!?]/g, '').replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (n.length < 2 || n.length > 55) continue;
    out.add(n);
    const spoken = n.replace(/\b(10|[0-9])\b/g, (d) => NUMBERS[Number(d)]).replace(/\bV\b/g, 'cinq').replace(/\bIV\b/g, 'quatre').replace(/\bIII\b/g, 'trois').replace(/\bII\b/g, 'deux');
    if (spoken !== n) out.add(spoken);
  }
  return [...out].slice(0, 400);
}

/** Découpe « TEXTE:grammaire|confiance|texte ». */
export function parseHeard(line) {
  const m = String(line).match(/^([a-z]+)\|([\d.,]+)\|(.*)$/);
  return m ? { grammar: m[1], confidence: Number(m[2].replace(',', '.')), text: m[3].trim() } : { grammar: 'dict', confidence: 0.5, text: String(line).trim() };
}

/** Démarre l'écoute. onText({ grammar, confidence, text }), onState('pret' | 'erreur', message). Renvoie une fonction pour arrêter. */
export function startListening(onText, onState, { names = [] } = {}) {
  if (process.platform !== 'win32') { onState?.('erreur', 'La voix n’est disponible que sous Windows.'); return () => {}; }
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', LISTEN], { windowsHide: true, env: { ...process.env, HL_NAMES: speakableNames(names).join('\n') } });
  let buffer = '';
  ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (line === 'PRET') onState?.('pret');
      else if (line.startsWith('ERREUR:')) onState?.('erreur', line.slice(7));
      else if (line.startsWith('TEXTE:')) onText(parseHeard(line.slice(6)));
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
