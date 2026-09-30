// Les clics et les vérifications automatiques partagent une seule opération.
export function createUpdateController(updater, { changed, prepare, available = () => {} }) {
  let state = { state: 'idle', version: null, percent: 0, now: false };
  let checking = null, downloading = null, installing = null, ready = false;
  const emit = (patch) => { state = { ...state, ...patch }; changed({ ...state }); };
  const fail = (err) => emit({ state: 'error', error: String(err?.message ?? err).slice(0, 200) });
  updater.autoDownload = false;
  // Installation explicite, après l'arrêt de l'enregistreur et des travaux vidéo.
  updater.autoInstallOnAppQuit = false;
  // Le CDN peut refuser les requêtes différentielles (HTTP 501).
  // Le téléchargement complet conserve la vérification SHA-512 d'electron-updater.
  updater.disableDifferentialDownload = true;
  updater.on('update-available', (info) => {
    const fresh = state.version !== info.version;
    emit({ state: 'available', version: info.version, error: null, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes.replace(/<[^>]+>/g, '').slice(0, 600) : null });
    if (fresh) available(info);
  });
  updater.on('update-not-available', () => emit({ state: 'uptodate', now: false, version: null }));
  updater.on('download-progress', (p) => emit({ state: 'progress', percent: Math.max(0, Math.min(100, Math.round(p.percent || 0))) }));
  updater.on('update-downloaded', (info) => { ready = true; emit({ state: 'ready', version: info.version, percent: 100 }); });
  updater.on('error', fail);
  function check(internal = false) {
    if ((!internal && downloading) || installing || ready) return Promise.resolve();
    if (!checking) {
      emit({ state: 'checking', error: null });
      checking = Promise.resolve().then(() => updater.checkForUpdates()).catch(fail).finally(() => { checking = null; });
    }
    return checking;
  }
  function install() {
    if (!ready) return Promise.resolve(false);
    if (!installing) {
      emit({ state: 'preparing', now: true, error: null });
      installing = Promise.resolve().then(prepare).then(() => {
        emit({ state: 'installing' });
        updater.quitAndInstall(false, true);
        return true;
      }).catch((e) => { fail(e); return false; }).finally(() => { installing = null; });
    }
    return installing;
  }
  function download(now = false) {
    if (now) emit({ now: true });
    if (ready) return now ? install() : Promise.resolve(true);
    if (!downloading) {
      downloading = Promise.resolve().then(async () => {
        if (checking) await checking;
        if (!state.version || state.state === 'error') await check(true);
        if (!state.version || state.state === 'error') return false;
        emit({ state: 'progress', percent: 0, error: null });
        await updater.downloadUpdate();
        if (ready && state.now) await install();
        return ready;
      }).catch((e) => { fail(e); return false; }).finally(() => { downloading = null; });
    }
    return downloading;
  }
  return { get: () => ({ ...state }), check, download, install, canInstall: () => ready, busy: () => Boolean(installing) };
}

// Attend toute l'opération, y compris les étapes entre deux appels à ffmpeg.
export function createMediaJobs() {
  const jobs = new Set();
  let closing = false;
  return {
    get closing() { return closing; },
    run(fn) {
      if (closing) return Promise.reject(new Error('Installation en préparation. Réessaie après le redémarrage.'));
      const job = Promise.resolve().then(fn);
      jobs.add(job);
      void job.then(() => jobs.delete(job), () => jobs.delete(job));
      return job;
    },
    async drain() { closing = true; await Promise.allSettled([...jobs]); },
    reopen() { closing = false; },
  };
}
