/**
 * Единые функции форматирования данных (D6).
 */

const rubleFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

/**
 * Преобразует сумму в копейках в отформатированную строку рублей.
 * Пример: 129000 -> "1 290 ₽"
 */
export function formatMoney(kopecks: number): string {
  const rubles = Math.floor(kopecks / 100);
  return rubleFormatter.format(rubles);
}

/**
 * Форматирует дату и время ISO 8601 в локализованную строку.
 */
export function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}
