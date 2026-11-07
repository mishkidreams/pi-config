# macOS / Apple Silicon — первоначальная настройка

Нужны Node.js с npm/npx и Git в PATH. Для Pi через npm требуется Node >=22.19.0:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Штатная альтернатива — [инсталлятор Pi](https://pi.dev). Терминал может использовать стандартный Zsh; Pi запускает команды своим инструментом Bash. PowerShell и смена login shell не нужны.

Из корня этого checkout, для пустой конфигурации:

```sh
config_root="${XDG_CONFIG_HOME:-$HOME/.config}"
mkdir -p "$HOME/.pi/agent" "$HOME/.agents/skills" "$config_root/billion-context"
cp -R ./agent/. "$HOME/.pi/agent/"
cp -R ./skills/skill-creator "$HOME/.agents/skills/"
cp ./billion-context/billion-context.json "$config_root/billion-context/billion-context.json"

# Однократно добавить постоянный лимит для новых терминалов Zsh
grep -qxF 'export PI_SUBAGENT_MAX_DEPTH=1' "$HOME/.zshrc" 2>/dev/null ||
  printf '\nexport PI_SUBAGENT_MAX_DEPTH=1\n' >> "$HOME/.zshrc"
export PI_SUBAGENT_MAX_DEPTH=1
```

Открой новое окно терминала и выполни `echo "$PI_SUBAGENT_MAX_DEPTH"`: ожидается `1`. Строка в `~/.zshrc` будет подхватываться автоматически и после перезагрузки; повторять команду перед запуском Pi не нужно. Если там уже есть другая установка этой переменной, оставь одну с нужным значением. `/reload` не меняет окружение работающего процесса.

Запусти `pi`, дождись установки пакетов и выполни авторизацию/сопряжение из [общей инструкции](../README.md#первоначальная-установка). Общие settings, модели, агенты и skill используются без Mac-копий. Лимит 1 разрешает основной агент -> дочерний, но не следующую генерацию; число параллельных детей он не задаёт.

## Только если нужен HTTP-прокси

Один раз добавь свои переменные в `~/.zshrc`, заменив `HOST:PORT` настоящим адресом:

```sh
export HTTP_PROXY='http://HOST:PORT'
export HTTPS_PROXY='http://HOST:PORT'
export NO_PROXY='localhost,127.0.0.1,::1'
```

Сохрани нужные своей сети дополнительные исключения NO_PROXY. Затем открой новое окно терминала. Прокси-приложение, если оно нужно, устанавливается отдельно; конфиг Billion Context остаётся в режиме `auto`, без домашнего адреса или пустого `proxy`.

Эти инструкции и общие файлы подготовлены для macOS/ARM64, но настоящий запуск на MacBook пока не выполнен.
