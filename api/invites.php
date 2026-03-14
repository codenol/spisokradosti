<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

startSession();
$user   = requireAuth();
$userId = (int)$user['id'];
$action = $_GET['action'] ?? '';
$body   = bodyJson();
$method = $_SERVER['REQUEST_METHOD'];

// GET ?action=incoming  →  pending invites for me
if ($method === 'GET' && $action === 'incoming') {
    $stmt = getDb()->prepare(
        'SELECT i.id, i.list_id, i.created_at,
                l.name AS list_name,
                u.username AS invited_by_username
         FROM list_invites i
         JOIN lists l ON l.id = i.list_id
         JOIN users u ON u.id = i.invited_by
         WHERE i.invited_user_id = ? AND i.status = "pending"
         ORDER BY i.created_at DESC'
    );
    $stmt->execute([$userId]);
    jsonOut($stmt->fetchAll());
}

// GET ?action=outgoing&list_id=xxx  →  pending invites I sent
if ($method === 'GET' && $action === 'outgoing') {
    $listId = $_GET['list_id'] ?? '';
    if (!$listId || !canWriteList($listId, $userId)) jsonOut(['error' => 'Forbidden'], 403);

    $stmt = getDb()->prepare(
        'SELECT i.id, i.invited_user_id, i.created_at, u.username AS invited_username
         FROM list_invites i
         JOIN users u ON u.id = i.invited_user_id
         WHERE i.list_id = ? AND i.invited_by = ? AND i.status = "pending"
         ORDER BY i.created_at DESC'
    );
    $stmt->execute([$listId, $userId]);
    jsonOut($stmt->fetchAll());
}

// POST ?action=send  {list_id, username}
if ($method === 'POST' && $action === 'send') {
    $listId   = $body['list_id'] ?? '';
    $username = trim($body['username'] ?? '');
    if (!$listId || !$username) jsonOut(['error' => 'Missing params'], 400);
    if (!canWriteList($listId, $userId)) jsonOut(['error' => 'Forbidden'], 403);

    $stmt = getDb()->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $target = $stmt->fetch();
    if (!$target) jsonOut(['error' => 'Пользователь не найден'], 404);

    $targetId = (int)$target['id'];
    if ($targetId === $userId) jsonOut(['error' => 'Нельзя пригласить себя'], 400);

    $stmt = getDb()->prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?');
    $stmt->execute([$listId, $targetId]);
    if ($stmt->fetch()) jsonOut(['error' => 'Пользователь уже редактор'], 409);

    $stmt = getDb()->prepare('SELECT 1 FROM list_invites WHERE list_id = ? AND invited_user_id = ? AND status = "pending"');
    $stmt->execute([$listId, $targetId]);
    if ($stmt->fetch()) jsonOut(['error' => 'Приглашение уже отправлено'], 409);

    $inviteId = dbGenId();
    getDb()->prepare('INSERT INTO list_invites (id, list_id, invited_user_id, invited_by) VALUES (?, ?, ?, ?)')
           ->execute([$inviteId, $listId, $targetId, $userId]);
    jsonOut(['ok' => true, 'id' => $inviteId]);
}

// POST ?action=accept  {id}
if ($method === 'POST' && $action === 'accept') {
    $inviteId = $body['id'] ?? '';
    if (!$inviteId) jsonOut(['error' => 'Missing id'], 400);

    $stmt = getDb()->prepare('SELECT * FROM list_invites WHERE id = ? AND invited_user_id = ? AND status = "pending"');
    $stmt->execute([$inviteId, $userId]);
    $invite = $stmt->fetch();
    if (!$invite) jsonOut(['error' => 'Invite not found'], 404);

    $db = getDb();
    $db->beginTransaction();
    try {
        $db->prepare('UPDATE list_invites SET status = "accepted" WHERE id = ?')->execute([$inviteId]);
        $db->prepare('INSERT IGNORE INTO list_members (list_id, user_id, invited_by) VALUES (?, ?, ?)')
           ->execute([$invite['list_id'], $userId, $invite['invited_by']]);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        jsonOut(['error' => $e->getMessage()], 500);
    }

    $stmt = $db->prepare('SELECT id, name FROM lists WHERE id = ?');
    $stmt->execute([$invite['list_id']]);
    jsonOut(['ok' => true, 'list' => $stmt->fetch()]);
}

// POST ?action=decline  {id}
if ($method === 'POST' && $action === 'decline') {
    $inviteId = $body['id'] ?? '';
    if (!$inviteId) jsonOut(['error' => 'Missing id'], 400);

    getDb()->prepare('UPDATE list_invites SET status = "declined" WHERE id = ? AND invited_user_id = ?')
           ->execute([$inviteId, $userId]);
    jsonOut(['ok' => true]);
}

// DELETE ?action=revoke&id=xxx  →  sender revokes
if ($method === 'DELETE' && $action === 'revoke') {
    $inviteId = $_GET['id'] ?? '';
    if (!$inviteId) jsonOut(['error' => 'Missing id'], 400);

    $stmt = getDb()->prepare('SELECT list_id FROM list_invites WHERE id = ? AND invited_by = ?');
    $stmt->execute([$inviteId, $userId]);
    if (!$stmt->fetch()) jsonOut(['error' => 'Not found'], 404);

    getDb()->prepare('DELETE FROM list_invites WHERE id = ?')->execute([$inviteId]);
    jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Unknown action'], 400);
