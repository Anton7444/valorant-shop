import type { Wallet } from '../types';

function VPIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 12l10 10 10-10L12 2zm0 3.5L18.5 12 12 18.5 5.5 12 12 5.5z" />
    </svg>
  );
}

function RadianiteIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
    </svg>
  );
}

interface WalletDisplayProps {
  wallet: Wallet;
}

export default function WalletDisplay({ wallet }: WalletDisplayProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1.5 text-text-primary">
        <VPIcon />
        <span className="font-semibold">{wallet.valorant_points.toLocaleString()}</span>
        <span className="text-xs text-text-secondary">VP</span>
      </div>
      <div className="flex items-center gap-1.5 text-accent-teal">
        <RadianiteIcon />
        <span className="font-semibold">{wallet.radianite_points.toLocaleString()}</span>
        <span className="text-xs text-text-secondary">RP</span>
      </div>
    </div>
  );
}
