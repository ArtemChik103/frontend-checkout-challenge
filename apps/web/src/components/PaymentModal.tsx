import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { OrderSchema, PaymentSchema, SandboxSchema } from '@checkout/contracts';
import type { Static } from '@sinclair/typebox';
import { api, type AppError } from '../lib/api-client.js';
import { pollUntil } from '../lib/poll.js';
import { formatMoney } from '../lib/format.js';
import { Modal } from './common/Modal.js';
import { Button } from './common/Button.js';
import { Alert } from './common/Alert.js';

type Order = Static<typeof OrderSchema>;
type Payment = Static<typeof PaymentSchema>;
type Sandbox = Static<typeof SandboxSchema>;
type SandboxCard = Sandbox['cards'][number];

export interface PaymentModalProps {
  isOpen: boolean;
  order: Order;
  onPaymentSuccess: (paidOrder: Order) => void;
  onClose: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  order,
  onPaymentSuccess,
  onClose,
}) => {
  const [sandboxCards, setSandboxCards] = useState<SandboxCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [activePayment, setActivePayment] = useState<Payment | null>(null);

  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<AppError | null>(null);
  const [paymentOutcome, setPaymentOutcome] = useState<'failed' | 'cancelled' | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Создание новой попытки оплаты с новым Idempotency-Key (B1)
  const createPaymentAttempt = useCallback(async () => {
    setIsCreatingPayment(true);
    setError(null);
    setPaymentOutcome(null);
    setStatusMessage('');

    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await api.request<Payment>(`/api/orders/${order.id}/payments`, {
        method: 'POST',
        idempotencyKey,
        body: {},
      });
      setActivePayment(res.data);
      return res.data;
    } catch (err) {
      const appErr = err as AppError;
      setError(appErr);
      return null;
    } finally {
      setIsCreatingPayment(false);
    }
  }, [order.id]);

  // Загрузка тестовых карт и создание первой попытки оплаты при открытии
  useEffect(() => {
    if (!isOpen) {
      // При закрытии останавливаем любой активный опрос (B2)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }

    let isMounted = true;

    async function initPayment() {
      setIsLoadingCards(true);
      try {
        const cardsRes = await api.get<Sandbox>('/api/sandbox');
        if (isMounted) {
          setSandboxCards(cardsRes.cards);
          if (cardsRes.cards.length > 0) {
            setSelectedCardId(cardsRes.cards[0].id);
          }
        }
      } catch (err) {
        if (isMounted) setError(err as AppError);
      } finally {
        if (isMounted) setIsLoadingCards(false);
      }

      await createPaymentAttempt();
    }

    initPayment();

    return () => {
      isMounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [isOpen, order.id, createPaymentAttempt]);

  // Запуск симуляции оплаты
  const handleSimulate = async (scenario: 'success' | 'decline' | 'cancel') => {
    if (!activePayment) return;

    setIsProcessing(true);
    setError(null);
    setPaymentOutcome(null);
    setStatusMessage(
      scenario === 'success'
        ? 'Обработка платежа банком...'
        : scenario === 'decline'
          ? 'Имитация отказа карты...'
          : 'Имитация отмены оплаты...',
    );

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // 1. Отправляем симуляцию
      await api.request(`/api/payments/${activePayment.id}/simulations`, {
        method: 'POST',
        body: { scenario },
        signal: abortController.signal,
      });

      // 2. Опрашиваем статус платежа через обобщенный pollUntil (D5, B2)
      const finalPayment = await pollUntil<Payment>({
        fn: async () => {
          return api.get<Payment>(`/api/payments/${activePayment.id}`, {
            signal: abortController.signal,
          });
        },
        isDone: (p) =>
          p.status === 'succeeded' || p.status === 'failed' || p.status === 'cancelled',
        intervalMs: 1000,
        signal: abortController.signal,
      });

      setActivePayment(finalPayment);

      if (finalPayment.status === 'succeeded') {
        setStatusMessage('Платеж подтвержден! Проверяем статус заказа...');
        // Проверяем статус заказа на сервере
        const orderRes = await api.get<Order>(`/api/orders/${order.id}`, {
          signal: abortController.signal,
        });

        if (orderRes.status === 'paid' && orderRes.paymentStatus === 'succeeded') {
          onPaymentSuccess(orderRes);
        } else {
          setError({
            kind: 'http',
            message: 'Заказ еще не получил статус оплаченного. Пожалуйста, обновите страницу.',
          });
        }
      } else if (finalPayment.status === 'failed') {
        setPaymentOutcome('failed');
      } else if (finalPayment.status === 'cancelled') {
        setPaymentOutcome('cancelled');
      }
    } catch (err) {
      const appErr = err as AppError;
      if (appErr.kind !== 'abort') {
        setError(appErr);
      }
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
      abortControllerRef.current = null;
    }
  };

  const selectedCard = sandboxCards.find((c) => c.id === selectedCardId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={isProcessing ? () => {} : onClose}
      title="Оплата банковской картой"
    >
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ color: 'var(--gray-600)' }}>Сумма к оплате:</span>
          <strong style={{ fontSize: '1.25rem' }}>{formatMoney(order.total)}</strong>
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>Заказ № {order.number}</div>
      </div>

      {error && (
        <Alert
          type="error"
          title="Ошибка платежа"
          message={error.message}
          onRetry={createPaymentAttempt}
          retryLabel="Создать новую попытку"
        />
      )}

      {paymentOutcome === 'failed' && (
        <Alert
          type="error"
          title="Отказ в проведении платежа (CARD_DECLINED)"
          message="Банк отклонил операцию по тестовой карте. Заказ сохранен, вы можете повторить попытку оплаты с новым ключом."
        >
          <div style={{ marginTop: '0.75rem' }}>
            <Button
              size="sm"
              variant="primary"
              onClick={createPaymentAttempt}
              isLoading={isCreatingPayment}
            >
              Повторить оплату заказа
            </Button>
          </div>
        </Alert>
      )}

      {paymentOutcome === 'cancelled' && (
        <Alert
          type="warning"
          title="Оплата отменена"
          message="Платеж был отменен. Вы можете возобновить оплату этого заказа в любой момент."
        >
          <div style={{ marginTop: '0.75rem' }}>
            <Button
              size="sm"
              variant="primary"
              onClick={createPaymentAttempt}
              isLoading={isCreatingPayment}
            >
              Попробовать снова
            </Button>
          </div>
        </Alert>
      )}

      {isProcessing && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          <div
            className="btn-spinner"
            style={{
              margin: '0 auto 1rem',
              width: '32px',
              height: '32px',
              color: 'var(--primary)',
            }}
          />
          <p style={{ fontWeight: 600 }}>{statusMessage}</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
            Пожалуйста, не закрывайте страницу
          </p>
        </div>
      )}

      {!isProcessing && !paymentOutcome && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <p
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                marginBottom: '0.75rem',
                color: 'var(--gray-700)',
              }}
            >
              Выберите тестовую карту из Sandbox API:
            </p>
            {isLoadingCards ? (
              <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>
                Загрузка тестовых карт...
              </p>
            ) : (
              sandboxCards.map((card) => (
                <div
                  key={card.id}
                  className={`sandbox-card-item ${selectedCardId === card.id ? 'selected' : ''}`}
                  onClick={() => setSelectedCardId(card.id)}
                  role="radio"
                  aria-checked={selectedCardId === card.id}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      setSelectedCardId(card.id);
                    }
                  }}
                >
                  <div>
                    <div className="sandbox-card-title">{card.title}</div>
                    <div className="sandbox-card-number">{card.maskedNumber}</div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: card.scenario === 'success' ? 'var(--success)' : 'var(--danger)',
                    }}
                  >
                    {card.scenario === 'success' ? '✓ Успех' : '✕ Отказ'}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="payment-actions">
            <Button
              variant="primary"
              size="lg"
              className="full-width"
              disabled={isProcessing || isCreatingPayment || !activePayment || !selectedCard}
              isLoading={isProcessing}
              onClick={() => handleSimulate(selectedCard?.scenario || 'success')}
            >
              Оплатить {formatMoney(order.total)}
            </Button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Button
                variant="danger"
                size="md"
                disabled={isProcessing || !activePayment}
                onClick={() => handleSimulate('decline')}
              >
                Тестовый отказ
              </Button>
              <Button
                variant="outline"
                size="md"
                disabled={isProcessing || !activePayment}
                onClick={() => handleSimulate('cancel')}
              >
                Отмена оплаты
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
};
