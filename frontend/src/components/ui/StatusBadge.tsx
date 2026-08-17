import { Badge } from './Badge';
import { useI18n } from '@/i18n/I18nContext';

export type StatusType = 
  | 'draft' 
  | 'published' 
  | 'approved' 
  | 'suggested' 
  | 'manual'
  | 'current' 
  | 'superseded' 
  | 'completed' 
  | 'needs_attention' 
  | 'full' 
  | 'over_capacity';

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const { t } = useI18n();
  
  const statusConfig: Record<StatusType, { variant: 'default' | 'success' | 'warning' | 'danger' | 'info'; labelKey: string }> = {
    draft: { variant: 'default', labelKey: 'distribution.status.draft' },
    published: { variant: 'success', labelKey: 'distribution.status.published' },
    approved: { variant: 'success', labelKey: 'distribution.status.approved' },
    suggested: { variant: 'info', labelKey: 'distribution.status.suggested' },
    manual: { variant: 'info', labelKey: 'distribution.status.manual' },
    current: { variant: 'success', labelKey: 'distribution.status.current' },
    superseded: { variant: 'default', labelKey: 'distribution.status.superseded' },
    completed: { variant: 'success', labelKey: 'distribution.status.completed' },
    needs_attention: { variant: 'warning', labelKey: 'distribution.status.needs_attention' },
    full: { variant: 'warning', labelKey: 'distribution.status.full' },
    over_capacity: { variant: 'danger', labelKey: 'distribution.status.over_capacity' },
  };

  const config = statusConfig[status] || { variant: 'default', labelKey: `distribution.status.${status}` };

  return (
    <Badge variant={config.variant} className={className}>
      {t(config.labelKey)}
    </Badge>
  );
}
