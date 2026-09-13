import React from 'react';
import type { CartSchema, ProductSchema } from '@checkout/contracts';
import type { Static } from '@sinclair/typebox';
import { formatMoney } from '../lib/format.js';
import { Button } from './common/Button.js';
import { Alert } from './common/Alert.js';

type Cart = Static<typeof CartSchema>;
type Product = Static<typeof ProductSchema>;

export interface CartViewProps {
  cart: Cart | null;
  productsMap: ReadonlyMap<string, Product>;
  onUpdateQuantity: (productId: string, newQuantity: number) => Promise<void>;
  onRemoveItem: (productId: string) => Promise<void>;
  onProceedToCheckout: () => void;
  onContinueShopping: () => void;
  isLoading: boolean;
}

export const CartView: React.FC<CartViewProps> = ({
  cart,
  productsMap,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
  onContinueShopping,
  isLoading,
}) => {
  const items = cart?.items || [];
  const isEmpty = items.length === 0;

  const handleQtyChange = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      onRemoveItem(productId);
    } else {
      onUpdateQuantity(productId, newQty);
    }
  };

  const handleRemove = (productId: string) => {
    onRemoveItem(productId);
  };

  // Проверка превышения остатков в корзине
  let hasStockExceeded = false;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prod = productsMap.get(item.productId);
    if (prod && item.quantity > prod.stock) {
      hasStockExceeded = true;
      break;
    }
  }

  return (
    <section aria-labelledby="cart-title">
      <div className="catalog-header">
        <h1 id="cart-title" className="page-title">
          Корзина
        </h1>
        <p className="page-subtitle">
          {isEmpty ? 'Ваша корзина пуста' : `Товаров в корзине: ${cart?.quantity || 0}`}
        </p>
      </div>

      {hasStockExceeded && (
        <Alert
          type="warning"
          title="Внимание: превышен остаток товара"
          message="Количество некоторых товаров в корзине превышает доступный остаток. Уменьшите количество для оформления."
        />
      )}

      {isEmpty ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <p style={{ color: 'var(--gray-500)', marginBottom: '1.5rem', fontSize: '1.125rem' }}>
            Вы еще не добавили ни одного товара в корзину
          </p>
          <Button variant="primary" onClick={onContinueShopping}>
            Перейти к товарам
          </Button>
        </div>
      ) : (
        <div className="checkout-layout">
          <div className="card">
            <h2 className="card-title">Товары в заказе</h2>
            <div className="cart-items-list" role="list">
              {items.map((item) => {
                const prod = productsMap.get(item.productId);
                const maxStock = prod?.stock ?? 99;
                const isOverStock = item.quantity > maxStock;

                return (
                  <div key={item.productId} className="cart-item" role="listitem">
                    <div className="item-info">
                      <div className="item-title">{item.title}</div>
                      <div className="item-unitPrice">
                        {formatMoney(item.unitPrice)} / шт.
                        {prod && (
                          <span
                            style={{
                              marginLeft: '0.5rem',
                              color: isOverStock ? 'var(--danger)' : 'var(--gray-400)',
                            }}
                          >
                            (в наличии: {prod.stock})
                          </span>
                        )}
                      </div>
                      {isOverStock && prod && (
                        <div
                          style={{
                            color: 'var(--danger)',
                            fontSize: '0.75rem',
                            marginTop: '0.25rem',
                          }}
                        >
                          Превышен лимит! Доступно максимум {prod.stock} шт.
                        </div>
                      )}
                    </div>

                    <div className="item-controls">
                      <div className="qty-control" aria-label="Изменение количества">
                        <button
                          type="button"
                          className="qty-btn"
                          disabled={isLoading || item.quantity <= 1}
                          onClick={() => handleQtyChange(item.productId, item.quantity - 1)}
                          aria-label="Уменьшить на 1"
                        >
                          −
                        </button>
                        <span className="qty-val" aria-live="polite">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          className="qty-btn"
                          disabled={isLoading || item.quantity >= maxStock}
                          onClick={() => handleQtyChange(item.productId, item.quantity + 1)}
                          aria-label="Увеличить на 1"
                        >
                          +
                        </button>
                      </div>

                      <div className="item-line-total">{formatMoney(item.lineTotal)}</div>

                      <button
                        type="button"
                        className="delete-btn"
                        onClick={() => handleRemove(item.productId)}
                        disabled={isLoading}
                        title="Удалить позицию"
                        aria-label={`Удалить ${item.title} из корзины`}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="card summary-box" aria-label="Итог корзины">
            <h2 className="card-title">Итого</h2>
            <div className="summary-row">
              <span>Товары ({cart?.quantity || 0} шт.)</span>
              <span>{formatMoney(cart?.subtotal || 0)}</span>
            </div>
            <div className="summary-row total">
              <span>К оплате</span>
              <span>{formatMoney(cart?.subtotal || 0)}</span>
            </div>
            <div
              style={{
                marginTop: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <Button
                variant="primary"
                size="lg"
                className="full-width"
                disabled={isEmpty || hasStockExceeded || isLoading}
                onClick={onProceedToCheckout}
              >
                Перейти к оформлению
              </Button>
              <Button
                variant="outline"
                size="md"
                className="full-width"
                onClick={onContinueShopping}
              >
                Продолжить покупки
              </Button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
};
