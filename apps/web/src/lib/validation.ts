/**
 * Единый модуль валидации данных формы (D6).
 * Проверяет данные в строгом соответствии со схемами бэкенда.
 */

import type { AppError } from './api-client.js';

export interface CustomerFormData {
  name: string;
  email: string;
  phone: string;
}

export interface AddressFormData {
  city: string;
  street: string;
  house: string;
  apartment: string;
}

export interface FormErrors {
  [key: string]: string | undefined;
}

const PHONE_REGEX = /^\+[1-9]\d{9,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCustomer(data: CustomerFormData): FormErrors {
  const errors: FormErrors = {};

  const trimmedName = data.name.trim();
  if (!trimmedName || trimmedName.length < 2) {
    errors.name = 'Имя должно содержать не менее 2 символов';
  } else if (trimmedName.length > 100) {
    errors.name = 'Имя не должно превышать 100 символов';
  }

  const trimmedEmail = data.email.trim();
  if (!trimmedEmail) {
    errors.email = 'Укажите адрес электронной почты';
  } else if (!EMAIL_REGEX.test(trimmedEmail)) {
    errors.email = 'Некорректный формат email (пример: buyer@example.test)';
  } else if (trimmedEmail.length > 150) {
    errors.email = 'Email слишком длинный';
  }

  const trimmedPhone = data.phone.trim();
  if (!trimmedPhone) {
    errors.phone = 'Укажите номер телефона';
  } else if (!PHONE_REGEX.test(trimmedPhone)) {
    errors.phone =
      'Телефон должен начинаться с + и содержать от 10 до 15 цифр (например +79990000000)';
  }

  return errors;
}

export function validateCourierAddress(data: AddressFormData): FormErrors {
  const errors: FormErrors = {};

  const trimmedCity = data.city.trim();
  if (!trimmedCity || trimmedCity.length < 2) {
    errors.city = 'Укажите город (от 2 символов)';
  }

  const trimmedStreet = data.street.trim();
  if (!trimmedStreet || trimmedStreet.length < 2) {
    errors.street = 'Укажите улицу (от 2 символов)';
  }

  const trimmedHouse = data.house.trim();
  if (!trimmedHouse) {
    errors.house = 'Укажите номер дома';
  }

  return errors;
}

/**
 * Извлекает ошибку конкретного поля из нормализованной ошибки API (AppError).
 * Например, для поля "email" найдет ошибку с path "body/customer/email".
 */
export function extractFieldError(error: AppError | null, fieldKey: string): string | undefined {
  if (!error || !error.fields || error.fields.length === 0) return undefined;

  for (let i = 0; i < error.fields.length; i++) {
    const item = error.fields[i];
    if (item.path.endsWith(fieldKey)) {
      return item.message;
    }
  }

  return undefined;
}
