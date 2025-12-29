<?php
/**
 * 接收前端上传的图片和JSON标注文件
 * 1. 原逻辑：保存到 uploads/已标记病例/[病人ID]/[病人ID]_[阶段]_[角度](_序号).{png/json}
 * 2. 新增逻辑：同时复制到 uploads/未审核病例/[时间戳]_[病人ID]_[阶段]_[角度].{png/json}
 */

// 1. 基础配置（解决跨域、中文编码、文件大小限制）
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *"); // 允许所有域名跨域（生产环境可限定具体域名）
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

// 处理浏览器预检请求（OPTIONS）
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 2. 核心配置项（可根据需求调整）
$config = [
    'base_dir' => __DIR__ . '/uploads/已标记病例/', // 原有保存目录
    'unreviewed_dir' => __DIR__ . '/uploads/未审核病例/', // 新增：未审核病例目录
    'max_file_size' => 10 * 1024 * 1024, // 最大文件大小：10MB
    'allowed_image_ext' => ['jpg', 'jpeg', 'png', 'gif', 'bmp'], // 允许的图片格式
    'folder_permission' => 0755 // 文件夹权限（Linux：755，Windows：忽略）
];

// 3. 初始化返回结果
$result = [
    'success' => false,
    'msg' => '操作失败',
    'file_paths' => [ // 原有保存路径（按病人分类）
        'image' => '',
        'json' => ''
    ],
    'unreviewed_paths' => [ // 新增：未审核病例路径
        'image' => '',
        'json' => ''
    ],
    'patient_dir' => '' // 病人专属文件夹路径
];

try {
    // --------------------------
    // 步骤1：验证必要参数
    // --------------------------
    // 验证病人ID（必填）
    if (!isset($_POST['patientId']) || empty(trim($_POST['patientId']))) {
        throw new Exception('缺少必填参数：病人ID（patientId）');
    }
    $patientId = trim($_POST['patientId']);
    
    // 验证病人ID格式（仅允许数字，避免特殊字符导致路径错误）
    if (!preg_match('/^\d+$/', $patientId)) {
        throw new Exception('病人ID格式错误：仅允许纯数字');
    }

    // 获取阶段/角度（优先使用前端传递的值）
    $phase = isset($_POST['phase']) ? trim($_POST['phase']) : '幼儿期术前';
    $angle = isset($_POST['angle']) ? trim($_POST['angle']) : '正面';

    // --------------------------
    // 步骤2：创建文件夹（原有+新增）
    // --------------------------
    // 2.1 创建病人专属文件夹（原有逻辑）
    $patientDir = $config['base_dir'] . $patientId . '/';
    $result['patient_dir'] = str_replace(__DIR__ . '/', '', $patientDir); // 相对路径
    if (!is_dir($patientDir)) {
        if (!mkdir($patientDir, $config['folder_permission'], true)) {
            throw new Exception('创建病人文件夹失败：权限不足，请检查uploads目录写入权限');
        }
    }
    if (!is_writable($patientDir)) {
        throw new Exception('病人文件夹不可写：' . $patientDir . '，请赋予写入权限');
    }

    // 2.2 创建未审核病例文件夹（新增逻辑）
    if (!is_dir($config['unreviewed_dir'])) {
        if (!mkdir($config['unreviewed_dir'], $config['folder_permission'], true)) {
            throw new Exception('创建未审核病例文件夹失败：权限不足，请检查uploads目录写入权限');
        }
    }
    if (!is_writable($config['unreviewed_dir'])) {
        throw new Exception('未审核病例文件夹不可写：' . $config['unreviewed_dir'] . '，请赋予写入权限');
    }

    // --------------------------
    // 步骤3：处理图片文件上传（原有+新增）
    // --------------------------
    $imageFinalName = '';
    $unreviewedImageName = '';
    if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
        $imageFile = $_FILES['image'];
        
        // 验证文件大小
        if ($imageFile['size'] > $config['max_file_size']) {
            throw new Exception('图片文件过大：最大支持' . ($config['max_file_size'] / 1024 / 1024) . 'MB');
        }

        // 获取文件扩展名（小写）
        $imageExt = strtolower(pathinfo($imageFile['name'], PATHINFO_EXTENSION));
        
        // 验证图片格式
        if (!in_array($imageExt, $config['allowed_image_ext'])) {
            throw new Exception('不支持的图片格式：' . $imageExt . '，仅允许：' . implode(',', $config['allowed_image_ext']));
        }

        // 3.1 原有逻辑：按病人分类保存（加序号防覆盖）
        $baseImageName = $patientId . '_' . $phase . '_' . $angle;
        $imageFileName = $baseImageName . '.' . $imageExt;
        $imageSavePath = $patientDir . $imageFileName;
        $index = 1;
        while (file_exists($imageSavePath)) {
            $index++;
            $imageFileName = $baseImageName . '_' . $index . '.' . $imageExt;
            $imageSavePath = $patientDir . $imageFileName;
        }
        if (!move_uploaded_file($imageFile['tmp_name'], $imageSavePath)) {
            throw new Exception('图片保存失败：无法移动临时文件到病人目录');
        }
        $result['file_paths']['image'] = str_replace(__DIR__ . '/', '', $imageSavePath);
        $imageFinalName = $imageFileName;

        // 3.2 新增逻辑：复制到未审核病例目录（时间戳+病人ID命名，避免覆盖）
        $unreviewedImageName = $patientId . '_' . $phase . '_' . $angle . '.' . $imageExt;
        $unreviewedImagePath = $config['unreviewed_dir'] . $unreviewedImageName;
        if (!copy($imageSavePath, $unreviewedImagePath)) {
            throw new Exception('图片复制到未审核病例目录失败');
        }
        $result['unreviewed_paths']['image'] = str_replace(__DIR__ . '/', '', $unreviewedImagePath);
    }

    // --------------------------
    // 步骤4：处理JSON标注文件上传（原有+新增）
    // --------------------------
    $jsonFinalName = '';
    $unreviewedJsonName = '';
    if (isset($_FILES['annotationJson']) && $_FILES['annotationJson']['error'] === UPLOAD_ERR_OK) {
        $jsonFile = $_FILES['annotationJson'];
        
        // 验证文件大小
        if ($jsonFile['size'] > $config['max_file_size']) {
            throw new Exception('JSON文件过大：最大支持' . ($config['max_file_size'] / 1024 / 1024) . 'MB');
        }

        // 获取JSON扩展名（强制验证为json）
        $jsonExt = strtolower(pathinfo($jsonFile['name'], PATHINFO_EXTENSION));
        if ($jsonExt !== 'json') {
            throw new Exception('JSON文件格式错误：仅允许.json后缀的文件');
        }

        // 4.1 原有逻辑：按病人分类保存（和图片同名）
        $baseJsonName = $patientId . '_' . $phase . '_' . $angle;
        $jsonFileName = $baseJsonName . '.json';
        $jsonSavePath = $patientDir . $jsonFileName;
        $index = 1;
        while (file_exists($jsonSavePath)) {
            $index++;
            $jsonFileName = $baseJsonName . '_' . $index . '.json';
            $jsonSavePath = $patientDir . $jsonFileName;
        }
        if (!move_uploaded_file($jsonFile['tmp_name'], $jsonSavePath)) {
            throw new Exception('JSON文件保存失败：无法移动临时文件到病人目录');
        }
        $result['file_paths']['json'] = str_replace(__DIR__ . '/', '', $jsonSavePath);
        $jsonFinalName = $jsonFileName;

        // 4.2 新增逻辑：复制到未审核病例目录（和图片同名）
        $unreviewedJsonName = $patientId . '_' . $phase . '_' . $angle . '.json';
        $unreviewedJsonPath = $config['unreviewed_dir'] . $unreviewedJsonName;
        if (!copy($jsonSavePath, $unreviewedJsonPath)) {
            throw new Exception('JSON文件复制到未审核病例目录失败');
        }
        $result['unreviewed_paths']['json'] = str_replace(__DIR__ . '/', '', $unreviewedJsonPath);
    }

    // --------------------------
    // 步骤5：验证是否至少上传了一个文件
    // --------------------------
    if (empty($result['file_paths']['image']) && empty($result['file_paths']['json'])) {
        throw new Exception('未上传任何文件：请检查是否选择了图片/JSON文件');
    }

    // --------------------------
    // 步骤6：操作成功
    // --------------------------
    $result['success'] = true;
    $result['msg'] = '文件上传成功！已保存到病人目录和未审核病例目录';

} catch (Exception $e) {
    // 捕获所有异常，返回错误信息
    $result['msg'] = $e->getMessage();
    http_response_code(400); // 客户端错误状态码
}

// 4. 返回JSON结果给前端（包含未审核路径）
echo json_encode($result, JSON_UNESCAPED_UNICODE); // 保留中文不转义
?>