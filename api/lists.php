<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

startSession();
$user   = requireAuth();
$userId = (int)$user['id'];
$action = $_GET['action'] ?? '';
$body   = bodyJson();
$method = $_SERVER['REQUEST_METHOD'];

// GET ?action=search&q=xxx  →  public lists
if ($method === 'GET' && $action === 'search') {
    $q    = '%' . trim($_GET['q'] ?? '') . '%';
    $stmt = getDb()->prepare(
        'SELECT l.id, l.name, u.username, l.updated_at,
                (SELECT COUNT(*) FROM wishes WHERE list_id = l.id) AS wish_count,
                (SELECT COUNT(*) FROM list_subscriptions WHERE list_id = l.id) AS subscriber_count,
                EXISTS(SELECT 1 FROM list_subscriptions WHERE list_id = l.id AND user_id = ?) AS is_subscribed
         FROM lists l
         JOIN users u ON u.id = l.owner_id
         WHERE l.is_public = 1 AND l.owner_id != ?
           AND (l.name LIKE ? OR u.username LIKE ?)
         ORDER BY subscriber_count DESC, l.updated_at DESC
         LIMIT 30'
    );
    $stmt->execute([$userId, $userId, $q, $q]);
    jsonOut($stmt->fetchAll());
}

// GET ?action=subscriptions  →  lists I subscribed to
if ($method === 'GET' && $action === 'subscriptions') {
    $stmt = getDb()->prepare(
        'SELECT l.id, l.name, u.username, l.is_public, l.updated_at,
                (SELECT COUNT(*) FROM wishes WHERE list_id = l.id) AS wish_count
         FROM list_subscriptions s
         JOIN lists l ON l.id = s.list_id
         JOIN users u ON u.id = l.owner_id
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC'
    );
    $stmt->execute([$userId]);
    jsonOut($stmt->fetchAll());
}

// GET ?action=info&id=xxx
if ($method === 'GET' && $action === 'info') {
    $id = $_GET['id'] ?? '';
    if (!$id) jsonOut(['error' => 'Missing id'], 400);
    if (!canReadList($id, $userId)) jsonOut(['error' => 'Not found'], 404);

    $stmt = getDb()->prepare(
        'SELECT l.id, l.name, l.is_public, u.username, u.id AS owner_id,
                (SELECT COUNT(*) FROM wishes WHERE list_id = l.id) AS wish_count,
                (SELECT COUNT(*) FROM list_subscriptions WHERE list_id = l.id) AS subscriber_count,
                EXISTS(SELECT 1 FROM list_subscriptions WHERE list_id = l.id AND user_id = ?) AS is_subscribed
         FROM lists l
         JOIN users u ON u.id = l.owner_id
         WHERE l.id = ?'
    );
    $stmt->execute([$userId, $id]);
    $info = $stmt->fetch();
    if (!$info) jsonOut(['error' => 'Not found'], 404);
    jsonOut($info);
}

// GET ?action=members&id=xxx  →  editors of my list
if ($method === 'GET' && $action === 'members') {
    $id = $_GET['id'] ?? '';
    if (!canWriteList($id, $userId)) jsonOut(['error' => 'Forbidden'], 403);

    $stmt = getDb()->prepare(
        'SELECT u.id, u.username, m.created_at
         FROM list_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.list_id = ?
         ORDER BY m.created_at ASC'
    );
    $stmt->execute([$id]);
    jsonOut($stmt->fetchAll());
}

// POST ?action=update  {id, name?, is_public?}
if ($method === 'POST' && $action === 'update') {
    $id = $body['id'] ?? '';
    if (!$id) jsonOut(['error' => 'Missing id'], 400);

    $stmt = getDb()->prepare('SELECT owner_id FROM lists WHERE id = ?');
    $stmt->execute([$id]);
    $list = $stmt->fetch();
    if (!$list || (int)$list['owner_id'] !== $userId) jsonOut(['error' => 'Forbidden'], 403);

    $db = getDb();
    if (isset($body['name']) && trim($body['name']) !== '')
        $db->prepare('UPDATE lists SET name = ? WHERE id = ?')->execute([trim($body['name']), $id]);
    if (isset($body['is_public']))
        $db->prepare('UPDATE lists SET is_public = ? WHERE id = ?')
           ->execute([(int)(bool)$body['is_public'], $id]);

    $stmt = $db->prepare('SELECT l.id, l.name, l.is_public, u.username FROM lists l JOIN users u ON u.id = l.owner_id WHERE l.id = ?');
    $stmt->execute([$id]);
    jsonOut($stmt->fetch());
}

// POST ?action=remove_member  {list_id, user_id}
if ($method === 'POST' && $action === 'remove_member') {
    $listId   = $body['list_id'] ?? '';
    $memberId = (int)($body['user_id'] ?? 0);
    if (!$listId || !$memberId) jsonOut(['error' => 'Missing params'], 400);

    $stmt = getDb()->prepare('SELECT owner_id FROM lists WHERE id = ?');
    $stmt->execute([$listId]);
    $list = $stmt->fetch();
    if (!$list || (int)$list['owner_id'] !== $userId) jsonOut(['error' => 'Forbidden'], 403);

    getDb()->prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?')
           ->execute([$listId, $memberId]);
    jsonOut(['ok' => true]);
}

// POST ?action=subscribe  {id}
if ($method === 'POST' && $action === 'subscribe') {
    $id = $body['id'] ?? '';
    if (!$id) jsonOut(['error' => 'Missing id'], 400);

    $stmt = getDb()->prepare('SELECT is_public, owner_id FROM lists WHERE id = ?');
    $stmt->execute([$id]);
    $list = $stmt->fetch();
    if (!$list) jsonOut(['error' => 'List not found'], 404);
    if (!$list['is_public']) jsonOut(['error' => 'List is not public'], 403);
    if ((int)$list['owner_id'] === $userId) jsonOut(['error' => 'Cannot subscribe to your own list'], 400);

    getDb()->prepare('INSERT IGNORE INTO list_subscriptions (list_id, user_id) VALUES (?, ?)')
           ->execute([$id, $userId]);
    jsonOut(['ok' => true]);
}

// POST ?action=unsubscribe  {id}
if ($method === 'POST' && $action === 'unsubscribe') {
    $id = $body['id'] ?? '';
    if (!$id) jsonOut(['error' => 'Missing id'], 400);

    getDb()->prepare('DELETE FROM list_subscriptions WHERE list_id = ? AND user_id = ?')
           ->execute([$id, $userId]);
    jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Unknown action'], 400);
