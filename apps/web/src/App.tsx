import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  ProductSchema,
  CartSchema,
  CheckoutOptionsSchema,
  OrderSchema,
} from '@checkout/contracts';
import type { Static } from '@sinclair/typebox';
import { api, type AppError } from './lib/api-client.js';
import { useSession } from './hooks/useSession.js';
import { processCartSinglePass, indexProductsById } from './lib/data-processing.js';
import { CatalogView } from './components/CatalogView.js';
import { CartView } from './components/CartView.js';
import { CheckoutView } from './components/CheckoutView.js';
import { PaymentModal } from './components/PaymentModal.js';
import { OrderSuccessView } from './components/OrderSuccessView.js';
import { Alert } from './components/common/Alert.js';

type Product = Static<typeof ProductSchema>;
type Cart = Static<typeof CartSchema>;
type CheckoutOptions = Static<typeof CheckoutOptionsSchema>;
type Order = Static<typeof OrderSchema>;

export const App: React.FC = () => {
  const { sessionToken, isInitializing, error: sessionError, resetSession } = useSession();

  const [activeView, setActiveView] = useState<'catalog' | 'cart' | 'checkout' | 'success'>(
    'catalog',
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [checkoutOptions, setCheckoutOptions] = useState<CheckoutOptions | null>(null);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState<AppError | null>(null);

  // Однопроходная индексация каталога товаров (P1: O(N) вместо вложенных поисков)
  const productsMap = useMemo(() => indexProductsById(products), [products]);

  // Однопроходная агрегация корзины (P1: суммирование, поиск, остатки за один проход)
  const cartSummary = useMemo(() => {
    return processCartSinglePass(cart?.items || [], productsMap);
  }, [cart?.items, productsMap]);

  // Загрузка каталога и корзины
  const loadData = useCallback(async () => {
    if (!sessionToken) return;

    setIsLoading(true);
    setGlobalError(null);

    try {
      const [prodsRes, cartRes] = await Promise.all([
        api.get<Product[]>('/api/products'),
        api.get<Cart>('/api/cart'),
      ]);

      setProducts(prodsRes);
      setCart(cartRes);

      // Проверяем, есть ли незавершенный заказ в localStorage (B2)
      const savedOrderId = localStorage.getItem('checkout_active_order_id');
      if (savedOrderId) {
        try {
          const savedOrder = await api.get<Order>(`/api/orders/${savedOrderId}`);
          setCurrentOrder(savedOrder);
          if (savedOrder.status === 'paid' || savedOrder.status === 'confirmed') {
            setActiveView('success');
          } else if (
            savedOrder.status === 'awaiting_payment' &&
            savedOrder.paymentMethod === 'card'
          ) {
            setActiveView('checkout');
            setIsPaymentOpen(true);
          }
        } catch {
          localStorage.removeItem('checkout_active_order_id');
        }
      }
    } catch (err) {
      setGlobalError(err as AppError);
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (sessionToken) {
      loadData();
    }
  }, [sessionToken, loadData]);

  // Загрузка вариантов оформления при переходе к чекауту
  const loadCheckoutOptions = useCallback(async () => {
    try {
      const res = await api.get<CheckoutOptions>('/api/checkout/options');
      setCheckoutOptions(res);
    } catch (err) {
      setGlobalError(err as AppError);
    }
  }, []);

  const refreshCart = useCallback(async (): Promise<Cart> => {
    const res = await api.get<Cart>('/api/cart');
    setCart(res);
    return res;
  }, []);

  // Добавление товара в корзину (абсолютное количество: PUT /api/cart/items/{id})
  const handleAddToCart = async (product: Product) => {
    const existing = cartSummary.itemMap.get(product.id);
    const newQty = (existing?.quantity || 0) + 1;

    try {
      await api.put(`/api/cart/items/${product.id}`, { quantity: newQty });
      await refreshCart();
    } catch (err) {
      setGlobalError(err as AppError);
    }
  };

  // Изменение количества позиции
  const handleUpdateQuantity = async (productId: string, quantity: number) => {
    try {
      await api.put(`/api/cart/items/${productId}`, { quantity });
      await refreshCart();
    } catch (err) {
      setGlobalError(err as AppError);
    }
  };

  // Удаление позиции
  const handleRemoveItem = async (productId: string) => {
    try {
      await api.delete(`/api/cart/items/${productId}`);
      await refreshCart();
    } catch (err) {
      setGlobalError(err as AppError);
    }
  };

  // Создание заказа
  const handleOrderCreated = (order: Order) => {
    setCurrentOrder(order);
    localStorage.setItem('checkout_active_order_id', order.id);

    if (order.paymentMethod === 'card') {
      setIsPaymentOpen(true);
    } else {
      // Наличные: заказ сразу confirmed
      setActiveView('success');
      refreshCart();
    }
  };

  // Успех онлайн-оплаты
  const handlePaymentSuccess = (paidOrder: Order) => {
    setCurrentOrder(paidOrder);
    setIsPaymentOpen(false);
    setActiveView('success');
    refreshCart();
  };

  const handleStartNewOrder = () => {
    localStorage.removeItem('checkout_active_order_id');
    setCurrentOrder(null);
    setActiveView('catalog');
    refreshCart();
  };

  if (isInitializing) {
    return (
      <div
        className="app-container"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            className="btn-spinner"
            style={{
              width: '40px',
              height: '40px',
              color: 'var(--primary)',
              margin: '0 auto 1rem',
            }}
          />
          <p style={{ fontWeight: 600, color: 'var(--gray-600)' }}>
            Инициализация сессии магазина...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="site-header">
        <div className="header-inner">
          <button
            type="button"
            className="brand"
            onClick={() => setActiveView('catalog')}
            aria-label="Главная страница каталога"
          >
            <svg
              className="brand-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <span>InStat Shop</span>
          </button>

          <nav className="nav-actions" aria-label="Навигация по магазину">
            <button
              type="button"
              className="cart-btn"
              onClick={() => setActiveView('cart')}
              aria-label={`Корзина, товаров: ${cartSummary.totalQuantity}`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              <span>Корзина</span>
              {cartSummary.totalQuantity > 0 && (
                <span className="cart-badge">{cartSummary.totalQuantity}</span>
              )}
            </button>
          </nav>
        </div>
      </header>

      <main className="main-content">
        {sessionError && (
          <Alert
            type="error"
            title="Ошибка инициализации сессии"
            message={sessionError.message}
            onRetry={resetSession}
            retryLabel="Создать новую сессию"
          />
        )}

        {globalError && (
          <Alert
            type="error"
            title="Произошла ошибка"
            message={globalError.message}
            onRetry={loadData}
            retryLabel="Повторить загрузку"
          />
        )}

        {activeView === 'catalog' && (
          <CatalogView
            products={products}
            cartItemMap={cartSummary.itemMap}
            onAddToCart={handleAddToCart}
            isLoading={isLoading}
          />
        )}

        {activeView === 'cart' && (
          <CartView
            cart={cart}
            productsMap={productsMap}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onProceedToCheckout={() => {
              loadCheckoutOptions();
              setActiveView('checkout');
            }}
            onContinueShopping={() => setActiveView('catalog')}
            isLoading={isLoading}
          />
        )}

        {activeView === 'checkout' && cart && (
          <CheckoutView
            cart={cart}
            options={checkoutOptions}
            onOrderCreated={handleOrderCreated}
            onBackToCart={() => setActiveView('cart')}
            onRefreshCart={refreshCart}
          />
        )}

        {activeView === 'success' && currentOrder && (
          <OrderSuccessView order={currentOrder} onContinueShopping={handleStartNewOrder} />
        )}

        {currentOrder && (
          <PaymentModal
            isOpen={isPaymentOpen}
            order={currentOrder}
            onPaymentSuccess={handlePaymentSuccess}
            onClose={() => setIsPaymentOpen(false)}
          />
        )}
      </main>
    </div>
  );
};
