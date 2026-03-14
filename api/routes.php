<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];

// GET  →  all routes
if ($method === 'GET') {
    $rows = getDb()->query('SELECT data FROM routes ORDER BY created_at DESC')->fetchAll();
    jsonOut(array_map(fn($r) => json_decode($r['data'], true), $rows));
}

// POST  body: route object  →  upsert
if ($method === 'POST') {
    $route = bodyJson();
    if (empty($route['id'])) jsonOut(['error' => 'Missing id'], 400);

    $json = json_encode($route, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    getDb()
        ->prepare('INSERT INTO routes (id, data) VALUES (?, ?)
                   ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()')
        ->execute([$route['id'], $json]);

    jsonOut($route);
}

// DELETE ?id=xxx
if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if ($id === '') jsonOut(['error' => 'Missing id'], 400);

    getDb()->prepare('DELETE FROM routes WHERE id = ?')->execute([$id]);
    jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Method not allowed'], 405);
