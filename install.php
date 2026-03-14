<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Установка — Список желаний</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f0f2f5; color: #2c3e50; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,.08); padding: 36px; width: 100%; max-width: 480px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .subtitle { color: #7f8c8d; font-size: 14px; margin-bottom: 28px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #555; margin-bottom: 5px; }
    input[type=text], input[type=password] {
      width: 100%; padding: 10px 14px; border: 1px solid #dde1e7; border-radius: 8px;
      font-size: 15px; outline: none; transition: border-color .15s;
    }
    input:focus { border-color: #27ae60; }
    .group { margin-bottom: 18px; }
    .hint { font-size: 12px; color: #95a5a6; margin-top: 4px; }
    button[type=submit] {
      width: 100%; padding: 12px; background: #27ae60; color: #fff; border: none;
      border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer;
      transition: background .15s;
    }
    button[type=submit]:hover { background: #219a52; }
    .alert { border-radius: 10px; padding: 14px 16px; margin-bottom: 22px; font-size: 14px; line-height: 1.5; }
    .alert-ok  { background: #eafaf1; border: 1px solid #a9dfbf; color: #1e8449; }
    .alert-err { background: #fdedec; border: 1px solid #f5b7b1; color: #a93226; }
    .steps { list-style: none; margin-top: 16px; }
    .steps li { padding: 5px 0 5px 24px; position: relative; font-size: 14px; }
    .steps li::before { content: ''; position: absolute; left: 0; top: 9px; width: 12px; height: 12px; border-radius: 50%; }
    .steps li.ok::before  { background: #27ae60; }
    .steps li.err::before { background: #e74c3c; }
    .steps li.ok  { color: #1e8449; }
    .steps li.err { color: #a93226; }
    .delete-hint { margin-top: 20px; padding: 12px 14px; background: #fef9e7; border: 1px solid #f7dc6f; border-radius: 8px; font-size: 13px; color: #7d6608; }
    .already { text-align: center; color: #7f8c8d; font-size: 14px; margin-top: 16px; }
    a { color: #27ae60; }
  </style>
</head>
<body>
<?php
declare(strict_types=1);

$configFile = __DIR__ . '/config.php';
$steps      = [];
$success    = false;
$error      = '';

// ── POST: run installation ───────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $host = trim($_POST['host'] ?? 'localhost');
    $name = trim($_POST['name'] ?? 'wishlist');
    $user = trim($_POST['user'] ?? '');
    $pass = $_POST['pass'] ?? '';

    if ($user === '') {
        $error = 'Укажите имя пользователя MySQL.';
    } else {

        // 1. Test connection (without selecting a DB first)
        try {
            $dsn = "mysql:host={$host};charset=utf8mb4";
            $pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $steps[] = ['ok', 'Подключение к MySQL — успешно'];
        } catch (PDOException $e) {
            $error = 'Не удалось подключиться к MySQL: ' . htmlspecialchars($e->getMessage());
        }

        if (!$error) {
            // 2. Create DB if not exists
            try {
                $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                $pdo->exec("USE `{$name}`");
                $steps[] = ['ok', "База данных «{$name}» — готова"];
            } catch (PDOException $e) {
                $error = 'Ошибка создания БД: ' . htmlspecialchars($e->getMessage());
                $steps[] = ['err', 'Создание базы данных — ошибка'];
            }
        }

        if (!$error) {
            // 3. Create tables
            try {
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS wishes (
                        id          VARCHAR(32)     NOT NULL PRIMARY KEY,
                        data        LONGTEXT        NOT NULL,
                        created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                ");
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS routes (
                        id          VARCHAR(32)     NOT NULL PRIMARY KEY,
                        data        LONGTEXT        NOT NULL,
                        created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                ");
                $steps[] = ['ok', 'Таблицы wishes и routes — созданы'];
            } catch (PDOException $e) {
                $error = 'Ошибка создания таблиц: ' . htmlspecialchars($e->getMessage());
                $steps[] = ['err', 'Создание таблиц — ошибка'];
            }
        }

        if (!$error) {
            // 4. Write config.php
            $configContent = <<<PHP
<?php
// Generated by install.php on {$_SERVER['HTTP_HOST']} — {date('Y-m-d H:i:s')}
// Delete install.php after setup is complete.
define('DB_HOST', {$q = var_export($host, true)});
define('DB_NAME', {var_export($name, true)});
define('DB_USER', {var_export($user, true)});
define('DB_PASS', {var_export($pass, true)});
PHP;
            // Re-write cleanly with proper interpolation
            $cfg = "<?php\n"
                . "// Generated by install.php — " . date('Y-m-d H:i:s') . "\n"
                . "// Delete install.php after setup is complete.\n"
                . "define('DB_HOST', " . var_export($host, true) . ");\n"
                . "define('DB_NAME', " . var_export($name, true) . ");\n"
                . "define('DB_USER', " . var_export($user, true) . ");\n"
                . "define('DB_PASS', " . var_export($pass, true) . ");\n";

            if (file_put_contents($configFile, $cfg) === false) {
                $error = 'Не удалось записать config.php. Проверьте права на запись в корневой директории.';
                $steps[] = ['err', 'Запись config.php — ошибка прав'];
            } else {
                $steps[] = ['ok', 'config.php — создан'];
                $success  = true;
            }
        }
    }
}
?>
<div class="card">
  <h1>Установка бэкенда</h1>
  <p class="subtitle">Список желаний · PHP + MySQL</p>

  <?php if ($success): ?>

    <div class="alert alert-ok">
      <strong>Установка завершена!</strong>
      <ul class="steps">
        <?php foreach ($steps as [$status, $text]): ?>
          <li class="<?= $status ?>"><?= htmlspecialchars($text) ?></li>
        <?php endforeach; ?>
      </ul>
    </div>

    <div class="delete-hint">
      ⚠️ <strong>Удалите install.php с сервера</strong> — он больше не нужен и открывает доступ к настройкам БД.
    </div>

    <p class="already" style="margin-top:24px">
      <a href="index.html">Открыть приложение →</a>
    </p>

  <?php elseif ($error): ?>

    <div class="alert alert-err">
      <strong>Ошибка:</strong> <?= $error ?>
      <?php if ($steps): ?>
        <ul class="steps" style="margin-top:10px">
          <?php foreach ($steps as [$status, $text]): ?>
            <li class="<?= $status ?>"><?= htmlspecialchars($text) ?></li>
          <?php endforeach; ?>
        </ul>
      <?php endif; ?>
    </div>
    <!-- fall through to form so user can retry -->

  <?php elseif (file_exists($configFile)): ?>

    <div class="alert alert-ok">
      config.php уже существует. Установка была выполнена ранее.<br>
      Если нужно переустановить — удалите config.php и откройте эту страницу снова.
    </div>
    <p class="already"><a href="index.html">Открыть приложение →</a></p>
    <?php return; ?>

  <?php endif; ?>

  <?php if (!$success): ?>
  <form method="POST">
    <div class="group">
      <label for="host">Хост MySQL</label>
      <input id="host" name="host" type="text" value="<?= htmlspecialchars($_POST['host'] ?? 'localhost') ?>" required>
      <p class="hint">Обычно localhost или 127.0.0.1</p>
    </div>
    <div class="group">
      <label for="name">Имя базы данных</label>
      <input id="name" name="name" type="text" value="<?= htmlspecialchars($_POST['name'] ?? 'wishlist') ?>" required>
      <p class="hint">Будет создана автоматически, если не существует</p>
    </div>
    <div class="group">
      <label for="user">Пользователь MySQL</label>
      <input id="user" name="user" type="text" value="<?= htmlspecialchars($_POST['user'] ?? '') ?>" required>
    </div>
    <div class="group">
      <label for="pass">Пароль MySQL</label>
      <input id="pass" name="pass" type="password" value="">
      <p class="hint">Оставьте пустым, если пароля нет</p>
    </div>
    <button type="submit">Установить</button>
  </form>
  <?php endif; ?>

</div>
</body>
</html>
