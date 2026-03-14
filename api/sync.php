<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonOut(['error' => 'POST only'], 405);

$body   = bodyJson();
$items  = $body['items']  ?? [];
$routes = $body['routes'] ?? [];

if (!is_array($items) || !is_array($routes)) jsonOut(['error' => 'Invalid payload'], 400);

$db = getDb();
$db->beginTransaction();
try {
    $db->exec('DELETE FROM wishes');
    $db->exec('DELETE FROM routes');

    $stmtW = $db->prepare('INSERT INTO wishes (id, data) VALUES (?, ?)');
    foreach ($items as $item) {
        if (!empty($item['id'])) {
            $stmtW->execute([
                $item['id'],
                json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
        }
    }

    $stmtR = $db->prepare('INSERT INTO routes (id, data) VALUES (?, ?)');
    foreach ($routes as $route) {
        if (!empty($route['id'])) {
            $stmtR->execute([
                $route['id'],
                json_encode($route, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
        }
    }

    $db->commit();
    jsonOut(['ok' => true, 'items' => count($items), 'routes' => count($routes)]);
} catch (Throwable $e) {
    $db->rollBack();
    jsonOut(['error' => $e->getMessage()], 500);
}
