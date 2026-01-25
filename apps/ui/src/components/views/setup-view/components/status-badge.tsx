import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface StatusBadgeProps {
  status:
    | 'installed'
    | 'not_installed'
    | 'checking'
    | 'authenticated'
    | 'not_authenticated'
    | 'error'
    | 'unverified';
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'installed':
      case 'authenticated':
        return {
          icon: <CheckCircle2 className="w-4 h-4" />,
          className: 'bg-green-500/10 text-green-500 border-green-500/20',
        };
      case 'not_installed':
      case 'not_authenticated':
        return {
          icon: <XCircle className="w-4 h-4" />,
          className: 'bg-red-500/10 text-red-500 border-red-500/20',
        };
      case 'error':
        return {
          icon: <XCircle className="w-4 h-4" />,
          className: 'bg-red-500/10 text-red-500 border-red-500/20',
        };
      case 'checking':
        return {
          icon: <Spinner size="sm" />,
          className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        };
      case 'unverified':
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.className}`}
    >
      {config.icon}
      {label}
    </div>
  );
}
