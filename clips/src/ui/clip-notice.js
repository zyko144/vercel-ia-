const params = new URLSearchParams(location.search);
document.getElementById('game').textContent = params.get('game') || 'Ton moment est prêt dans la galerie';
// Un seul carillon, sans dépendre des sons ou du mode concentration Windows.
if (params.get('sound') === '1') {
  try {
    const audio = new AudioContext();
    void audio.resume().then(() => {
      const start = audio.currentTime;
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, start);
      oscillator.frequency.setValueAtTime(880, start + .1);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.12, start + .015);
      gain.gain.exponentialRampToValueAtTime(.001, start + .35);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start); oscillator.stop(start + .36);
      oscillator.onended = () => { void audio.close(); };
    }).catch(() => { void audio.close(); });
  } catch { /* La confirmation visuelle reste disponible sans sortie audio. */ }
}
