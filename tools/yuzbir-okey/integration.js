(() => {
    const panel = document.getElementById('yuzbir-okey');
    const frame = document.getElementById('okey-frame');
    const shell = document.getElementById('okey-frame-shell');
    function synchronize() {
        const active = panel.classList.contains('active');
        if (active && !frame.hasAttribute('src')) frame.src = frame.dataset.src;
        frame.contentWindow?.postMessage({ type: 'omni-okey-active', active }, location.origin);
    }
    new MutationObserver(synchronize).observe(panel, { attributes: true, attributeFilter: ['class'] });
    frame.addEventListener('load', synchronize);
    document.getElementById('okey-fullscreen').addEventListener('click', async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await shell.requestFullscreen();
        } catch {
            shell.classList.toggle('okey-expanded');
        }
    });
    synchronize();
})();
