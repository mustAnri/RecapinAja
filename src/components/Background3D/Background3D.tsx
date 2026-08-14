import { useEffect, useRef } from 'react';

/**
 * Decorative 3D background — perspective grid floor, aurora blobs, and
 * floating orbs. The three depth layers shift with the cursor (parallax)
 * so the background feels alive and interactive.
 *
 * Purely visual: `aria-hidden` + `pointer-events-none`, fixed at z-0,
 * so it never intercepts clicks and never affects layout.
 */
export function Background3D() {
  /** Far layer: aurora blobs (slowest parallax). */
  const farRef = useRef<HTMLDivElement>(null);
  /** Mid layer: perspective grid floor. */
  const gridRef = useRef<HTMLDivElement>(null);
  /** Near layer: glowing orbs (fastest parallax). */
  const nearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Respect users who prefer reduced motion — render static layers only.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;

    const onMove = (event: MouseEvent) => {
      targetX = event.clientX / window.innerWidth - 0.5;
      targetY = event.clientY / window.innerHeight - 0.5;
    };

    const tick = () => {
      // Ease toward the cursor for a weighty, floaty feel.
      curX += (targetX - curX) * 0.05;
      curY += (targetY - curY) * 0.05;

      if (farRef.current) {
        farRef.current.style.transform = `translate3d(${(curX * -16).toFixed(2)}px, ${(curY * -12).toFixed(2)}px, 0)`;
      }
      if (gridRef.current) {
        gridRef.current.style.transform = `rotateX(${(58 + curY * 6).toFixed(2)}deg) rotateZ(${(curX * -4).toFixed(2)}deg)`;
      }
      if (nearRef.current) {
        nearRef.current.style.transform = `translate3d(${(curX * 28).toFixed(2)}px, ${(curY * 20).toFixed(2)}px, 0)`;
      }
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove);
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div ref={farRef} className="absolute inset-0 will-change-transform">
        <div className="bg-blob absolute -left-[10%] -top-[15%] h-[60vh] w-[45vw] rounded-full opacity-70" />
        <div
          className="bg-blob-2 absolute -right-[8%] top-[5%] h-[50vh] w-[40vw] rounded-full opacity-60"
          style={{ animationDelay: '-7s' }}
        />
        <div
          className="bg-blob-3 absolute bottom-[12%] left-[25%] h-[45vh] w-[38vw] rounded-full opacity-50"
          style={{ animationDelay: '-14s' }}
        />
      </div>

      {/* Mid layer — perspective grid floor */}
      <div
        className="absolute inset-x-0 bottom-0 h-[55vh] overflow-hidden"
        style={{ perspective: '700px' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div ref={gridRef} className="bg-grid h-[240%] w-[190%] will-change-transform" />
        </div>
      </div>

      {/* Near layer — floating orbs */}
      <div ref={nearRef} className="absolute inset-0 will-change-transform">
        <div className="anim-float absolute left-[12%] top-[28%] h-2.5 w-2.5 rounded-full bg-indigo-400/70 shadow-lg shadow-indigo-500/50" />
        <div
          className="anim-float absolute right-[18%] top-[22%] h-2 w-2 rounded-full bg-violet-400/70 shadow-lg shadow-violet-500/50"
          style={{ animationDelay: '-1.7s' }}
        />
        <div
          className="anim-float absolute left-[38%] top-[64%] h-1.5 w-1.5 rounded-full bg-fuchsia-400/70 shadow-lg shadow-fuchsia-500/50"
          style={{ animationDelay: '-3.1s' }}
        />
        <div
          className="anim-float absolute right-[30%] top-[55%] h-2 w-2 rounded-full bg-sky-400/60 shadow-lg shadow-sky-500/50"
          style={{ animationDelay: '-2.4s' }}
        />
        <div
          className="anim-float absolute left-[65%] top-[12%] h-1.5 w-1.5 rounded-full bg-indigo-300/70 shadow-md shadow-indigo-400/50"
          style={{ animationDelay: '-4s' }}
        />
      </div>
    </div>
  );
}
