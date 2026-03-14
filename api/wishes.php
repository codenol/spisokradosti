<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];

// GET /api/wishes.php  →  return all wishes ordered newest first
if ($method === 'GET') {
    $rows = getDb()->query('SELECT data FROM wishes ORDER BY created_at DESC')->fetchAll();
    jsonOut(array_map(fn($r) => json_decode($r['data'], true), $rows));
}

// POST /api/wishes.php  body: wish object  →  upsert, return saved object
if ($method === 'POST') {
    $item = bodyJson();
    if (empty($item['id'])) jsonOut(['error' => 'Missing id'], 400);

    $json = json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    getDb()
        ->prepare('INSERT INTO wishes (id, data) VALUES (?, ?)
                   ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()')
        ->execute([$item['id'], $json]);

    jsonOut($item);
}

// DELETE /api/wishes.php?id=xxx  →  remove wish
if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if ($id === '') jsonOut(['error' => 'Missing id'], 400);

    getDb()->prepare('DELETE FROM wishes WHERE id = ?')->execute([$id]);
    jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Method not allowed'], 405);
