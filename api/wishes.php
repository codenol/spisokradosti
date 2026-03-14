<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

startSession();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// GET ?list_id=xxx  — public lists readable without auth
if ($method === 'GET') {
    $listId = $_GET['list_id'] ?? '';
    if (!$listId) jsonOut(['error' => 'Missing list_id'], 400);
    $user   = optionalAuth();
    $userId = $user ? (int)$user['id'] : null;
    if (!canReadList($listId, $userId)) jsonOut(['error' => 'Forbidden'], 403);

    $stmt = getDb()->prepare('SELECT data FROM wishes WHERE list_id = ? ORDER BY created_at DESC');
    $stmt->execute([$listId]);
    jsonOut(array_map(fn($r) => json_decode($r['data'], true), $stmt->fetchAll()));
}

// POST ?action=copy  {source_id, source_list_id}  — copy item to own list
if ($method === 'POST' && $action === 'copy') {
    $user   = requireAuth();
    $userId = (int)$user['id'];
    $body   = bodyJson();

    $sourceId     = $body['source_id'] ?? '';
    $sourceListId = $body['source_list_id'] ?? '';
    if (!$sourceId || !$sourceListId) jsonOut(['error' => 'Missing params'], 400);
    if (!canReadList($sourceListId, $userId)) jsonOut(['error' => 'Forbidden'], 403);

    $stmt = getDb()->prepare('SELECT data FROM wishes WHERE id = ? AND list_id = ?');
    $stmt->execute([$sourceId, $sourceListId]);
    $row = $stmt->fetch();
    if (!$row) jsonOut(['error' => 'Item not found'], 404);

    $item = json_decode($row['data'], true);

    $myListId = getUserListId($userId);
    if (!$myListId) jsonOut(['error' => 'No list found'], 404);

    $newId          = dbGenId();
    $item['id']     = $newId;
    $item['list_id'] = $myListId;
    unset($item['visits']); // don't copy visit history

    $json = json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    getDb()->prepare('INSERT INTO wishes (id, list_id, data) VALUES (?, ?, ?)')
           ->execute([$newId, $myListId, $json]);
    jsonOut($item);
}

// POST (upsert)  body: wish object (must include list_id)
if ($method === 'POST') {
    $user   = requireAuth();
    $userId = (int)$user['id'];
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
    $user   = requireAuth();
    $userId = (int)$user['id'];
    $id     = $_GET['id'] ?? '';
    $listId = $_GET['list_id'] ?? '';
    if (!$id || !$listId) jsonOut(['error' => 'Missing params'], 400);
    if (!canWriteList($listId, $userId)) jsonOut(['error' => 'Forbidden'], 403);

    getDb()->prepare('DELETE FROM wishes WHERE id = ? AND list_id = ?')->execute([$id, $listId]);
    jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Method not allowed'], 405);
