<?php
// 后端登录验证接口（示例）
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *"); // 允许跨域（测试用，正式环境需限制域名）

// 获取前端传递的账号密码
$username = $_POST['username'] ?? '';
$password = $_POST['password'] ?? '';

// 模拟数据库验证（实际需连接数据库查询）
$validUser = 'admin';   // 正确用户名
$validPwd = '123456';   // 正确密码

if ($username === $validUser && $password === $validPwd) {
    // 登录成功
    echo json_encode(['code' => 200, 'msg' => '登录成功']);
} else {
    // 登录失败
    echo json_encode(['code' => 400, 'msg' => '用户名或密码错误']);
}
?>