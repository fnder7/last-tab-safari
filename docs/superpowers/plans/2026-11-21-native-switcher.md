# Нативный переключатель Last Tab — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** одно настраиваемое сочетание открывает нативную полоску вкладок с превью везде в Safari,
включая Start Page.

**Architecture:** приложение Last Tab живёт в строке меню, ловит сочетания через Carbon
`RegisterEventHotKey`, ведёт автомат состояний меню (порт `menu-state.ts`) и рисует `NSPanel`.
Данные (MRU, заголовки, превью, сочетания) фоновый скрипт отдаёт через `sendNativeMessage` в appex.
Appex пишет их в контейнер App Group и шлёт Darwin-уведомление. Переключение идёт от приложения
к фоновому скрипту через `SFSafariApplication.dispatchMessage` и порт `connectNative`.

**Tech Stack:** Swift 6 / AppKit / Carbon HIToolbox, SwiftPM (только для тестов ядра),
TypeScript + esbuild, node:test.

**Spec:** `docs/superpowers/specs/2026-11-21-native-switcher-design.md`

## Global Constraints

- macOS 26.5+, Safari 26+. Приложение и appex в песочнице, подпись Personal Team `2K54TT5K2K`.
- Нельзя требовать разрешения Accessibility или Screen Recording.
- Сочетания регистрируются только пока Safari активен.
- В сочетании обязателен хотя бы один из ⌘ ⌥ ⌃. Сочетание по умолчанию — ⌥Q, «назад» по умолчанию —
  авто (вперёд + ⇧).
- Вкладки приватных окон (`tab.incognito`) не попадают ни в снимок, ни на диск.
- Превью лежат только в `Library/Caches` контейнера App Group. Они стираются при закрытии вкладки
  и полностью при запуске приложения.
- **Не коммитить**: так попросил пользователь. Шаги «Commit» в задачах пропускаются.
- Не трогать незакоммиченные правки пользователя (версии, CHANGELOG, скрипты версий) сверх того,
  что требует задача 12.

## Общие контракты (используют несколько задач)

**Combo** (TS и Swift, JSON):
`{ "code": "KeyE", "meta": false, "alt": true, "ctrl": false, "shift": false }`. `code` — это
DOM `KeyboardEvent.code`: `Key[A-Z]`, `Digit[0-9]`, пунктуация из нынешнего `PUNCTUATION`,
`F1`–`F12`, `Space`, `Tab`, `Backquote`.

**Хранение в `storage.local`** под ключом `shortcut` (старый ключ):
`{ forward: Combo, reverse: Combo | null }`, где `null` означает авто. Старая форма
`{ modifier: 'alt' | 'ctrl', code }` читается как `{ forward: {code, alt|ctrl}, reverse: null }`.

**Сообщения расширение → appex** (`browser.runtime.sendNativeMessage('application.id', msg)`):
- `{ type: 'snapshot', focusedWindowId: number | null, windows: { [windowId: string]: { tabs: { id: number, title: string, favIconUrl: string | null, hasPreview: boolean }[] } } }`.
  Вкладки идут в порядке MRU, как сейчас возвращает `reconcile()`.
- `{ type: 'preview', tabId: number, jpegBase64: string }`
- `{ type: 'shortcuts', forward: Combo, reverse: Combo | null }`, где `reverse` уже вычислен
  (авто → вперёд + ⇧; `null`, если вычислить нельзя).
- `{ type: 'ping' }`

Ответ appex на любое сообщение: `{ ok: true, appRunning: boolean }`.

**Приложение → расширение:** `dispatchMessage(withName: "activate", userInfo: ["tabId": N])`.
Фоновый скрипт получает его в `port.onMessage` порта `browser.runtime.connectNative('application.id')`.
Точную форму объекта зафиксирует задача 1.

**App Group:** `2K54TT5K2K.dev.fnder77.LastTab`. Файлы лежат в `Library/Caches/LastTab/`:
`state.json` (последний snapshot как есть), `shortcuts.json`, `previews/<tabId>.jpg`.
Darwin-уведомления: `dev.fnder77.LastTab.state`, `dev.fnder77.LastTab.shortcuts`,
`dev.fnder77.LastTab.preview`.

## Review Focus

1. **Сочетание совпадает с сочетанием Safari** (например ⌥⌘L). Ожидание: Last Tab перехватывает его
   только пока Safari активен, а попап заранее предупреждает. Тест: задача 5, `warns about Safari shortcuts`.
2. **Отпускание при нескольких модификаторах** (⌃⌥E: сначала отпущен ⌃, ⌥ ещё держится).
   Ожидание: переключение сразу при отпускании любого из ⌘ ⌥ ⌃, ⇧ не считается. Тест: задача 3,
   `releases when any non-shift modifier of the opener is up`.
3. **«Назад» при «вперёд» с ⇧** (⇧⌘E). Ожидание: «назад» не вычисляется, работают только «вперёд»
   и стрелки. Тесты: задача 2, `effectiveReverse is nil when forward has shift`; задача 5, то же на TS.
4. **Данные устарели к моменту нажатия** (только что переключили вкладку, снимок ещё не пришёл).
   Ожидание: полоска открывается по тому, что есть, и перерисовывается при уведомлении `state`.
   Тест: задача 11, `refreshes open strip on state notification`.
5. **Вкладка закрылась, пока полоска открыта.** Ожидание: переключения нет, ошибки нет, как сейчас
   (`activateTab` глотает ошибку). Тест: задача 6, `activate ignores closed tab`.

---

### Задача 1: Прототип на выброс (проверка рисков)

Цель — ответить на три вопроса до основной работы. Код прототипа не сохраняется.

**Files:** временная ветка в рабочей копии не нужна: прототип живёт в `/tmp/lt-spike/`
(отдельный Xcode-проект не нужен). Правки в `Last Tab/` и `src/` откатываются в конце задачи.

- [ ] **Шаг 1.** В `AppDelegate` временно зарегистрировать `RegisterEventHotKey` для ⌥Q (`kVK_ANSI_Q`,
  `optionKey`). По срабатыванию логировать через `os_log` и вызывать `dispatchMessage("activate", ["tabId": 0])`.
- [ ] **Шаг 2.** В фоновом скрипте временно открыть `connectNative('application.id')`. Входящее
  сообщение отправить обратно через `sendNativeMessage({type:'ping', echo})`, чтобы оно попало в
  `os_log` appex (уже логирует). Добавить `nativeMessaging` в `permissions`.
- [ ] **Шаг 3.** Собрать и запустить, пользователь нажимает ⌥Q на Start Page и на сайте. Проверка:
  `/usr/bin/log stream --predicate 'subsystem == "dev.fnder77.LastTab" OR process == "Last Tab Extension"'`.
  Записать: (а) срабатывает ли горячая клавиша в песочнице без Accessibility; (б) доходит ли
  сообщение до выгруженного фонового скрипта («Last Tab (not loaded)» в Develop) и за сколько мс;
  (в) точную форму объекта в `port.onMessage`.
- [ ] **Шаг 4.** Проверить Darwin-уведомление из appex в приложение в песочнице (одно
  `CFNotificationCenterPostNotification` и наблюдатель в приложении).
- [ ] **Шаг 5.** Записать результаты в раздел «Риски» спеки. Если (б) не работает, остановиться
  и вернуться к пользователю с запасным путём (AppleScript и разрешение Automation), а план поправить.
  Откатить временные правки (`git diff` по `Last Tab/` и `src/` совпадает с состоянием до задачи).

### Задача 2: Ядро на Swift — Combo и раскладка клавиш

**Files:**
- Create: `Last Tab/Core/Package.swift` (библиотека `LastTabCore`, macOS 26)
- Create: `Last Tab/Core/Sources/LastTabCore/Combo.swift`
- Test: `Last Tab/Core/Tests/LastTabCoreTests/ComboTests.swift`
- Modify: `package.json`: скрипт `"test:native": "swift test --package-path 'Last Tab/Core'"`

**Interfaces:**
- Produces: `struct Combo: Codable, Hashable { code: String; meta, alt, ctrl, shift: Bool }`;
  `var isValid: Bool` (известный `code` и хотя бы один из meta/alt/ctrl);
  `var carbonKeyCode: UInt32?` (из DOM `code` в `kVK_*`); `var carbonModifiers: UInt32` (`cmdKey|optionKey|controlKey|shiftKey`);
  `var withShift: Combo`; `static func effectiveReverse(forward: Combo, reverse: Combo?) -> Combo?`.

- [ ] **Шаг 1: падающие тесты.** `validRequiresNonShiftModifier` (⇧E → false, ⌥E → true);
  `keyCodes` (`KeyE` → 14, `Digit1` → 18, `Comma` → 43, `F5` → 96);
  `effectiveReverseAuto` (⌥E, nil → ⇧⌥E); `effectiveReverseCustom` (⌥E, ⌃W → ⌃W);
  `effectiveReverse is nil when forward has shift` (⇧⌘E, nil → nil);
  `decodesExtensionJSON` (JSON из раздела «Общие контракты»).
- [ ] **Шаг 2.** `swift test --package-path "Last Tab/Core"` → FAIL (нет `Combo`).
- [ ] **Шаг 3.** Реализовать `Combo.swift`. Таблица `code → kVK_*` из `Carbon.HIToolbox.Events`.
- [ ] **Шаг 4.** `npm run test:native` → PASS.
- [ ] **Шаг 5.** Commit — пропускается.

### Задача 3: Ядро на Swift — автомат меню

**Files:**
- Create: `Last Tab/Core/Sources/LastTabCore/MenuState.swift`
- Test: `Last Tab/Core/Tests/LastTabCoreTests/MenuStateTests.swift`

**Interfaces:**
- Consumes: `Combo` (задача 2).
- Produces: `struct MenuTab: Equatable { id: Int; title: String; favIconURL: URL?; hasPreview: Bool }`;
  `enum MenuState`, `enum MenuAction { press(reverse: Bool), listLoaded([MenuTab]), arrow(right: Bool), release, escape, blur }`,
  `enum MenuEffect { requestList, render([MenuTab], index: Int), close, activate(tabId: Int) }`;
  `func reduce(_ s: MenuState, _ a: MenuAction) -> (MenuState, [MenuEffect])`;
  `func isReleased(held: Combo, opener: Combo) -> Bool` (`held` — текущие флаги, `code` не важен).

- [ ] **Шаг 1: падающие тесты.** Перенести все 19 тестов из `tests/menu-state.test.ts` один в один,
  те же сценарии и ожидания. Плюс `releases when any non-shift modifier of the opener is up`:
  opener ⌃⌥E; held ⌥ → true; held ⌃⌥⇧ → false; held ⌃⌥ → false.
- [ ] **Шаг 2.** `npm run test:native` → FAIL.
- [ ] **Шаг 3.** Реализовать как порт `src/content/menu-state.ts`, включая `replay` быстрых тапов.
- [ ] **Шаг 4.** `npm run test:native` → PASS.
- [ ] **Шаг 5.** Commit — пропускается.

### Задача 4: Ядро на Swift — хранилище App Group

**Files:**
- Create: `Last Tab/Core/Sources/LastTabCore/Store.swift`, `Last Tab/Core/Sources/LastTabCore/NativeMessages.swift`
- Test: `Last Tab/Core/Tests/LastTabCoreTests/StoreTests.swift`

**Interfaces:**
- Consumes: `Combo`, `MenuTab`.
- Produces: `enum NativeMessage: Decodable { snapshot(Snapshot), preview(tabId: Int, jpeg: Data), shortcuts(forward: Combo, reverse: Combo?), ping }`;
  `struct Snapshot: Codable { focusedWindowId: Int?; windows: [String: WindowTabs] }`;
  `final class Store { init(directory: URL); func apply(_ m: NativeMessage) throws -> Notification?; func snapshot() -> Snapshot?; func shortcuts() -> (forward: Combo, reverse: Combo?)?; func previewURL(tabId: Int) -> URL?; func clearAll() }`;
  `enum StoreNotification: String { state = "dev.fnder77.LastTab.state", shortcuts = "dev.fnder77.LastTab.shortcuts", preview = "dev.fnder77.LastTab.preview" }`;
  `static func appGroupDirectory() -> URL` (`Library/Caches/LastTab` контейнера `2K54TT5K2K.dev.fnder77.LastTab`).

- [ ] **Шаг 1: падающие тесты** во временной папке: `snapshotRoundTrip`;
  `snapshotDeletesPreviewsOfClosedTabs` (превью 10 и 20, снимок только с 10 → файла 20 нет);
  `previewWrittenAsJPEG`; `shortcutsRoundTrip`; `clearAllRemovesEverything`;
  `applyReturnsMatchingNotification`.
- [ ] **Шаг 2.** `npm run test:native` → FAIL.
- [ ] **Шаг 3.** Реализовать. Запись атомарная (`Data.write(options: .atomic)`).
- [ ] **Шаг 4.** `npm run test:native` → PASS.
- [ ] **Шаг 5.** Commit — пропускается.

### Задача 5: Расширение — модель сочетаний на TS

**Files:**
- Create: `src/shared/combo.ts` (заменяет `src/content/shortcut.ts`)
- Test: `tests/combo.test.ts` (заменяет `tests/shortcut.test.ts`)

**Interfaces:**
- Produces: `type Combo = { code: string; meta: boolean; alt: boolean; ctrl: boolean; shift: boolean }`;
  `type Shortcuts = { forward: Combo; reverse: Combo | null }`; `DEFAULT_SHORTCUTS` (⌥Q, `reverse: null`);
  `parseStored(value: unknown): Shortcuts` (новый формат, старый `{modifier, code}` или по умолчанию);
  `isValidCombo(c: Combo): boolean`; `effectiveReverse(s: Shortcuts): Combo | null`;
  `comboFromEvent(e: KeyLike): Combo | null` (`null` — нажат только модификатор);
  `label(c: Combo): string` (порядок символов ⌃ ⌥ ⇧ ⌘, затем клавиша, например `⌃ ⌥ ⇧ ⌘ E`);
  `safariConflict(c: Combo): string | null` (название пункта Safari, например `⌘L` → `"Open Location"`).

- [ ] **Шаг 1: падающие тесты.** Перенести применимые тесты из `tests/shortcut.test.ts`. Добавить:
  `migrates legacy {modifier, code}`; `invalid without cmd/alt/ctrl`;
  `effectiveReverse auto adds shift`; `effectiveReverse is nil when forward has shift`;
  `label orders modifiers like macOS`; `warns about Safari shortcuts` (`⌘L` → не null,
  `⌥E` → null). Список конфликтов: сочетания из меню Safari без ⇧ и с ⇧ для букв
  L, R, F, D, N, T, W, Y, Z, I, C, U, A, E, G, Q, P, S, O, M, H, K, 1–9.
- [ ] **Шаг 2.** `npm test` → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** `npm test` → PASS.
- [ ] **Шаг 5.** Commit — пропускается.

### Задача 6: Расширение — мост к приложению в фоновом скрипте

**Files:**
- Create: `src/background/native-bridge.ts`, `src/shared/native.ts` (типы сообщений из «Общих контрактов»)
- Modify: `src/background/controller.ts` (убрать `commands`/`switchToPrevious` и `runtime.onMessage` меню;
  отдавать снимок и превью мосту), `src/background/index.ts`, `static/manifest.json`
  (`nativeMessaging` в permissions; убрать `content_scripts` и `commands`), `tests/fake-browser.ts`
  (`runtime.sendNativeMessage`, `runtime.connectNative`, `windows.onFocusChanged`, `tab.incognito`)
- Test: `tests/controller.test.ts`, `tests/native-bridge.test.ts`

**Interfaces:**
- Consumes: `parseStored`, `effectiveReverse` (задача 5); `reconcile` из `controller.ts`.
- Produces: `createNativeBridge(browser, { debounceMs = 100, schedule })` с методами
  `publishSnapshot(snapshot)`, `publishPreview(tabId, dataUrl)`, `publishShortcuts(s: Shortcuts)`,
  `ping(): Promise<{ appRunning: boolean }>`, `onActivate(fn: (tabId: number) => void)`.
  В `runtime.onMessage` новый запрос `{ type: 'app:status' }` от попапа отвечает результатом `ping()`.

- [ ] **Шаг 1: падающие тесты.**
  `snapshot lists tabs in MRU order per window`;
  `snapshot skips incognito tabs`;
  `snapshot is debounced` (3 активации за 100 мс → одна отправка);
  `snapshot tracks focused window`;
  `preview is sent as base64 without data: prefix`;
  `shortcuts are sent resolved on start and on storage change` (reverse `null` → вперёд + ⇧);
  `activate from app switches tab` (сообщение порта в форме из задачи 1 → `tabs.update`);
  `activate ignores closed tab`;
  `app:status answers ping`.
  Убрать тесты `previous-tab command …` и тесты `menu:list`/`menu:activate`.
- [ ] **Шаг 2.** `npm test` → FAIL.
- [ ] **Шаг 3.** Реализовать. Порт `connectNative` открывается при старте фонового скрипта.
  Если он отвалится (`onDisconnect`), переоткрыть при следующем событии.
- [ ] **Шаг 4.** `npm test` → PASS.
- [ ] **Шаг 5.** Commit — пропускается.

### Задача 7: Расширение — попап с двумя строками

**Files:**
- Modify: `static/options.html`, `src/options/index.ts`, `src/options/key-recorder.ts`
- Test: `tests/key-recorder.test.ts`

**Interfaces:**
- Consumes: `Combo`, `Shortcuts`, `comboFromEvent`, `label`, `safariConflict`, `effectiveReverse`,
  `isValidCombo` (задача 5); запрос `app:status` (задача 6).
- Produces: `classifyCombo(e: KeyLike): { kind: 'cancel' } | { kind: 'wait' } | { kind: 'invalid', reason: 'modifier' | 'key' } | { kind: 'accept', combo: Combo }`.

Вид — по наброску спеки: строки «Вперёд» и «Назад» одного вида. Под «Назад» ссылка
«как вперёд + ⇧», только когда «назад» задано вручную. Затем подсказка и, если приложение не
отвечает, строка «Приложение Last Tab не запущено — Открыть» (ссылка `lasttab://`, схема
регистрируется в задаче 9). Тексты интерфейса — на английском, как сейчас: «Forward», «Back»,
«Same as forward + ⇧», «Press a shortcut…», «Hold the modifiers and press the key; release to
switch. Esc cancels.», «Last Tab app isn't running — Open».

- [ ] **Шаг 1: падающие тесты.** `Escape cancels`; `modifier alone waits`;
  `⇧E is invalid (modifier)`; `⌥F13 is invalid (key)`; `⌃⌥E accepted with both flags`;
  `⌘L accepted` (предупреждение показывает UI, классификатор принимает).
- [ ] **Шаг 2.** `npm test` → FAIL.
- [ ] **Шаг 3.** Реализовать `classifyCombo` и UI. Запрещено, чтобы «назад» совпадало с «вперёд»
  (сообщение «Back can't be the same as forward.»). Под строкой с конфликтом выводится
  «Overrides Safari's “<name>” while Safari is active.».
- [ ] **Шаг 4.** `npm test` → PASS. Затем `npm run build`, открыть `dist/options.html` во встроенном
  браузере с заглушкой `browser`. Строки, авто-«назад» и ссылка сброса работают.
- [ ] **Шаг 5.** Commit — пропускается.

### Задача 8: Xcode — структура, App Group, appex

**Files:**
- Modify: `Last Tab/Last Tab.xcodeproj/project.pbxproj`:
  - `PBXFileSystemSynchronizedRootGroup` для `Core/Sources/LastTabCore`, состоит в обоих таргетах;
  - такая же группа для новой папки `Last Tab/App` (только приложение);
  - `CODE_SIGN_ENTITLEMENTS` для обоих таргетов;
  - `INFOPLIST_KEY_LSUIElement = YES` для приложения.
  Версии пользователя в этом файле не трогать.
- Create: `Last Tab/Last Tab/Last Tab.entitlements`, `Last Tab/Last Tab Extension/Last Tab Extension.entitlements`
  (`com.apple.security.app-sandbox`, `com.apple.security.application-groups = [2K54TT5K2K.dev.fnder77.LastTab]`;
  у приложения ещё `com.apple.security.network.client`, оно уже есть в настройках)
- Modify: `Last Tab/Last Tab Extension/SafariWebExtensionHandler.swift`

**Interfaces:**
- Consumes: `NativeMessage`, `Store`, `StoreNotification` (задача 4).
- Produces: appex разбирает сообщение и вызывает `Store.apply`, затем постит Darwin-уведомление.
  В ответ отдаёт `{ ok: true, appRunning }`, где `appRunning` проверяется через
  `NSRunningApplication.runningApplications(withBundleIdentifier: "dev.fnder77.LastTab")`.

- [ ] **Шаг 1.** Внести изменения в проект. `xcodebuild … build` → `BUILD SUCCEEDED`. Проверка:
  `codesign -d --entitlements - "build/Build/Products/Debug/Last Tab.app"` показывает App Group.
- [ ] **Шаг 2.** Реализовать обработчик. Логи через `Logger(subsystem: "dev.fnder77.LastTab", category: "appex")`.
- [ ] **Шаг 3.** Собрать и запустить. Пользователь один раз включает расширение. Переключение
  вкладки в Safari приводит к появлению `state.json` в контейнере группы.
- [ ] **Шаг 4.** Commit — пропускается.

### Задача 9: Приложение — строка меню, жизненный цикл, горячие клавиши

**Files:**
- Create: `Last Tab/App/StatusMenu.swift`, `Last Tab/App/HotKeyCenter.swift`, `Last Tab/App/SafariActivity.swift`
- Modify: `Last Tab/Last Tab/AppDelegate.swift`, `Last Tab/Last Tab/ViewController.swift`
  (окно-инструкция показывается только если расширение выключено или по пункту меню),
  `Last Tab/Last Tab/Info.plist` (URL-схема `lasttab`)

**Interfaces:**
- Consumes: `Combo.carbonKeyCode/carbonModifiers`, `Store.shortcuts()`, `StoreNotification.shortcuts`.
- Produces: `final class HotKeyCenter { func register(_ id: HotKeyID, _ c: Combo, handler: @escaping () -> Void); func unregister(_ id: HotKeyID); func unregisterAll() }`,
  `enum HotKeyID { forward, reverse, left, right, escape, leftPlain, rightPlain, escapePlain }`;
  `final class SafariActivity { var onChange: (Bool) -> Void }` (через `NSWorkspace.didActivateApplicationNotification`,
  bundle id `com.apple.Safari`).

- [ ] **Шаг 1.** Реализовать меню строки состояния. В нём текущие сочетания (`label` как в TS,
  например «Forward: ⌥ Q», «Back: ⇧ ⌥ Q»), «Open at Login» с галочкой (`SMAppService.mainApp`),
  «Last Tab Extension Settings…», «Quit Last Tab».
  `applicationShouldTerminateAfterLastWindowClosed` → `false`. При запуске вызывается `Store.clearAll()`.
- [ ] **Шаг 2.** Регистрировать forward/reverse, пока Safari активен. Перерегистрировать при уведомлении `shortcuts`.
- [ ] **Шаг 3.** Собрать и запустить. Проверка по `log stream`: на сочетание в Safari приходит
  событие, в другом приложении — нет.
- [ ] **Шаг 4.** Commit — пропускается.

### Задача 10: Приложение — полоска

**Files:**
- Create: `Last Tab/App/SwitcherPanel.swift`, `Last Tab/App/TabCardView.swift`, `Last Tab/App/FaviconCache.swift`

**Interfaces:**
- Consumes: `MenuTab`, `Store.previewURL`.
- Produces: `final class SwitcherPanel { func show(tabs: [MenuTab], index: Int, on screen: NSScreen); func close() }`;
  `func screenOfFrontSafariWindow() -> NSScreen` (`CGWindowListCopyWindowInfo`, владелец
  `com.apple.Safari`, слой 0, первый по порядку).

Вид повторяет `src/content/menu-view.ts`:
- карточка 200×125 плюс строка заголовка, отступы 12, padding панели 14;
- фон `rgba(28,28,30,0.92)` с размытием (`NSVisualEffectView`), скругление 16;
- выделение — обводка 3pt `#0a84ff` с заливкой 18%;
- без превью — иконка 48pt или первая буква заголовка;
- ширина не больше 90% экрана, выбранная карточка прокручивается в видимую область.

`NSPanel` неактивирующий, `.floating`, не принимает клики.

- [ ] **Шаг 1.** Реализовать. Иконки грузятся `URLSession`, хранятся в памяти по URL, ошибки молча
  дают букву.
- [ ] **Шаг 2.** Показ временной кнопкой из меню отладки с тестовыми данными, скриншот сверить
  с нынешним меню. Временный пункт удалить.
- [ ] **Шаг 3.** Commit — пропускается.

### Задача 11: Приложение — сборка переключателя

**Files:**
- Create: `Last Tab/App/SwitcherController.swift`, `Last Tab/App/ModifierWatcher.swift`
- Test: `Last Tab/Core/Tests/LastTabCoreTests/SwitcherFlowTests.swift`. Логику, которую можно
  тестировать без AppKit, вынести в ядро: `Last Tab/Core/Sources/LastTabCore/SwitcherFlow.swift`.

**Interfaces:**
- Consumes: всё выше; `SFSafariApplication.dispatchMessage`.
- Produces: `struct SwitcherFlow` в ядре:
  `mutating func handle(_ a: MenuAction, snapshot: Snapshot?) -> [SwitcherCommand]`,
  `enum SwitcherCommand { show([MenuTab], index: Int), close, activate(tabId: Int), startWatchingRelease(opener: Combo), stopWatchingRelease, registerNavKeys, unregisterNavKeys }`.
  Действие `requestList` отвечает сразу из снимка фокусного окна.

- [ ] **Шаг 1: падающие тесты.**
  `press with snapshot opens on second tab`;
  `refreshes open strip on state notification` (новый снимок во время open → `show` с тем же
  выбранным id, если он ещё есть);
  `no snapshot means nothing happens`;
  `release while loading does a quick switch`;
  `nav keys registered only while open`.
- [ ] **Шаг 2.** `npm run test:native` → FAIL.
- [ ] **Шаг 3.** Реализовать `SwitcherFlow`. Затем `SwitcherController` (AppKit): горячие
  клавиши → `MenuAction`; `ModifierWatcher` опрашивает `CGEventSource.flagsState(.combinedSessionState)`
  раз в 8 мс, пока идёт загрузка или полоска открыта, и шлёт `.release` по `isReleased`;
  Safari перестал быть активным → `.blur`; стрелки и Esc регистрируются временно (с модификаторами
  открывающего сочетания и без них).
- [ ] **Шаг 4.** `npm run test:native` → PASS. Собрать, проверить на Start Page и на сайте
  через `log stream`, а пользователь проверяет руками по чек-листу задачи 13.
- [ ] **Шаг 5.** Commit — пропускается.

### Задача 12: Уборка, документы, версия

**Files:**
- Delete: `src/content/` (все файлы), `tests/menu-state.test.ts`, `tests/shortcut.test.ts`
  (их заменили задачи 3 и 5)
- Modify: `README.md` (описание: одно сочетание, приложение в строке меню, попап; приватность:
  «Previews stay on this Mac in the app's cache and are erased when tabs close»; сборка:
  `npm test && npm run test:native`; убрать ограничения «не работает на Start Page»),
  `CHANGELOG.md` (раздел 2.0.0), версия через `npm run set-version -- 2.0.0`

- [ ] **Шаг 1.** Удалить, обновить, `npm run set-version -- 2.0.0`.
- [ ] **Шаг 2.** `npm test && npm run test:native` → всё PASS (включая `tests/version.test.ts`).
- [ ] **Шаг 3.** Commit — пропускается.

### Задача 13: Сборка и проверка руками

- [ ] **Шаг 1.** `xcodebuild -project "Last Tab/Last Tab.xcodeproj" -scheme "Last Tab" -configuration Debug -derivedDataPath build -allowProvisioningUpdates build`
  → `BUILD SUCCEEDED`; `pluginkit -m -A -D -v -i dev.fnder77.LastTab.Extension` → одна запись из `build/`.
- [ ] **Шаг 2.** Чек-лист для пользователя:
  - запустить `build/…/Last Tab.app`, в строке меню появился значок;
  - в Safari включить Last Tab и разрешить его на всех сайтах;
  - в попапе задать своё сочетание (например ⌃⌥E), «назад» стал ⇧⌃⌥E;
  - на Start Page держать модификаторы и жать клавишу: полоска с превью, отпустить → переключение;
  - то же на сайте, в адресной строке, на странице Settings;
  - быстрый тап → сразу предыдущая вкладка;
  - Esc отменяет, стрелки двигают;
  - задать «назад» вручную (⌃⌥W), проверить, сбросить на «как вперёд + ⇧»;
  - в другом приложении сочетание не перехватывается;
  - выйти из приложения → попап пишет «Last Tab app isn't running».
