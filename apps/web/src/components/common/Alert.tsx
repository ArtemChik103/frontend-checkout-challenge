import React from 'react';

export interface AlertProps {
  type?: 'error' | 'warning' | 'success' | 'info';
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  children?: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  title,
  message,
  onRetry,
  retryLabel = 'Повторить попытку',
  className = '',
  children,
}) => {
  return (
    <div
      className={`alert-box alert-${type} ${className}`}
      role={type === 'error' ? 'alert' : 'status'}
    >
      <div className="alert-content">
        {title && <strong className="alert-title">{title}</strong>}
        {message && <p className="alert-message">{message}</p>}
        {children}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="alert-retry-btn">
          {retryLabel}
        </button>
      )}
    </div>
  );
};
