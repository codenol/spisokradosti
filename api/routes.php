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

    $stmt = getDb()->prepare('SELECT data FROM routes WHERE list_id = ? ORDER BY created_at DESC');
    $stmt->execute([$listId]);
    jsonOut(array_map(fn($r) => json_decode($r['data'], true), $stmt->fetchAll()));
}

// POST  body: route object (must include list_id)
if ($method === 'POST') {
    $route  = bodyJson();
    $listId = $route['list_id'] ?? '';
    if (empty($route['id'])) jsonOut(['error' => 'Missing id'], 400);
    if (!$listId) jsonOut(['error' => 'Missing list_id'], 400);
    if (!canWriteList($listId, $userId)) jsonOut(['error' => 'Forbidden'], 403);

    $json = json_encode($route, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    getDb()->prepare(
        'INSERT INTO routes (id, list_id, data) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()'
    )->execute([$route['id'], $listId, $json]);
    jsonOut($route);
}

// DELETE ?id=xxx&list_id=xxx
if ($method === 'DELETE') {
    $id     = $_GET['id'] ?? '';
    $listId = $_GET['list_id'] ?? '';
    if (!$id || !$listId) jsonOut(['error' => 'Missing params'], 400);
    if (!canWriteList($listId, $userId)) jsonOut(['error' => 'Forbidden'], 403);

    getDb()->prepare('DELETE FROM routes WHERE id = ? AND list_id = ?')->execute([$id, $listId]);
    jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Method not allowed'], 405);
