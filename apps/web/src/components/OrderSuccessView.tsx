import React from 'react';
import type { OrderSchema } from '@checkout/contracts';
import type { Static } from '@sinclair/typebox';
import { formatMoney, formatDateTime } from '../lib/format.js';
import { Button } from './common/Button.js';

type Order = Static<typeof OrderSchema>;

export interface OrderSuccessViewProps {
  order: Order;
  onContinueShopping: () => void;
}

export const OrderSuccessView: React.FC<OrderSuccessViewProps> = ({
  order,
  onContinueShopping,
}) => {
  const isCard = order.paymentMethod === 'card';
  const isPaid = order.status === 'paid' && order.paymentStatus === 'succeeded';
  const isCash = order.paymentMethod === 'cash_on_delivery';

  return (
    <div className="card success-card" role="region" aria-labelledby="success-title">
      <svg
        className="success-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </svg>

      <h1 id="success-title" className="page-title" style={{ marginBottom: '0.5rem' }}>
        {isPaid ? 'Оплата успешно завершена!' : 'Заказ успешно оформлен!'}
      </h1>

      <p className="order-number">Заказ № {order.number}</p>

      {isCash && (
        <div className="alert-box alert-info" style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
          <strong>Заказ оформлен, оплата при получении</strong>
          <p style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>
            Вы сможете оплатить заказ наличными или картой курьеру при доставке либо сотруднику в
            пункте выдачи.
          </p>
        </div>
      )}

      {isCard && isPaid && (
        <div
          className="alert-box alert-success"
          style={{ textAlign: 'left', marginBottom: '1.5rem' }}
        >
          <strong>Оплата подтверждена банком</strong>
          <p style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>
            Статус заказа на сервере: «Оплачен» (paid / succeeded). Чек отправлен на{' '}
            {order.customer.email}.
          </p>
        </div>
      )}

      <div className="order-details-box">
        <h2
          style={{
            fontSize: '1.125rem',
            fontWeight: 700,
            marginBottom: '1rem',
            borderBottom: '1px solid var(--gray-200)',
            paddingBottom: '0.5rem',
          }}
        >
          Детали заказа
        </h2>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>Получатель:</div>
          <div style={{ fontWeight: 600 }}>
            {order.customer.name} ({order.customer.phone}, {order.customer.email})
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>Способ доставки:</div>
          <div style={{ fontWeight: 600 }}>
            {order.delivery.method === 'pickup'
              ? `Самовывоз (ПВЗ: ${order.delivery.pickupPointId})`
              : `Курьер: г. ${order.delivery.address.city}, ул. ${order.delivery.address.street}, д. ${order.delivery.address.house}${order.delivery.address.apartment ? `, кв. ${order.delivery.address.apartment}` : ''}`}
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>Дата оформления:</div>
          <div style={{ fontWeight: 600 }}>{formatDateTime(order.createdAt)}</div>
        </div>

        <div
          style={{ marginTop: '1rem', borderTop: '1px solid var(--gray-200)', paddingTop: '1rem' }}
        >
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Товары:
          </h3>
          {order.items.map((item) => (
            <div
              key={item.productId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.875rem',
                padding: '0.25rem 0',
              }}
            >
              <span>
                {item.title} × {item.quantity}
              </span>
              <strong>{formatMoney(item.lineTotal)}</strong>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: '1rem',
            borderTop: '1px solid var(--gray-200)',
            paddingTop: '0.75rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.875rem',
              color: 'var(--gray-600)',
            }}
          >
            <span>Стоимость товаров:</span>
            <span>{formatMoney(order.subtotal)}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.875rem',
              color: 'var(--gray-600)',
              marginTop: '0.25rem',
            }}
          >
            <span>Доставка:</span>
            <span>{order.shipping === 0 ? 'Бесплатно' : formatMoney(order.shipping)}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '1.125rem',
              fontWeight: 800,
              marginTop: '0.75rem',
              paddingTop: '0.5rem',
              borderTop: '1px dashed var(--gray-200)',
            }}
          >
            <span>Итого:</span>
            <span>{formatMoney(order.total)}</span>
          </div>
        </div>
      </div>

      <Button variant="primary" size="lg" onClick={onContinueShopping}>
        Вернуться в магазин
      </Button>
    </div>
  );
};
