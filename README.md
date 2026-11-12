# Jasylqala — Зелёный фонд города

> **Проект 02 · IntelX (Актау)** — «Цифровые сервисы для Мангистау»  
> Электронный паспорт для каждого дерева города, интерактивная карта, PWA с автономным офлайн-режимом и определение видов деревьев по фото нейросетью.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![PostGIS](https://img.shields.io/badge/PostGIS-3.4+-336791?logo=postgresql&logoColor=white)](https://postgis.net)
[![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PWA](https://img.shields.io/badge/PWA-Ready-15803d?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Render](https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=black)](https://render.com)

---

## Возможности

- **Карта деревьев города:** интерактивная карта Актау на MapLibre с цветовой индикацией состояния (хорошее, среднее, слабое) и зумом с сохранением фрагментов.
- **Электронный паспорт дерева:** вид (на русском, казахском и латыни), высота, точные GPS-координаты, фото, заметки и пометка `Демо` для учебных данных.
- **Определение вида нейросетью по фото:** лёгкая модель классификации 7 засухоустойчивых видов Мангистау — выдаёт топ-3 варианта с вероятностями в процентах.
- **Работа без интернета (PWA + Офлайн-пакет):**
  - Кнопка **«Скачать офлайн»** сохраняет в телефон карту Актау, нейросеть и базу деревьев.
  - В полевых условиях без связи сотрудник может делать фото, определять вид нейросетью и сохранять паспорт в память устройства (`IndexedDB`).
  - При появлении сети данные и фото **автоматически отправляются на сервер без дубликатов**.
- **Задачи на уход:** постановка задач (полив, обрезка, осмотр) и фотофиксация результата («до» и «после») прямо в карточке дерева.

---

## Справочник видов Мангистау

Модель классифицирует основные засухо- и солеустойчивые виды озеленения региона:

1. **Карагач (Вяз приземистый)** — *Ulmus pumila* (Қарағаш)
2. **Лох узколистный (Джида)** — *Elaeagnus angustifolia* (Жиде)
3. **Тамариск (Гребенщик)** — *Tamarix ramosissima* (Жыңғыл)
4. **Тополь серебристый** — *Populus alba* (Ақ терек)
5. **Ясень пенсильванский** — *Fraxinus pennsylvanica* (Шаған)
6. **Акация белая (Робиния)** — *Robinia pseudoacacia* (Ақ қараған)
7. **Тутовник (Шелковица)** — *Morus alba* (Тұт ағашы)

---

## Архитектура и стек

```
jasylqala/
├── backend/                  # FastAPI сервис (Python 3.12)
│   ├── app/
│   │   ├── main.py           # REST API эндпоинты (GeoJSON, офлайн-синк, задачи)
│   │   ├── models.py         # SQLAlchemy модели (Tree, CareTask)
│   │   ├── database.py       # Подключение PostgreSQL/PostGIS + SQLite
│   │   ├── seed.py           # 8 демо-деревьев Актау (помечены «Демо»)
│   │   └── services/         # Pillow-валидатор фото и инференс нейросети
│   └── tests/                # 11 тестов pytest
├── frontend/                 # PWA интерфейс (React + Vite + TypeScript)
│   ├── src/
│   │   ├── components/       # TreeMap (MapLibre), AddTreeModal, TreePassportModal, OfflinePanel
│   │   ├── offline/          # IndexedDB хранилище, загрузчик карты и клиентская нейросеть
│   │   └── utils/image.ts    # Клиентское сжатие мобильных фото до ~1600px
│   └── public/models/        # Веса нейросети (species_weights.json)
├── docker-compose.yml        # Локальный стек одной командой (PostGIS + Backend)
├── render.yaml               # Конфигурация деплоя на Render (Blueprint)
└── TESTS.md                  # Ручные и авто-сценарии тестирования
```

---

## Быстрый запуск локально

### Вариант 1 · Через Docker Compose (с настоящим PostGIS)

```powershell
docker compose up --build
```
- Бэкенд будет доступен на `http://localhost:8000` (Swagger UI: `http://localhost:8000/docs`).
- PostGIS база данных — на порту `5432`.

Для фронтенда в отдельном терминале:
```powershell
cd frontend
npm install
npm run dev
```
Откройте `http://localhost:5173`.

### Вариант 2 · Без Docker (SQLite + локальный venv)

**Терминал 1 (Бэкенд):**
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

**Терминал 2 (Фронтенд):**
```powershell
cd frontend
npm install
npm run dev
```

---

## Деплой на Render + Supabase

### 1. Подготовка в Supabase (БД + Фото)
1. Создайте проект на [supabase.com](https://supabase.com).
2. В **Database → Extensions** убедитесь, что включено расширение `postgis`.
3. В **Storage** создайте публичный бакет `tree-photos` (**Public bucket: ON**).
4. Скопируйте из настроек проекта:
   - Connection string (URI) базы данных
   - Project URL
   - `service_role` секретный ключ

### 2. Деплой через Render Blueprint
1. В [render.com](https://render.com) нажмите **New + → Blueprint** и выберите репозиторий `Jasylqala`.
2. Render автоматически подхватит [render.yaml](./render.yaml) и создаст:
   - `jasylqala-api` (Web Service, Docker)
   - `jasylqala-web` (Static Site, PWA)
3. Заполните переменные окружения:

**В сервисе `jasylqala-api`:**
- `DATABASE_URL` = `postgresql+psycopg://postgres:[ПАРОЛЬ]@db.[ID].supabase.co:5432/postgres`
- `SUPABASE_URL` = `https://[ID].supabase.co`
- `SUPABASE_KEY` = `[service_role секретный ключ]`
- `SUPABASE_BUCKET` = `tree-photos`

**В сервисе `jasylqala-web`:**
- `VITE_API_URL` = `https://jasylqala-api.onrender.com`

---

## Тестирование

### Автоматические тесты
```powershell
# Бэкенд (11 тестов)
cd backend
.\.venv\Scripts\pytest -v

# Фронтенд (7 тестов)
cd frontend
npm test

# Сборка PWA (TypeCheck + ServiceWorker)
npm run build
```

Подробные сценарии ручной проверки (включая работу в авиарежиме на телефоне) описаны в [TESTS.md](./TESTS.md).

---

## Соответствие правилам проекта

1. **Пометка «Демо»:** все учебные и стартовые деревья имеют статус `is_demo=True` и чёткий синий бейдж в карточке.
2. **Конфиденциальность:** проект не использует и не собирает реальные персональные данные граждан.
3. **Безопасность:** фото сжимаются перед отправкой, валидируются по сигнатуре и размеру, CORS защищён регулярным выражением для Render.
