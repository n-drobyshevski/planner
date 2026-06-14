# Russian translation guide (planner)

The app is a warm, shared calendar **for two people**. Translate in that register.

## Voice
- **Informal "ты"** everywhere. Never the corporate "вы". E.g. "Войди по имени", "Твои события".
- Calm, plain, human. No marketing/gamified tone, no exclamation marks, no filler.
- Match the English brevity — UI labels stay short.

## Formatting
- Dates/times come from `date-fns` `ru` locale (Cyrillic, genitive months "1 июня"),
  24-hour time, day–month–year order. Do **not** hardcode month/weekday names.
- Use a non-breaking space ( ) between a number and its unit where natural ("2 ч").
- Plurals **always** via ICU `plural` (one/few/many/other) — never string concatenation.
  Russian example: `{count, plural, one {# задача} few {# задачи} many {# задач} other {# задачи}}`.

## Core glossary (use these exact terms)
| English | Russian |
|---|---|
| Calendar | Календарь |
| Tasks / Task | Задачи / Задача |
| Insights | Аналитика |
| Sleep | Сон |
| Settings | Настройки |
| Event | Событие |
| Board | Доска |
| Context | Контекст |
| Category | Категория |
| Profile | Профиль |
| Appearance | Оформление |
| Language | Язык |
| Timezone | Часовой пояс |
| Shared (calendar/event) | Общий / Общее |
| Private | Личное |
| Today | Сегодня |
| Week / Day / Month | Неделя / День / Месяц |
| 3-day | 3 дня |
| Agenda | Список |
| To do / In progress / Done | К выполнению / В процессе / Готово |
| Priority: None/Low/Medium/High | Приоритет: Без приоритета / Низкий / Средний / Высокий |
| All day | Весь день |
| Overdue | Просрочено |
| Unassigned | Без исполнителя |
| No context / No category | Без контекста / Без категории |
| Recurrence / Repeats | Повторение / Повторяется |

## Common verbs/buttons — already in the `common` namespace, REUSE `common.*`, do not re-add
Save Сохранить · Cancel Отмена · Delete Удалить · Edit Изменить · Add Добавить ·
Create Создать · Close Закрыть · Remove Убрать · Done Готово · Back Назад ·
Confirm Подтвердить · Search Поиск · Clear Очистить · Apply Применить ·
Today Сегодня · Yesterday Вчера · Loading Загрузка… · Optional Необязательно ·
None Нет · Undo Отменить · Retry Повторить · Settings Настройки

## Keys
- Namespace per surface (`calendar`, `tasks`, `insights`, `sleep`, `settings`, `auth`,
  `events`, `recurrence`, `toasts`, `validation`); shared atoms in `common`.
- Key names are English, kebab/camel, descriptive: `t("emptyState.title")`.
- English `messages/en/<ns>.json` is the source of truth; `messages/ru/<ns>.json` mirrors it 1:1.
