<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

startSession();

$action = $_GET['action'] ?? '';
$body   = bodyJson();
$method = $_SERVER['REQUEST_METHOD'];

// GET ?action=me
if ($method === 'GET' && $action === 'me') {
    $user = getCurrentUser();
    if (!$user) jsonOut(['user' => null]);

    $listId = getUserListId((int)$user['id']);
    jsonOut(['user' => array_merge($user, ['list_id' => $listId])]);
}

// POST ?action=register  {username, email, password}
if ($method === 'POST' && $action === 'register') {
    $username = trim($body['username'] ?? '');
    $email    = strtolower(trim($body['email'] ?? ''));
    $password = $body['password'] ?? '';

    if (!$username || !$email || !$password) jsonOut(['error' => 'Заполните все поля'], 400);
    if (mb_strlen($username) < 3 || mb_strlen($username) > 50)
        jsonOut(['error' => 'Имя пользователя: 3–50 символов'], 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) jsonOut(['error' => 'Неверный email'], 400);
    if (strlen($password) < 6) jsonOut(['error' => 'Пароль: минимум 6 символов'], 400);
    if (!preg_match('/^[\w\-а-яёА-ЯЁ]+$/u', $username))
        jsonOut(['error' => 'Имя пользователя: буквы, цифры, _ и -'], 400);

    $db   = getDb();
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ? OR username = ?');
    $stmt->execute([$email, $username]);
    if ($stmt->fetch()) jsonOut(['error' => 'Email или имя пользователя уже заняты'], 409);

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $db->prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
       ->execute([$username, $email, $hash]);
    $userId = (int)$db->lastInsertId();

    $listId = dbGenId();
    $db->prepare('INSERT INTO lists (id, owner_id, name) VALUES (?, ?, ?)')
       ->execute([$listId, $userId, $username . "'s list"]);

    $_SESSION['user_id'] = $userId;
    jsonOut(['user' => ['id' => $userId, 'username' => $username, 'email' => $email, 'list_id' => $listId]]);
}

// POST ?action=login  {email, password}
if ($method === 'POST' && $action === 'login') {
    $email    = strtolower(trim($body['email'] ?? ''));
    $password = $body['password'] ?? '';

    if (!$email || !$password) jsonOut(['error' => 'Заполните все поля'], 400);

    $stmt = getDb()->prepare('SELECT id, username, email, password_hash FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash']))
        jsonOut(['error' => 'Неверный email или пароль'], 401);

    $_SESSION['user_id'] = $user['id'];
    $listId = getUserListId((int)$user['id']);
    jsonOut(['user' => ['id' => $user['id'], 'username' => $user['username'], 'email' => $user['email'], 'list_id' => $listId]]);
}

// POST ?action=logout
if ($method === 'POST' && $action === 'logout') {
    session_destroy();
    jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Unknown action'], 400);
