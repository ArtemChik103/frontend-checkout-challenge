/**
 * Модуль высокопроизводительной обработки данных (Критерии P1, P2).
 *
 * Архитектурные принципы:
 * 1. Отказ от цепочек .map().filter(): они создают промежуточный массив в куче,
 *    нагружают сборщик мусора (GC) и выполняют несколько итераций по коллекции.
 * 2. Использование одиночного прохода O(N) с плотным циклом for (let i = 0; i < len; i++).
 *    Движок V8 оптимизирует такой цикл в мономорфный машинный код без аллокаций промежуточных итераторов.
 * 3. Отказ от квадратичного спреда `{ ...acc, [k]: v }` внутри .reduce().
 * 4. Сохранение упакованных массивов (PACKED_ELEMENTS) без дырок (HOLEY),
 *    что сохраняет максимальную производительность V8.
 */

import type { CartItemSchema, ProductSchema } from '@checkout/contracts';
import type { Static } from '@sinclair/typebox';

type CartItem = Static<typeof CartItemSchema>;
type Product = Static<typeof ProductSchema>;

export interface CartSummary {
  readonly totalQuantity: number;
  readonly subtotalKopecks: number;
  readonly outOfStockIds: ReadonlyArray<string>;
  readonly itemMap: ReadonlyMap<string, CartItem>;
}

/**
 * Однопроходная обработка корзины (P1):
 * Вычисляет суммарное количество, подытог, строит Map для мгновенного O(1) поиска
 * и валидирует остатки относительно каталога товаров — ВСЁ ЗА ОДИН ПРОХОД O(N).
 *
 * Сложность: O(N) по времени, O(N) по памяти (ровно одна структура Map).
 * Исключает 3 отдельных прохода (.map, .reduce, .filter).
 */
export function processCartSinglePass(
  items: ReadonlyArray<CartItem>,
  productsMap: ReadonlyMap<string, Product>,
): CartSummary {
  const len = items.length;
  let totalQuantity = 0;
  let subtotalKopecks = 0;
  const outOfStockIds: string[] = [];
  const itemMap = new Map<string, CartItem>();

  for (let i = 0; i < len; i++) {
    const item = items[i];
    totalQuantity += item.quantity;
    subtotalKopecks += item.lineTotal;
    itemMap.set(item.productId, item);

    // Проверка остатков
    const product = productsMap.get(item.productId);
    if (product && item.quantity > product.stock) {
      outOfStockIds.push(item.productId);
    }
  }

  return {
    totalQuantity,
    subtotalKopecks,
    outOfStockIds,
    itemMap,
  };
}

/**
 * Преобразует массив товаров в Map<id, Product> за один проход O(N).
 * Позволяет выполнять все последующие проверки наличия за O(1) вместо O(N) линейного поиска.
 */
export function indexProductsById(products: ReadonlyArray<Product>): Map<string, Product> {
  const map = new Map<string, Product>();
  const len = products.length;
  for (let i = 0; i < len; i++) {
    const p = products[i];
    map.set(p.id, p);
  }
  return map;
}
