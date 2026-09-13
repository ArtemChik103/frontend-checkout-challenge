import React, { useState, useEffect, useCallback } from 'react';
import type {
  CartSchema,
  CheckoutOptionsSchema,
  QuoteSchema,
  OrderSchema,
} from '@checkout/contracts';
import type { Static } from '@sinclair/typebox';
import { api, type AppError } from '../lib/api-client.js';
import { formatMoney } from '../lib/format.js';
import {
  validateCustomer,
  validateCourierAddress,
  extractFieldError,
  type CustomerFormData,
  type AddressFormData,
  type FormErrors,
} from '../lib/validation.js';
import { FormField } from './common/FormField.js';
import { Button } from './common/Button.js';
import { Alert } from './common/Alert.js';

type Cart = Static<typeof CartSchema>;
type CheckoutOptions = Static<typeof CheckoutOptionsSchema>;
type Quote = Static<typeof QuoteSchema>;
type Order = Static<typeof OrderSchema>;

export interface CheckoutViewProps {
  cart: Cart;
  options: CheckoutOptions | null;
  onOrderCreated: (order: Order) => void;
  onBackToCart: () => void;
  onRefreshCart: () => Promise<Cart>;
}

export const CheckoutView: React.FC<CheckoutViewProps> = ({
  cart,
  options,
  onOrderCreated,
  onBackToCart,
  onRefreshCart,
}) => {
  // Состояние контактных данных
  const [customer, setCustomer] = useState<CustomerFormData>(() => {
    const saved = localStorage.getItem('checkout_customer_draft');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return { name: 'Тестовый Покупатель', email: 'buyer@example.test', phone: '+79990000000' };
  });

  // Состояние доставки
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'courier'>('pickup');
  const [pickupPointId, setPickupPointId] = useState<string>('point-center');
  const [address, setAddress] = useState<AddressFormData>(() => {
    const saved = localStorage.getItem('checkout_address_draft');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return { city: 'Учебный', street: 'Примерная', house: '10', apartment: '1' };
  });

  // Способ оплаты
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash_on_delivery'>('card');

  // Расчет (Quote)
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<AppError | null>(null);

  // Ошибки формы и отправка заказа
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<AppError | null>(null);

  // Сохранение черновика
  useEffect(() => {
    localStorage.setItem('checkout_customer_draft', JSON.stringify(customer));
  }, [customer]);

  useEffect(() => {
    localStorage.setItem('checkout_address_draft', JSON.stringify(address));
  }, [address]);

  // Запрос расчета Quote
  const fetchQuote = useCallback(
    async (currentCartVersion: number) => {
      setIsQuoting(true);
      setQuoteError(null);

      const deliveryPayload =
        deliveryMethod === 'pickup'
          ? { method: 'pickup' as const, pickupPointId }
          : {
              method: 'courier' as const,
              address: {
                city: address.city.trim(),
                street: address.street.trim(),
                house: address.house.trim(),
                apartment: address.apartment.trim() || undefined,
              },
            };

      try {
        const res = await api.request<Quote>('/api/quotes', {
          method: 'POST',
          body: {
            cartVersion: currentCartVersion,
            delivery: deliveryPayload,
          },
        });
        setQuote(res.data);
      } catch (err) {
        const appErr = err as AppError;
        // Если конфликт версии корзины или истек расчет — обновляем корзину
        if (appErr.code === 'CART_VERSION_CONFLICT' || appErr.code === 'QUOTE_EXPIRED') {
          try {
            const freshCart = await onRefreshCart();
            const retryRes = await api.request<Quote>('/api/quotes', {
              method: 'POST',
              body: {
                cartVersion: freshCart.version,
                delivery: deliveryPayload,
              },
            });
            setQuote(retryRes.data);
            return;
          } catch (retryErr) {
            setQuoteError(retryErr as AppError);
            return;
          }
        }
        setQuoteError(appErr);
      } finally {
        setIsQuoting(false);
      }
    },
    [deliveryMethod, pickupPointId, address, onRefreshCart],
  );

  // Пересчет при смене метода доставки, ПВЗ или версии корзины
  useEffect(() => {
    if (deliveryMethod === 'courier') {
      const addrErrors = validateCourierAddress(address);
      if (Object.keys(addrErrors).length > 0) {
        return; // Не делаем запрос с неполным адресом
      }
    }
    fetchQuote(cart.version);
  }, [
    cart.version,
    deliveryMethod,
    pickupPointId,
    address.city,
    address.street,
    address.house,
    address.apartment,
    fetchQuote,
  ]);

  // Отправка заказа
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Клиентская валидация
    const custErrors = validateCustomer(customer);
    const addrErrors = deliveryMethod === 'courier' ? validateCourierAddress(address) : {};
    const allErrors: FormErrors = { ...custErrors, ...addrErrors };

    if (Object.keys(allErrors).length > 0) {
      setFieldErrors(allErrors);
      return;
    }
    setFieldErrors({});

    if (!quote) {
      setSubmitError({
        kind: 'http',
        message: 'Не удалось рассчитать стоимость доставки. Попробуйте обновить расчет.',
      });
      return;
    }

    setIsSubmitting(true);
    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await api.request<Order>('/api/orders', {
        method: 'POST',
        idempotencyKey,
        body: {
          quoteId: quote.id,
          customer: {
            name: customer.name.trim(),
            email: customer.email.trim(),
            phone: customer.phone.trim(),
          },
          paymentMethod,
        },
      });

      onOrderCreated(res.data);
    } catch (err) {
      const appErr = err as AppError;
      setSubmitError(appErr);

      // Если конфликт версии или расчет устарел — запрашиваем свежий расчет
      if (appErr.code === 'CART_VERSION_CONFLICT' || appErr.code === 'QUOTE_EXPIRED') {
        const freshCart = await onRefreshCart();
        await fetchQuote(freshCart.version);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  type DeliveryMethod = CheckoutOptions['deliveryMethods'][number];
  type PickupPoint = DeliveryMethod['pickupPoints'][number];

  const pickupOptions: PickupPoint[] =
    options?.deliveryMethods.find((m: DeliveryMethod) => m.id === 'pickup')?.pickupPoints || [];

  return (
    <section aria-labelledby="checkout-title">
      <div className="catalog-header">
        <h1 id="checkout-title" className="page-title">
          Оформление заказа
        </h1>
        <p className="page-subtitle">Заполните контактные данные и выберите способ доставки</p>
      </div>

      {submitError && (
        <Alert
          type="error"
          title="Ошибка создания заказа"
          message={submitError.message}
          onRetry={
            quote
              ? () => handleSubmitOrder({ preventDefault: () => {} } as any)
              : () => fetchQuote(cart.version)
          }
          retryLabel="Повторить отправку"
        />
      )}

      {quoteError && (
        <Alert
          type="warning"
          title="Ошибка расчета стоимости"
          message={quoteError.message}
          onRetry={() => fetchQuote(cart.version)}
          retryLabel="Обновить расчет"
        />
      )}

      <form onSubmit={handleSubmitOrder} noValidate>
        <div className="checkout-layout">
          <div>
            {/* Контакты */}
            <div className="card">
              <h2 className="card-title">1. Контактные данные</h2>
              <div className="form-grid">
                <FormField
                  label="Имя получателя"
                  name="name"
                  required
                  value={customer.name}
                  error={fieldErrors.name || extractFieldError(submitError, 'customer/name')}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  placeholder="Иван Иванов"
                />
                <FormField
                  label="Электронная почта"
                  name="email"
                  type="email"
                  required
                  value={customer.email}
                  error={fieldErrors.email || extractFieldError(submitError, 'customer/email')}
                  onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                  placeholder="buyer@example.test"
                />
              </div>
              <FormField
                label="Телефон"
                name="phone"
                type="tel"
                required
                value={customer.phone}
                error={fieldErrors.phone || extractFieldError(submitError, 'customer/phone')}
                helperText="Формат: +79990000000"
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                placeholder="+79990000000"
              />
            </div>

            {/* Доставка */}
            <div className="card">
              <h2 className="card-title">2. Способ доставки</h2>
              <div className="radio-cards" role="radiogroup" aria-label="Выбор способа доставки">
                <label className={`radio-card ${deliveryMethod === 'pickup' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="pickup"
                    checked={deliveryMethod === 'pickup'}
                    onChange={() => setDeliveryMethod('pickup')}
                  />
                  <div>
                    <div className="radio-card-title">Самовывоз</div>
                    <div className="radio-card-desc">Бесплатно из пункта выдачи</div>
                  </div>
                </label>

                <label className={`radio-card ${deliveryMethod === 'courier' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="courier"
                    checked={deliveryMethod === 'courier'}
                    onChange={() => setDeliveryMethod('courier')}
                  />
                  <div>
                    <div className="radio-card-title">Курьерская доставка</div>
                    <div className="radio-card-desc">390 ₽ (бесплатно от 5 000 ₽)</div>
                  </div>
                </label>
              </div>

              {deliveryMethod === 'pickup' && (
                <div className="form-field">
                  <label htmlFor="pickup-select" className="field-label">
                    Пункт выдачи заказа <span className="field-required">*</span>
                  </label>
                  <select
                    id="pickup-select"
                    className="field-select"
                    value={pickupPointId}
                    onChange={(e) => setPickupPointId(e.target.value)}
                  >
                    {pickupOptions.map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.title} — {pt.address}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {deliveryMethod === 'courier' && (
                <div>
                  <div className="form-grid">
                    <FormField
                      label="Город"
                      name="city"
                      required
                      value={address.city}
                      error={fieldErrors.city || extractFieldError(submitError, 'address/city')}
                      onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    />
                    <FormField
                      label="Улица"
                      name="street"
                      required
                      value={address.street}
                      error={fieldErrors.street || extractFieldError(submitError, 'address/street')}
                      onChange={(e) => setAddress({ ...address, street: e.target.value })}
                    />
                  </div>
                  <div className="form-grid">
                    <FormField
                      label="Дом"
                      name="house"
                      required
                      value={address.house}
                      error={fieldErrors.house || extractFieldError(submitError, 'address/house')}
                      onChange={(e) => setAddress({ ...address, house: e.target.value })}
                    />
                    <FormField
                      label="Квартира / офис"
                      name="apartment"
                      value={address.apartment}
                      onChange={(e) => setAddress({ ...address, apartment: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Способ оплаты */}
            <div className="card">
              <h2 className="card-title">3. Способ оплаты</h2>
              <div className="radio-cards" role="radiogroup" aria-label="Выбор способа оплаты">
                <label className={`radio-card ${paymentMethod === 'card' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="card"
                    checked={paymentMethod === 'card'}
                    onChange={() => setPaymentMethod('card')}
                  />
                  <div>
                    <div className="radio-card-title">Банковская карта</div>
                    <div className="radio-card-desc">Тестовая оплата через Sandbox API</div>
                  </div>
                </label>

                <label
                  className={`radio-card ${paymentMethod === 'cash_on_delivery' ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="cash_on_delivery"
                    checked={paymentMethod === 'cash_on_delivery'}
                    onChange={() => setPaymentMethod('cash_on_delivery')}
                  />
                  <div>
                    <div className="radio-card-title">При получении</div>
                    <div className="radio-card-desc">
                      Оплата наличными или картой курьеру / в ПВЗ
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Итоговая колонка с суммами из Quote */}
          <aside className="card summary-box" aria-label="Расчет заказа">
            <h2 className="card-title">Ваш заказ</h2>
            <div className="summary-row">
              <span>Товары ({cart.quantity} шт.)</span>
              <span>{formatMoney(quote?.subtotal ?? cart.subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>Доставка</span>
              <span>
                {isQuoting
                  ? 'Расчет...'
                  : quote
                    ? quote.shipping === 0
                      ? 'Бесплатно'
                      : formatMoney(quote.shipping)
                    : '—'}
              </span>
            </div>
            <div className="summary-row total">
              <span>Итого к оплате</span>
              <span>{isQuoting ? '...' : formatMoney(quote?.total ?? cart.subtotal)}</span>
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
                type="submit"
                variant="primary"
                size="lg"
                className="full-width"
                isLoading={isSubmitting || isQuoting}
                disabled={isSubmitting || isQuoting || !quote}
              >
                {paymentMethod === 'card' ? 'Перейти к оплате' : 'Подтвердить заказ'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                className="full-width"
                onClick={onBackToCart}
                disabled={isSubmitting}
              >
                Вернуться в корзину
              </Button>
            </div>
          </aside>
        </div>
      </form>
    </section>
  );
};
