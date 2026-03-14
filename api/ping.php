<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$configFile = __DIR__ . '/../config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'reason' => 'not_configured']);
    exit;
}

try {
    require_once __DIR__ . '/db.php';
    getDb()->query('SELECT 1');

    startSession();
    $user   = getCurrentUser();
    $listId = $user ? getUserListId((int)$user['id']) : null;

    echo json_encode([
        'ok'   => true,
        'mode' => 'php',
        'user' => $user ? [
            'id'       => $user['id'],
            'username' => $user['username'],
            'email'    => $user['email'],
            'list_id'  => $listId,
        ] : null,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'reason' => 'db_error']);
}
