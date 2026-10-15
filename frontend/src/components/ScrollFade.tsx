import { useEffect, useRef } from 'react';

// Horizontally scrolling area whose edge fades out only on the side that still
// has content to scroll to (the fade sizes are CSS variables read by .scroll-fade).
export default function ScrollFade({
  children,
  className = '',
  size = 28,
}: {
  children: React.ReactNode;
  className?: string;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const atStart = el.scrollLeft <= 2;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      el.style.setProperty('--fade-l', atStart ? '0px' : `${size}px`);
      el.style.setProperty('--fade-r', atEnd ? '0px' : `${size}px`);
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [size]);

  return (
    <div ref={ref} className={`scroll-fade overflow-x-auto ${className}`}>
      {children}
    </div>
  );
}
