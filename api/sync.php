<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

startSession();
$user   = requireAuth();
$userId = (int)$user['id'];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonOut(['error' => 'POST only'], 405);

$body   = bodyJson();
$listId = $body['list_id'] ?? '';
$items  = $body['items']   ?? [];
$routes = $body['routes']  ?? [];

if (!$listId) jsonOut(['error' => 'Missing list_id'], 400);
if (!canWriteList($listId, $userId)) jsonOut(['error' => 'Forbidden'], 403);
if (!is_array($items) || !is_array($routes)) jsonOut(['error' => 'Invalid payload'], 400);

$db = getDb();
$db->beginTransaction();
try {
    $db->prepare('DELETE FROM wishes WHERE list_id = ?')->execute([$listId]);
    $db->prepare('DELETE FROM routes WHERE list_id = ?')->execute([$listId]);

    $stmtW = $db->prepare('INSERT INTO wishes (id, list_id, data) VALUES (?, ?, ?)');
    foreach ($items as $item) {
        if (!empty($item['id'])) {
            $stmtW->execute([
                $item['id'], $listId,
                json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
        }
    }

    $stmtR = $db->prepare('INSERT INTO routes (id, list_id, data) VALUES (?, ?, ?)');
    foreach ($routes as $route) {
        if (!empty($route['id'])) {
            $stmtR->execute([
                $route['id'], $listId,
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
