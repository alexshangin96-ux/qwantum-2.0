@echo off
echo ========================================
echo    Загрузка проекта на GitHub
echo    Qwantum 2.0 Project
echo ========================================
echo.

REM Проверка наличия Git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ОШИБКА: Git не установлен!
    echo Пожалуйста, установите Git с https://git-scm.com/download/win
    echo После установки перезапустите этот файл.
    pause
    exit /b 1
)

echo Git найден! Продолжаем...
echo.

REM Настройка Git (замените на свои данные)
echo Настройка Git...
echo Введите ваше имя для Git:
set /p git_name="Имя: "
echo Введите ваш email:
set /p git_email="Email: "

git config --global user.name "%git_name%"
git config --global user.email "%git_email%"

echo.
echo Git настроен!
echo.

REM Инициализация репозитория
echo Инициализация Git репозитория...
git init

REM Добавление файлов
echo Добавление файлов в репозиторий...
git add .

REM Создание коммита
echo Создание коммита...
git commit -m "Initial commit: Qwantum 2.0 project"

echo.
echo ========================================
echo Локальный репозиторий создан успешно!
echo.
echo Теперь нужно:
echo 1. Создать репозиторий на GitHub.com
echo 2. Скопировать URL репозитория
echo 3. Выполнить команды ниже
echo ========================================
echo.

REM Запрос URL репозитория
echo Введите URL вашего GitHub репозитория:
echo Пример: https://github.com/username/qwantum-2.0.git
set /p repo_url="URL: "

REM Добавление удаленного репозитория
echo Добавление удаленного репозитория...
git remote add origin %repo_url%

REM Загрузка на GitHub
echo Загрузка файлов на GitHub...
git push -u origin master

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo УСПЕХ! Файлы загружены на GitHub!
    echo ========================================
) else (
    echo.
    echo ========================================
    echo ОШИБКА при загрузке!
    echo Возможные причины:
    echo - Неправильный URL репозитория
    echo - Проблемы с аутентификацией
    echo - Репозиторий не существует
    echo ========================================
)

echo.
pause
