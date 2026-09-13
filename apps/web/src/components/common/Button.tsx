import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  isLoading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  isLoading = false,
  size = 'md',
  disabled,
  className = '',
  ...rest
}) => {
  return (
    <button
      {...rest}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      className={`btn ${variant} ${size} ${className}`}
      style={{ opacity: disabled || isLoading ? 0.6 : 1 }}
    >
      {isLoading ? (
        <span className="btn-spinner-wrapper">
          <svg className="btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle
              cx="12"
              cy="12"
              r="10"
              strokeWidth="4"
              stroke="currentColor"
              strokeDasharray="32"
              strokeLinecap="round"
            />
          </svg>
          <span>Загрузка...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};
