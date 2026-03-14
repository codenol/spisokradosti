<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

startSession();
$user   = requireAuth();
$userId = (int)$user['id'];
$method = $_SERVER['REQUEST_METHOD'];

// GET ?list_id=xxx
if ($method === 'GET') {
    $listId = $_GET['list_id'] ?? '';
    if (!$listId) jsonOut(['error' => 'Missing list_id'], 400);
    if (!canReadList($listId, $userId)) jsonOut(['error' => 'Forbidden'], 403);

    $stmt = getDb()->prepare('SELECT data FROM wishes WHERE list_id = ? ORDER BY created_at DESC');
    $stmt->execute([$listId]);
    jsonOut(array_map(fn($r) => json_decode($r['data'], true), $stmt->fetchAll()));
}

// POST  body: wish object (must include list_id)
if ($method === 'POST') {
    $item   = bodyJson();
    $listId = $item['list_id'] ?? '';
    if (empty($item['id'])) jsonOut(['error' => 'Missing id'], 400);
    if (!$listId) jsonOut(['error' => 'Missing list_id'], 400);
    if (!canWriteList($listId, $userId)) jsonOut(['error' => 'Forbidden'], 403);

    $json = json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    getDb()->prepare(
        'INSERT INTO wishes (id, list_id, data) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()'
    )->execute([$item['id'], $listId, $json]);
    jsonOut($item);
}

// DELETE ?id=xxx&list_id=xxx
if ($method === 'DELETE') {
    $id     = $_GET['id'] ?? '';
    $listId = $_GET['list_id'] ?? '';
    if (!$id || !$listId) jsonOut(['error' => 'Missing params'], 400);
    if (!canWriteList($listId, $userId)) jsonOut(['error' => 'Forbidden'], 403);

    getDb()->prepare('DELETE FROM wishes WHERE id = ? AND list_id = ?')->execute([$id, $listId]);
    jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Method not allowed'], 405);
