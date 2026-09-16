import type { ReactNode } from 'react';

export interface ToastNotice {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface Props {
  notices: ToastNotice[];
  onDismiss: (id: string) => void;
  children?: ReactNode;
}

export function NotificationToast({ notices, onDismiss }: Props) {
  if (notices.length === 0) return null;

  return (
    <div className="toast-container" aria-label="Notifications" role="region">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`toast toast--${notice.type}`}
          role={notice.type === 'error' ? 'alert' : 'status'}
        >
          <div className="toast__content">
            <p className="toast__title">{notice.title}</p>
            {notice.description && <p className="toast__desc">{notice.description}</p>}
          </div>

          <div className="toast__actions">
            {notice.action && (
              <button
                type="button"
                className="toast__action-btn"
                onClick={notice.action.onClick}
              >
                {notice.action.label}
              </button>
            )}
            <button
              type="button"
              className="toast__close-btn"
              onClick={() => onDismiss(notice.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
