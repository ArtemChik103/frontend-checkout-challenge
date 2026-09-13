import React from 'react';
import type { ProductSchema, CartItemSchema } from '@checkout/contracts';
import type { Static } from '@sinclair/typebox';
import { formatMoney } from '../lib/format.js';
import { Button } from './common/Button.js';

type Product = Static<typeof ProductSchema>;
type CartItem = Static<typeof CartItemSchema>;

export interface CatalogViewProps {
  products: ReadonlyArray<Product>;
  cartItemMap: ReadonlyMap<string, CartItem>;
  onAddToCart: (product: Product) => Promise<void>;
  isLoading: boolean;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  products,
  cartItemMap,
  onAddToCart,
  isLoading,
}) => {
  return (
    <section aria-labelledby="catalog-title">
      <div className="catalog-header">
        <h1 id="catalog-title" className="page-title">
          Каталог товаров
        </h1>
        <p className="page-subtitle">Выберите товары и добавьте их в корзину для оформления</p>
      </div>

      <div className="products-grid">
        {products.map((product) => {
          const inCartItem = cartItemMap.get(product.id);
          const currentQty = inCartItem?.quantity || 0;
          const isOutOfStock = product.stock <= 0;
          const isLimitReached = currentQty >= product.stock;

          return (
            <article key={product.id} className="product-card">
              <h2 className="product-title">{product.title}</h2>
              <p className="product-desc">{product.description}</p>
              <div className="product-footer">
                <div>
                  <div className="product-price">{formatMoney(product.price)}</div>
                  <div className={`stock-tag ${isOutOfStock ? 'out' : ''}`}>
                    {isOutOfStock
                      ? 'Нет в наличии'
                      : `Остаток: ${product.stock} шт.${currentQty > 0 ? ` (в корзине: ${currentQty})` : ''}`}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isLimitReached ? 'secondary' : 'primary'}
                  disabled={isOutOfStock || isLimitReached || isLoading}
                  onClick={() => onAddToCart(product)}
                >
                  {isOutOfStock
                    ? 'Распродано'
                    : isLimitReached
                      ? 'Максимум'
                      : currentQty > 0
                        ? '+1 еще'
                        : 'В корзину'}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
