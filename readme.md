# git.deploy.server

## Установка на сервере

```
# Клонируем приложение
git clone https://github.com/sskuban/git.deploy.server
cd github-webhook-server

# Устанавливаем зависимости
npm install
```

## Настройка репозиториев

Создайте файл repository.json:

```
{
  "username/repository-name": {
    "secret": "your-github-webhook-secret",
    "deployScript": "/path/to/deploy-script.sh",
    "branch": "main",
    "projectName": "your-project-name"
  }
}
```

## Создание скрипта деплоя

Пример deploy-script.sh:

```
#!/bin/bash
echo "🚀 Starting deployment of $PROJECT_NAME"

# Переходим в директорию проекта
cd /path/to/your/project

# Получаем последние изменения
git pull origin main

# Устанавливаем зависимости
npm install

# Собираем приложение
npm run build

# Перезапускаем сервис
pm2 restart your-app-name

echo "✅ Deployment completed"
```

Сделайте скрипт исполняемым:

```
chmod +x deploy-script.sh
```

## Запуск сервера

```
# Простой запуск
npm start

# Или с использованием PM2 для production
npm install -g pm2
pm2 start app.js --name "webhook-server"
pm2 save
pm2 startup

# Перезапуск после обновления
pm2 restart webhook-server
# Просмотр событий
pm2 logs webhook-server
```

## Конфигурация GitHub Webhook

1.  Перейдите в настройки репозитория GitHub

2.  Раздел "Webhooks" → "Add webhook"

3.  Настройки:

        Payload URL: http://your-ip:9000/webhook/username-repository-name

        Content type: application/json

        Secret: тот же секрет, что в repository.json

        Events: "Just the push event"

        Branch: выберите нужную ветку

## Проверка работоспособности

Health check

```

curl http://your-ip:9000/health

```

Проверка конфигурации

```

curl https://your-domain.com/config

```

Тестирование подписи

```

curl -X POST https://your-domain.com/test-signature \
 -H "Content-Type: application/json" \
 -d '{
"secret": "your-secret",
"signature": "sha256=...",
"payload": {"test": "data"}
}'

```

```
sudo apt update
sudo apt install git nginx curl software-properties-common

curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs

mkdir ~/webhook-server
cd ~/webhook-server
npm init -y
npm install github-webhook-handler express

pm2 start webhook-server.js --name "webhook-server"
pm2 restart webhook-server
pm2 logs webhook-server
```

# Разработчик и контактные лица

ССК, Отдел разработки и сопровождения продуктовых решений

gaiduk.ai@sskuban.ru

© ССК, 2024. Все права защищены

Сделано в ДИТ - ССК with ❤️
