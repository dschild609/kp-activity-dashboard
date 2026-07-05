import { parseVideoUrl } from "../lib/video";

/* Responsive 16:9 training-video player. External links (YouTube/Loom/Vimeo)
 * render in an iframe; uploaded files render in a <video> element, which
 * fires onEnded for watch-gating. Fills its container width at any size. */
export function VideoPlayer({ url, onEnded }: { url: string; onEnded?: () => void }) {
  const v = parseVideoUrl(url);
  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      {v.isEmbed ? (
        <iframe
          src={v.src}
          className="absolute inset-0 w-full h-full"
          title="Training video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <video
          src={v.src}
          controls
          controlsList="nodownload"
          onEnded={onEnded}
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}
    </div>
  );
}
