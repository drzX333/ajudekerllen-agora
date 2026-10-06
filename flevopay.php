<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-API-Key");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$apiKey = "sk_fdc7594e7eb1486ea3e282cc0a8249b55f1e0270b6844a8f506060f75d529968";
$baseUrl = "https://app.flevopay.com.br";
$action = isset($_GET['action']) ? $_GET['action'] : (isset($_POST['action']) ? $_POST['action'] : 'create');

if ($action === 'create' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);
    if (!is_array($data)) {
        $data = [];
    }

    $amount = isset($data['amount']) ? (int)$data['amount'] : 3000;
    $ref = isset($data['reference']) && !empty($data['reference']) ? $data['reference'] : 'REF_' . bin2hex(random_bytes(6));
    $desc = isset($data['description']) && !empty($data['description']) ? $data['description'] : 'Doação Amor Vivo - Kerllen';

    $cust = isset($data['customer']) && is_array($data['customer']) ? $data['customer'] : [];
    $name = !empty($cust['name']) ? $cust['name'] : 'Doador Solidário';
    $email = !empty($cust['email']) ? $cust['email'] : 'doador@amorvivo.online';
    $phone = !empty($cust['phone']) ? preg_replace('/\D/', '', $cust['phone']) : '11999998888';
    $doc = !empty($cust['document']) ? preg_replace('/\D/', '', $cust['document']) : '12345678901';
    if (strlen($doc) < 11) { $doc = '12345678901'; }

    $payload = [
        'amount' => $amount,
        'description' => $desc,
        'reference' => $ref,
        'source' => 'api_externa',
        'customer' => [
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'document' => $doc
        ]
    ];

    $ch = curl_init("$baseUrl/api/v1/transaction");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "X-API-Key: $apiKey",
        "Content-Type: application/json"
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    http_response_code($httpCode ? $httpCode : 200);
    echo $response;
    exit;
}

if ($action === 'status') {
    $id = isset($_GET['id']) ? urlencode($_GET['id']) : '';
    if (!$id) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "ID ausente"]);
        exit;
    }
    
    $ch = curl_init("$baseUrl/api/v1/query?action=get_transaction&id=$id");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "X-API-Key: $apiKey"
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    http_response_code($httpCode ? $httpCode : 200);
    echo $response;
    exit;
}

http_response_code(400);
echo json_encode(["status" => "error", "message" => "Ação inválida"]);
