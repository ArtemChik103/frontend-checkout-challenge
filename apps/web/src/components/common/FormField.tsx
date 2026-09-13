import React from 'react';

export interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export const FormField: React.FC<FormFieldProps> = ({
  id,
  name,
  label,
  error,
  helperText,
  required,
  className = '',
  ...inputProps
}) => {
  const fieldId = id || name || `field-${Math.random().toString(36).substring(2, 9)}`;
  const errorId = `${fieldId}-error`;
  const helperId = `${fieldId}-helper`;

  const ariaDescribedBy =
    [error ? errorId : null, helperText ? helperId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={fieldId} className="field-label">
        {label}
        {required && (
          <span className="field-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <input
        id={fieldId}
        name={name}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={ariaDescribedBy}
        className={`field-input ${error ? 'input-error' : ''}`}
        {...inputProps}
      />
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
      {!error && helperText && (
        <span id={helperId} className="field-helper">
          {helperText}
        </span>
      )}
    </div>
  );
};
