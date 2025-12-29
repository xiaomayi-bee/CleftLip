<?php
// 后端验证登录状态（优先于前端执行）
if (!isset($_COOKIE['isLogin']) || $_COOKIE['isLogin'] !== '1') {
    header('Location: login.html'); // 未登录跳回登录页
    exit; // 终止脚本执行
}

// 基础配置（复用原有配置）
$uploadDir = __DIR__ . '/uploads/未标记病例/';
$allowedExts = ['jpg', 'png', 'jpeg'];
$maxSize = 10 * 1024 * 1024;

// 创建上传目录（如果不存在）
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// ===================== 新增：查看已上传文件功能 =====================
/**
 * 递归遍历目录，获取所有文件信息
 * @param string $dir 目标目录
 * @param string $baseDir 基础目录（用于计算相对路径）
 * @return array 文件列表
 */
function scanUploadedFiles($dir, $baseDir) {
    $fileList = [];
    $items = scandir($dir);
    
    foreach ($items as $item) {
        // 跳过.和..
        if ($item === '.' || $item === '..') continue;
        
        $fullPath = $dir . '/' . $item;
        // 计算相对路径（相对于未标记病例目录）
        $relativePath = str_replace($baseDir . '/', '', $fullPath);
        
        if (is_dir($fullPath)) {
            // 递归遍历子目录
            $fileList = array_merge($fileList, scanUploadedFiles($fullPath, $baseDir));
        } else {
            // 获取文件信息
            $fileExt = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
            // 只显示图片文件（和上传允许的类型一致）
            if (in_array($fileExt, ['jpg', 'png', 'jpeg'])) {
                $fileList[] = [
                    'name' => $item, // 文件名
                    'relative_path' => $relativePath, // 相对路径（前端可用于访问）
                    'size' => filesize($fullPath), // 文件大小（字节）
                    'size_formatted' => formatFileSize(filesize($fullPath)), // 格式化后的大小（如1.5MB）
                    'modify_time' => date('Y-m-d H:i:s', filemtime($fullPath)), // 最后修改时间
                    'ext' => $fileExt // 文件扩展名
                ];
            }
        }
    }
    return $fileList;
}

/**
 * 格式化文件大小（字节转KB/MB/GB）
 * @param int $size 字节数
 * @return string 格式化后的大小
 */
function formatFileSize($size) {
    $units = ['B', 'KB', 'MB', 'GB'];
    $unitIndex = 0;
    while ($size >= 1024 && $unitIndex < 3) {
        $size /= 1024;
        $unitIndex++;
    }
    return round($size, 2) . ' ' . $units[$unitIndex];
}

// 处理查看文件请求（URL参数：action=list）
if (isset($_GET['action']) && $_GET['action'] === 'list') {
    header('Content-Type: application/json; charset=utf-8');
    $fileList = scanUploadedFiles($uploadDir, $uploadDir);
    echo json_encode([
        'code' => 200,
        'msg' => '获取文件列表成功',
        'data' => $fileList,
        'total' => count($fileList)
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
// ===================== 查看文件功能结束 =====================

// ===================== 原有上传逻辑（保持不变） =====================
// 检查是否有文件上传
if (!isset($_FILES['uploadFile'])) {
    echo '错误：未选择文件';
    exit;
}

$file = $_FILES['uploadFile'];
$fileName = $file['name'];
$fileTmp = $file['tmp_name'];
$fileSize = $file['size'];
$fileExt = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

// 检查文件大小
if ($fileSize > $maxSize) {
    echo '错误：文件超过10MB限制';
    exit;
}

// 检查文件类型
if (!in_array($fileExt, $allowedExts)) {
    echo '错误：不支持的文件类型';
    exit;
}

// 处理文件夹路径（保留原文件夹结构）
$relativePath = $_POST['relativePath'] ?? $fileName;
// 替换路径分隔符，创建子目录
$subDir = dirname($relativePath);
if ($subDir !== '.') {
    $fullSubDir = $uploadDir . $subDir;
    if (!is_dir($fullSubDir)) {
        mkdir($fullSubDir, 0755, true);
    }
    $savePath = $fullSubDir . '/' . basename($fileName);
} else {
    // 单文件直接保存
    $uniqueName = uniqid() . '_' . $fileName;
    $savePath = $uploadDir . $uniqueName;
}

// 保存文件
if (move_uploaded_file($fileTmp, $savePath)) {
    // 修改文件权限（避免无法访问）
    chmod($savePath, 0644);
    echo '上传成功：' . basename($savePath);
} else {
    echo '错误：文件保存失败，请检查uploads文件夹权限';
}
?>