import type { Product, Cart, Order, Customer, Delivery } from '@checkout/contracts';

type CartItem = Cart['items'][number];

export const products: Product[] = [
  {
    id: 'lamp-orbit',
    sku: 'DEMO-001',
    title: 'Настольная лампа «Орбита»',
    description: 'Компактная лампа с тёплым светом для рабочего стола.',
    price: 249000,
    currency: 'RUB',
    stock: 10,
  },
  {
    id: 'mug-line',
    sku: 'DEMO-002',
    title: 'Кружка «Линия»',
    description: 'Керамическая кружка, 350 мл.',
    price: 89000,
    currency: 'RUB',
    stock: 20,
  },
  {
    id: 'bag-day',
    sku: 'DEMO-003',
    title: 'Сумка «День»',
    description: 'Тканевая сумка для ежедневных покупок.',
    price: 159000,
    currency: 'RUB',
    stock: 5,
  },
  {
    id: 'clock-dot',
    sku: 'DEMO-004',
    title: 'Часы «Точка»',
    description: 'Учебный пример товара, которого нет в наличии.',
    price: 329000,
    currency: 'RUB',
    stock: 0,
  },
];

export const checkoutOptions = {
  deliveryMethods: [
    {
      id: 'pickup' as const,
      title: 'Самовывоз',
      price: 0,
      freeFrom: null,
      pickupPoints: [
        { id: 'point-center', title: 'Центральный пункт', address: 'г. Москва, ул. Примерная, 1' },
        { id: 'point-north', title: 'Северный пункт', address: 'г. Москва, ул. Макетная, 7' },
      ],
    },
    { id: 'courier' as const, title: 'Курьер', price: 39000, freeFrom: 500000, pickupPoints: [] },
  ],
  paymentMethods: [
    { id: 'card' as const, title: 'Картой онлайн (тестовая оплата)' },
    { id: 'cash_on_delivery' as const, title: 'Наличными при получении' },
  ],
  testCards: [
    {
      id: 'test-success',
      title: 'Тестовая карта: успешная оплата',
      maskedNumber: '•••• 4242',
      scenario: 'success' as const,
    },
    {
      id: 'test-decline',
      title: 'Тестовая карта: отказ банка',
      maskedNumber: '•••• 0002',
      scenario: 'decline' as const,
    },
  ],
};

const STORAGE_CART_KEY = 'checkout_mock_cart_v1';
const STORAGE_ORDERS_KEY = 'checkout_mock_orders_v1';

export class MockCheckoutStore {
  public getSession(): { token: string; id: string } {
    return {
      token: 'guest_token_' + Math.random().toString(36).substring(2, 12),
      id: 'session_' + Math.random().toString(36).substring(2, 12),
    };
  }

  public getProducts(): Product[] {
    return products;
  }

  public getCart(): Cart {
    try {
      const raw = localStorage.getItem(STORAGE_CART_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}

    const initialCart: Cart = {
      id: '00000000-0000-4000-8000-000000000001',
      version: 1,
      items: [
        {
          productId: 'lamp-orbit',
          title: 'Настольная лампа «Орбита»',
          unitPrice: 249000,
          quantity: 1,
          lineTotal: 249000,
        },
      ],
      quantity: 1,
      subtotal: 249000,
      currency: 'RUB',
    };
    this.saveCart(initialCart);
    return initialCart;
  }

  public saveCart(cart: Cart): void {
    try {
      localStorage.setItem(STORAGE_CART_KEY, JSON.stringify(cart));
    } catch {}
  }

  public setCartItem(productId: string, quantity: number): Cart {
    const cart = this.getCart();
    const prod = products.find((p) => p.id === productId);
    if (!prod) return cart;

    const existingIndex = cart.items.findIndex((item) => item.productId === productId);
    if (quantity <= 0) {
      if (existingIndex >= 0) cart.items.splice(existingIndex, 1);
    } else {
      const safeQty = Math.min(quantity, prod.stock);
      const item: CartItem = {
        productId: prod.id,
        title: prod.title,
        unitPrice: prod.price,
        quantity: safeQty,
        lineTotal: prod.price * safeQty,
      };
      if (existingIndex >= 0) {
        cart.items[existingIndex] = item;
      } else {
        cart.items.push(item);
      }
    }

    cart.quantity = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    cart.subtotal = cart.items.reduce((sum, i) => sum + i.lineTotal, 0);
    cart.version += 1;
    this.saveCart(cart);
    return cart;
  }

  public clearCart(): Cart {
    const cart: Cart = {
      id: '00000000-0000-4000-8000-000000000001',
      version: this.getCart().version + 1,
      items: [],
      quantity: 0,
      subtotal: 0,
      currency: 'RUB',
    };
    this.saveCart(cart);
    return cart;
  }

  public getCheckoutOptions() {
    return checkoutOptions;
  }

  public createOrder(body: any): Order {
    const id = crypto.randomUUID();
    const cart = this.getCart();
    const deliveryMethod = checkoutOptions.deliveryMethods.find((d: any) => d.id === body.delivery?.method) || checkoutOptions.deliveryMethods[0];
    const deliveryCost = (deliveryMethod.freeFrom && cart.subtotal >= deliveryMethod.freeFrom) ? 0 : deliveryMethod.price;
    const total = cart.subtotal + deliveryCost;

    const order: Order = {
      id,
      number: `#${Math.floor(1000 + Math.random() * 9000)}`,
      status: body.payment?.method === 'card' ? 'awaiting_payment' : 'confirmed',
      paymentStatus: body.payment?.method === 'card' ? 'pending' : 'unpaid',
      paymentMethod: body.payment?.method || 'card',
      customer: body.customer as Customer,
      delivery: body.delivery as Delivery,
      items: [...cart.items],
      subtotal: cart.subtotal,
      shipping: deliveryCost,
      total,
      currency: 'RUB',
      createdAt: new Date().toISOString(),
    };

    try {
      const orders = this.getOrders();
      orders[id] = order;
      localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(orders));
    } catch {}

    this.clearCart();
    return order;
  }

  public getOrders(): Record<string, Order> {
    try {
      const raw = localStorage.getItem(STORAGE_ORDERS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  public getOrder(id: string): Order | null {
    return this.getOrders()[id] || null;
  }

  public payOrder(orderId: string, scenario: 'success' | 'decline' = 'success'): Order {
    const orders = this.getOrders();
    const order = orders[orderId];
    if (order) {
      if (scenario === 'success') {
        order.status = 'paid';
        order.paymentStatus = 'succeeded';
      } else {
        order.paymentStatus = 'failed';
      }
      orders[orderId] = order;
      try {
        localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(orders));
      } catch {}
    }
    return order;
  }
}

export const mockStore = new MockCheckoutStore();
