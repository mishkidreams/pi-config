# Рабочий GitLab и личный GitHub на одном Mac

Здесь рабочие клоны ссылаются только на GitLab, а личные — только на GitHub. Git выбирает **автора коммита** по хосту. Для **доступа к серверу** используем рабочий SSH-ключ на GitLab и личный вход по HTTPS через GitHub CLI. После настройки достаточно обычных `git clone`, `pull`, `commit` и `push`. Список репозиториев не нужен.

## 1. Два профиля автора

Нужен Git 2.36 или новее. Замени `gitlab.example.com` своим рабочим хостом во всех примерах, а имена и почту — своими. Для GitHub бери подтверждённый адрес из **Settings → Emails**. В публичном репозитории он будет виден в истории коммитов.

Создай два файла в домашнем каталоге. В `~/.gitconfig-work` запиши:

```gitconfig
[user]
    name = Work Name
    email = developer@work.example
```

В `~/.gitconfig-personal` запиши:

```gitconfig
[user]
    name = personal-login
    email = developer@personal.example
```

В существующем `~/.gitconfig` убери **безусловные** `user.name` и `user.email`, если они там есть. Сохрани остальные настройки и добавь следующие правила. Они учитывают как HTTPS-ссылку из кнопки **Clone**, так и обе записи SSH-адреса.

```gitconfig
[user]
    useConfigOnly = true

[includeIf "hasconfig:remote.*.url:https://gitlab.example.com/**"]
    path = ~/.gitconfig-work
[includeIf "hasconfig:remote.*.url:git@gitlab.example.com:*/**"]
    path = ~/.gitconfig-work
[includeIf "hasconfig:remote.*.url:ssh://git@gitlab.example.com/**"]
    path = ~/.gitconfig-work

[includeIf "hasconfig:remote.*.url:https://github.com/**"]
    path = ~/.gitconfig-personal
[includeIf "hasconfig:remote.*.url:git@github.com:*/**"]
    path = ~/.gitconfig-personal
[includeIf "hasconfig:remote.*.url:ssh://git@github.com/**"]
    path = ~/.gitconfig-personal
```

После `git clone` профиль уже выбран. После `git init` добавь `origin` как обычно. Без подходящего адреса или явно заданного автора `git commit` остановится с ошибкой. В старом клоне `git config --show-origin --get user.email` покажет, не перекрывает ли профиль собственная настройка в `.git/config`.

## 2. Рабочий GitLab по SSH

Если рабочий ключ на этом Mac уже есть, используй его. Если его нет, создай командой `ssh-keygen -t ed25519` с парольной фразой. Не перезаписывай существующий ключ. Ниже используется стандартное имя `id_ed25519`.

Проверь **SSH keys** именно в рабочем GitLab (`https://gitlab.example.com/-/user_settings/ssh_keys`), даже если ключ уже есть в корпоративном профиле. Если в GitLab его нет:

1. Выполни `pbcopy < ~/.ssh/id_ed25519.pub`. В буфер попадёт только публичная часть `.pub`.
2. Нажми **Add new key**, вставь скопированное в **Key** и дай ключу название.
3. Оставь **Authentication & Signing** либо выбери **Authentication**. Если **Expiration date** помечено как необязательное поле, дату можно убрать. Нажми **Add key**.

В `~/.gitconfig` добавь это правило, **только если для рабочего хоста ещё нет эквивалентного `insteadOf`**. Тогда даже HTTPS-ссылка этого GitLab будет открываться по SSH. На GitHub правило не действует.

```gitconfig
[url "git@gitlab.example.com:"]
    insteadOf = https://gitlab.example.com/
```

Проверь вход без обращения к репозиторию:

```sh
ssh -T git@gitlab.example.com
```

При первом подключении сверь отпечаток **сервера** с указанным в документации работодателя или у администратора, прежде чем принять его. Парольную фразу **своего ключа** вводи в Терминале. Ответ `Welcome to GitLab, @рабочий-логин!` подтверждает аккаунт. `-T` отключает запрос интерактивного терминала, которого GitLab не предоставляет.

Если Pi не может запросить парольную фразу, выполни `ssh-add -t 10m ~/.ssh/id_ed25519` в своём Терминале. Это разблокирует ключ для SSH-агента на десять минут. Токен GitLab API, который могут запрашивать MCP или IDE для работы с merge requests, для этого не нужен.

## 3. Личный GitHub по HTTPS

На Mac с Homebrew установи `gh` и запусти вход:

```sh
brew install gh
gh auth login --hostname github.com --git-protocol https --web
```

Если появится вопрос об использовании этого входа для Git, выбери **Yes**. Подтверди одноразовый код в браузере под **личным** аккаунтом. Затем подключи `gh` как помощник Git для `github.com` и проверь логин:

```sh
gh auth setup-git --hostname github.com
gh api --hostname github.com user --jq .login
```

Для личных клонов копируй **HTTPS**-адрес с GitHub. Вход в браузере сам по себе не авторизует Git в Терминале. При таком способе вручную создавать токен не нужно.

## 4. Проверка без коммита и пуша

В рабочем и личном клоне выполни `git var GIT_AUTHOR_IDENT` и `git var GIT_COMMITTER_IDENT`. В первом должны быть рабочие имя и почта, во втором — личные.

В личном HTTPS-клоне с `origin` на GitHub выполни:

```sh
gh api --hostname github.com 'repos/{owner}/{repo}' --jq .permissions.push
git -c http.proactiveAuth=basic ls-remote --exit-code origin HEAD
```

`true` означает, что GitHub сообщает о праве записи в этот репозиторий. В непустом репозитории вторая команда выводит хеш и `HEAD`. Начиная с Git 2.46 параметр `http.proactiveAuth=basic` запрашивает авторизацию даже для публичного репозитория. На более старом Git успешное чтение публичного `HEAD` не доказывает вход. Обе команды только читают данные.
