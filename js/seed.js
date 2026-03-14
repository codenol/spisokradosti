'use strict';

// Pre-populated mansions from poidem.moscow
const SEED_ITEMS = [
  {
    id: 'seed_mansion_konshinoy',
    category: 'place',
    placeType: 'mansion',
    title: 'Особняк Дом А.И. Коншиной',
    description: 'Сейчас здесь находится «Дом учёных». Вход свободный — скажите на входе, что идёте поесть.',
    priceText: 'Бесплатно',
    website: '',
    priority: 2,
    createdAt: 1700000001000,
    visits: [],
    location: {
      lat: 55.7452,
      lng: 37.5934,
      address: 'Пречистенка, 16/2 (м. Кропоткинская), Москва',
    },
  },
  {
    id: 'seed_mansion_nosova',
    category: 'place',
    placeType: 'mansion',
    title: 'Особняк купца Носова',
    description: 'Можно попасть с экскурсией.',
    priceText: 'Экскурсия',
    website: '',
    priority: 2,
    createdAt: 1700000002000,
    visits: [],
    location: {
      lat: 55.7833,
      lng: 37.6968,
      address: 'Электрозаводская ул., 12, стр. 1 (м. Электрозаводская), Москва',
    },
  },
  {
    id: 'seed_mansion_leman',
    category: 'place',
    placeType: 'mansion',
    title: 'Особняк Леман',
    description: 'Можно попасть с экскурсией.',
    priceText: 'Экскурсия',
    website: '',
    priority: 2,
    createdAt: 1700000003000,
    visits: [],
    location: {
      lat: 55.7590,
      lng: 37.5897,
      address: 'Гранатный пер., 7, стр. 1 (м. Баррикадная), Москва',
    },
  },
  {
    id: 'seed_mansion_ryabushinsky',
    category: 'place',
    placeType: 'mansion',
    title: 'Особняк Рябушинского',
    description: 'Памятник архитектуры в стиле модерн. Здесь жил Максим Горький.',
    priceText: '550 ₽',
    website: '',
    priority: 3,
    createdAt: 1700000004000,
    visits: [],
    location: {
      lat: 55.7567,
      lng: 37.5986,
      address: 'Малая Никитская ул., 6/2с5 (м. Арбатская), Москва',
    },
  },
  {
    id: 'seed_mansion_loris',
    category: 'place',
    placeType: 'mansion',
    title: 'Особняк Лорис-Меликова',
    description: 'Вход свободный.',
    priceText: 'Бесплатно',
    website: '',
    priority: 2,
    createdAt: 1700000005000,
    visits: [],
    location: {
      lat: 55.7671,
      lng: 37.6408,
      address: 'Милютинский пер., 19/4с1 (м. Тургеневская), Москва',
    },
  },
];

(function seedData() {
  try {
    const KEY = 'wishlist_v1';
    const existing = JSON.parse(localStorage.getItem(KEY) || '[]');
    const existingIds = new Set(existing.map(i => i.id));
    const toAdd = SEED_ITEMS.filter(i => !existingIds.has(i.id));
    if (toAdd.length > 0) {
      // append to end (they'll show after user's own items)
      localStorage.setItem(KEY, JSON.stringify([...existing, ...toAdd]));
    }
  } catch (e) {
    // ignore storage errors
  }
})();
