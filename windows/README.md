# Windows — первоначальная настройка

PowerShell 7, Node.js с npm/npx и Git должны быть доступны в PATH. Если Pi ещё не установлен, выполни `npm install -g --ignore-scripts @earendil-works/pi-coding-agent` (Node >=22.19.0). Штатная альтернатива — [инсталлятор Pi](https://pi.dev).

Далее — PowerShell 7 **из корня этого checkout**, для пустой конфигурации:

```powershell
$configRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { "$HOME\.config" }
New-Item -ItemType Directory -Force "$HOME\.pi\agent", "$HOME\.agents\skills", "$configRoot\billion-context" | Out-Null
Copy-Item .\agent\* "$HOME\.pi\agent" -Recurse -Force
Copy-Item .\skills\skill-creator "$HOME\.agents\skills" -Recurse -Force
Copy-Item .\billion-context\billion-context.json "$configRoot\billion-context\billion-context.json" -Force

# Единственная Windows-поправка к общему settings.json
$path = "$HOME\.pi\agent\settings.json"
$settings = [IO.File]::ReadAllText($path) | ConvertFrom-Json
$settings.defaultTools = @($settings.defaultTools) + @('-bash', '+powershell')
[IO.File]::WriteAllText($path, ($settings | ConvertTo-Json -Depth 30) + "`n", [Text.UTF8Encoding]::new($false))

# Один раз сохранить для пользователя; также применить в текущем терминале
[Environment]::SetEnvironmentVariable('PI_SUBAGENT_MAX_DEPTH', '1', 'User')
$env:PI_SUBAGENT_MAX_DEPTH = '1'
```

Открой новый терминал и проверь `$env:PI_SUBAGENT_MAX_DEPTH`: ожидается `1`. Переменная сохранена после перезагрузок, повторять команды при каждом запуске Pi не нужно. Уже открытые терминалы могут хранить старое окружение; `/reload` его не обновляет. Разовый `pi --subagent-max-depth 2` имеет приоритет, но постоянный лимит останется 1.

Запусти `pi`, дождись установки пакетов и выполни авторизацию/сопряжение из [общей инструкции](../README.md#первоначальная-установка). Общие model overrides, агенты и skill не имеют отдельной Windows-копии.

## Только если нужен HTTP-прокси

Сохрани свои значения в пользовательском окружении Windows; `HOST:PORT` ниже **замени действительным адресом**, не сохраняй этот пример буквально:

```powershell
[Environment]::SetEnvironmentVariable('HTTP_PROXY', 'http://HOST:PORT', 'User')
[Environment]::SetEnvironmentVariable('HTTPS_PROXY', 'http://HOST:PORT', 'User')
[Environment]::SetEnvironmentVariable('NO_PROXY', 'localhost,127.0.0.1,::1', 'User')
```

В NO_PROXY можно сохранить нужные своей сети дополнительные исключения. После изменения открой новый терминал. В конфиг Billion Context не добавляй пустой `proxy`: оставь поставляемый `upstreamProxyMode: auto`. Без необходимости прокси этот раздел пропускается.
