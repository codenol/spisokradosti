<?php
declare(strict_types=1);

set_exception_handler(function ($e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
    exit;
});

$configFile = __DIR__ . '/../config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Not configured. Please run install.php']);
    exit;
}

require_once $configFile;

function getDb(): PDO
{
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_NAME);
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    return $pdo;
}

function jsonOut($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function bodyJson(): array
{
    $raw = file_get_contents('php://input');
    return json_decode($raw ?: '{}', true) ?? [];
}

function dbGenId(): string
{
    return bin2hex(random_bytes(8));
}

// ── Session / Auth helpers ───────────────────────────────────────────────────

function startSession(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'lifetime' => 60 * 60 * 24 * 30,
            'path'     => '/',
            'samesite' => 'Lax',
            'httponly' => true,
            'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        ]);
        session_start();
    }
}

function getCurrentUser(): ?array
{
    startSession();
    $uid = $_SESSION['user_id'] ?? null;
    if (!$uid) return null;

    $stmt = getDb()->prepare('SELECT id, username, email FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function requireAuth(): array
{
    $user = getCurrentUser();
    if (!$user) jsonOut(['error' => 'Unauthorized'], 401);
    return $user;
}

function getUserListId(int $userId): ?string
{
    $stmt = getDb()->prepare('SELECT id FROM lists WHERE owner_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    return $row ? $row['id'] : null;
}

// ── Access control ───────────────────────────────────────────────────────────

function canReadList(string $listId, int $userId): bool
{
    $stmt = getDb()->prepare('SELECT owner_id, is_public FROM lists WHERE id = ?');
    $stmt->execute([$listId]);
    $list = $stmt->fetch();
    if (!$list) return false;
    if ((int)$list['owner_id'] === $userId) return true;

    // Editor
    $stmt = getDb()->prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?');
    $stmt->execute([$listId, $userId]);
    if ($stmt->fetch()) return true;

    // Public list — any authenticated user can read
    return (bool)$list['is_public'];
}

function canWriteList(string $listId, int $userId): bool
{
    $stmt = getDb()->prepare('SELECT owner_id FROM lists WHERE id = ?');
    $stmt->execute([$listId]);
    $list = $stmt->fetch();
    if (!$list) return false;
    if ((int)$list['owner_id'] === $userId) return true;

    $stmt = getDb()->prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?');
    $stmt->execute([$listId, $userId]);
    return (bool)$stmt->fetch();
}
