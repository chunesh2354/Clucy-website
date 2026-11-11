// The demo video. Nothing is requested from YouTube until the visitor presses play
// (privacy-enhanced youtube-nocookie.com embed), so the page stays light and makes no third-party calls on load.

export function mountDemoVideo(root: HTMLElement) {
  const button = root.querySelector<HTMLButtonElement>("[data-video-play]");
  const id = root.dataset.videoId;
  const title = root.dataset.videoTitle || "Clucy demo";
  if (!button || !id) return;
  button.addEventListener("click", () => {
    const frame = document.createElement("iframe");
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
    frame.title = title;
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allowFullscreen = true;
    frame.className = "video-frame";
    button.replaceWith(frame);
    frame.focus();
  });
}
