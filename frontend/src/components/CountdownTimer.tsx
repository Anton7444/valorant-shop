import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  secondsRemaining: number;
  onExpire?: () => void;
}

export default function CountdownTimer({ secondsRemaining, onExpire }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(secondsRemaining);
  const [prevSecs, setPrevSecs] = useState(secondsRemaining);

  if (secondsRemaining !== prevSecs) {
    setPrevSecs(secondsRemaining);
    setRemaining(secondsRemaining);
  }

  const isExpired = remaining <= 0;

  useEffect(() => {
    if (isExpired) {
      onExpire?.();
      return;
    }

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isExpired, onExpire]);

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  return (
    <div className="flex items-center gap-2 text-accent-teal">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span className="text-lg font-semibold tracking-wide">
        Store refreshes in{' '}
        <span className="font-bold">
          {hours}h {minutes.toString().padStart(2, '0')}m {seconds.toString().padStart(2, '0')}s
        </span>
      </span>
    </div>
  );
}
