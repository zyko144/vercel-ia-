(() => {
 const clips=document.body.dataset.app==='clips';
 fetch('https://api.github.com/repos/zyko144/vercel-ia-/releases?per_page=30').then(r=>r.ok?r.json():[]).then(list=>{const release=list.find(r=>!r.draft&&!r.prerelease&&r.assets?.some(a=>new RegExp(clips?'History-Clips.*\\.exe$':'History-Launcher.*\\.exe$','i').test(a.name)));if(!release)return;const exe=release.assets.find(a=>new RegExp(clips?'History-Clips.*\\.exe$':'History-Launcher.*\\.exe$','i').test(a.name));document.querySelector('.download').href=exe.browser_download_url;document.getElementById('version').textContent=`${release.name||release.tag_name} · ${Math.round(exe.size/1e6)} Mo`;}).catch(()=>{});
 document.querySelector('video').addEventListener('error',()=>document.getElementById('videoError').hidden=false);
 document.querySelector('video source').addEventListener('error',()=>document.getElementById('videoError').hidden=false);
})();
