const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { existsSync, readdirSync, statSync } = require('fs');
const crypto = require('crypto');

// 创建日志记录函数
function logInfo(message) {
  console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
}

function logError(message, error) {
  console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
}

function logWarn(message) {
  console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
}

const app = express();
const PORT = process.env.PORT || 3000;

// 用户数据存储
let USERS = [];

// 存储活跃的token
const activeTokens = new Map();

// 用户数据文件路径
const USERS_FILE = path.join(__dirname, 'users.json');

// 从文件加载用户数据
async function loadUsers() {
  try {
    if (!existsSync(USERS_FILE)) {
      logWarn('用户数据文件不存在，使用默认用户');
      USERS = [
        {
          id: 1,
          username: 'admin',
          password: 'admin123',
          name: '管理员',
          role: 'admin'
        },
        {
          id: 2,
          username: 'auditor1',
          password: 'audit123',
          name: '审核员1',
          role: 'auditor'
        },
        {
          id: 3,
          username: 'auditor2',
          password: 'audit123',
          name: '审核员2',
          role: 'auditor'
        }
      ];
      return;
    }

    const data = await fs.readFile(USERS_FILE, 'utf8');
    const userConfig = JSON.parse(data);
    USERS = userConfig.users || [];
    logInfo(`成功加载 ${USERS.length} 个用户`);
  } catch (err) {
    logError('加载用户数据失败:', err);
    USERS = [];
  }
}

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 认证中间件 - 验证token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const userData = activeTokens.get(token);
  if (!userData) {
    return res.status(403).json({ error: '无效或过期的令牌' });
  }

  req.user = userData;
  next();
}

// 生成随机token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 登录API
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    // 验证输入
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }

    // 查找用户
    const user = USERS.find(u => u.username === username && u.password === password);

    if (!user) {
      logWarn(`登录失败: 用户名或密码错误 - ${username}`);
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    // 生成token
    const token = generateToken();
    
    // 存储token和用户信息
    activeTokens.set(token, {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      loginAt: new Date().toISOString()
    });

    logInfo(`用户 ${user.username} (${user.name}) 登录成功`);

    // 返回成功响应
    res.json({
      success: true,
      message: '登录成功',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    logError('登录处理失败:', err);
    res.status(500).json({ success: false, message: '服务器错误，请稍后重试' });
  }
});

// 登出API
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      activeTokens.delete(token);
      logInfo(`用户 ${req.user.username} 登出成功`);
    }

    res.json({ success: true, message: '登出成功' });
  } catch (err) {
    logError('登出处理失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 验证token API
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role
    }
  });
});

// 获取当前用户信息API
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role
    }
  });
});

// 重新加载用户数据API（仅管理员可用）
app.post('/api/admin/reload-users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '权限不足' });
  }

  loadUsers().then(() => {
    res.json({ success: true, message: '用户数据已重新加载' });
  }).catch(err => {
    logError('重新加载用户数据失败:', err);
    res.status(500).json({ success: false, message: '重新加载用户数据失败' });
  });
});

// 数据存储路径
const DATA_DIR = path.join(__dirname, '..', 'data');

// 支持的图像文件扩展名
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff'];

// 扫描间隔时间（毫秒）- 默认5分钟
const SCAN_INTERVAL = process.env.SCAN_INTERVAL || 300000;

// 存储扫描到的文件信息
let scannedFiles = {};

// 确保数据目录存在
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    logInfo('数据目录已创建或已存在: ' + DATA_DIR);
  } catch (err) {
    logError('创建数据目录失败:', err);
  }
}

// 扫描数据目录中的文件
async function scanDataDirectory() {
  try {
    logInfo('开始扫描数据目录...');
    
    // 重置扫描结果
    scannedFiles = {};
    
    // 检查数据目录是否存在
    if (!existsSync(DATA_DIR)) {
      logWarn('数据目录不存在: ' + DATA_DIR);
      return;
    }
    
    // 读取数据目录中的所有项目
    const items = readdirSync(DATA_DIR);
    
    for (const item of items) {
      const itemPath = path.join(DATA_DIR, item);
      let stat;
      
      try {
        stat = statSync(itemPath);
      } catch (err) {
        logError(`获取文件状态失败: ${itemPath}`, err);
        continue;
      }
      
      // 处理目录（病人ID目录）
      if (stat.isDirectory()) {
        const patientId = item;
        scannedFiles[patientId] = {
          patientId: patientId,
          files: []
        };
        
        // 读取病人目录中的文件
        let files;
        try {
          files = readdirSync(itemPath);
        } catch (err) {
          logError(`读取目录失败: ${itemPath}`, err);
          continue;
        }
        
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        
        for (const jsonFile of jsonFiles) {
          const filePath = path.join(itemPath, jsonFile);
          let fileStat;
          
          try {
            fileStat = statSync(filePath);
          } catch (err) {
            logError(`获取文件状态失败: ${filePath}`, err);
            continue;
          }
          
          scannedFiles[patientId].files.push({
            fileName: jsonFile,
            filePath: filePath,
            lastModified: fileStat.mtime.toISOString()
          });
        }
        
        logInfo(`病人 ${patientId} 找到 ${scannedFiles[patientId].files.length} 个标注文件`);
      }
      // 处理直接的 .json 文件
      else if (stat.isFile() && item.endsWith('.json')) {
        // 从文件名中提取病人ID（第一个下划线之前的部分）
        const fileNameWithoutExt = item.replace(/\.json$/i, '');
        const underscoreIndex = fileNameWithoutExt.indexOf('_');
        
        let patientId;
        if (underscoreIndex > 0) {
          patientId = fileNameWithoutExt.substring(0, underscoreIndex);
        } else {
          // 如果没有下划线，使用整个文件名（不含扩展名）作为病人ID
          patientId = fileNameWithoutExt;
        }
        
        // 如果病人ID不存在于扫描结果中，则创建
        if (!scannedFiles[patientId]) {
          scannedFiles[patientId] = {
            patientId: patientId,
            files: []
          };
        }
        
        // 添加文件到病人列表
        scannedFiles[patientId].files.push({
          fileName: item,
          filePath: itemPath,
          lastModified: stat.mtime.toISOString()
        });
      }
    }
    
    // 统计每个病人的文件数量
    const patientStats = {};
    for (const patientId in scannedFiles) {
      patientStats[patientId] = scannedFiles[patientId].files.length;
    }
    
    logInfo('数据目录扫描完成，共找到 ' + Object.keys(scannedFiles).length + ' 个病人');
    logInfo('病人文件统计: ' + JSON.stringify(patientStats));
  } catch (err) {
    logError('扫描数据目录时出错:', err);
  }
}

// 启动定时扫描
function startScheduledScanning() {
  logInfo(`启动定时扫描，间隔: ${SCAN_INTERVAL}ms`);
  
  // 立即执行一次扫描
  scanDataDirectory();
  
  // 定时执行扫描
  setInterval(() => {
    scanDataDirectory();
  }, SCAN_INTERVAL);
}

// 获取所有病历号
app.get('/api/patients', authenticateToken, async (req, res) => {
  try {
    // 返回扫描到的病人列表
    const patients = Object.keys(scannedFiles);
    res.json({ patients });
  } catch (err) {
    logError('获取病历号列表失败:', err);
    res.status(500).json({ error: '获取病历号列表失败' });
  }
});

// 获取特定病人的所有标注文件
app.get('/api/patients/:patientId/files', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    
    // 从扫描结果中获取病人文件
    if (!scannedFiles[patientId]) {
      return res.status(404).json({ error: '病人不存在' });
    }
    
    const files = scannedFiles[patientId].files.map(file => file.fileName);
    res.json({ files: files });
  } catch (err) {
    logError('获取标注文件列表失败:', err);
    res.status(500).json({ error: '获取标注文件列表失败' });
  }
});

// 获取特定标注文件的内容
app.get('/api/patients/:patientId/files/:fileName', authenticateToken, async (req, res) => {
  try {
    const { patientId, fileName } = req.params;
    
    // 从扫描结果中查找文件路径
    if (!scannedFiles[patientId]) {
      return res.status(404).json({ error: '病人不存在' });
    }
    
    const patientFiles = scannedFiles[patientId].files;
    const file = patientFiles.find(f => f.fileName === fileName);
    
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    const data = await fs.readFile(file.filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    res.json({ data: jsonData });
  } catch (err) {
    logError('读取标注文件失败:', err);
    res.status(500).json({ error: '读取标注文件失败' });
  }
});

// 审核标注文件
app.post('/api/patients/:patientId/files/:fileName/audit', authenticateToken, async (req, res) => {
  try {
    const { patientId, fileName } = req.params;
    const { approved, comments } = req.body;
    
    // 从扫描结果中查找文件路径
    if (!scannedFiles[patientId]) {
      return res.status(404).json({ error: '病人不存在' });
    }
    
    const patientFiles = scannedFiles[patientId].files;
    const file = patientFiles.find(f => f.fileName === fileName);
    
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    // 读取现有数据
    const data = await fs.readFile(file.filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    // 添加审核信息 - 使用当前登录用户的信息
    jsonData.audit = {
      approved,
      comments: comments || '',
      auditedAt: new Date().toISOString(),
      auditor: req.user.name, // 使用登录用户的姓名
      auditorId: req.user.id,
      auditorUsername: req.user.username
    };
    
    // 保存更新后的数据
    await fs.writeFile(file.filePath, JSON.stringify(jsonData, null, 2));
    
    // 更新扫描缓存中的文件信息
    const fileStat = statSync(file.filePath);
    file.lastModified = fileStat.mtime.toISOString();
    
    logInfo(`文件 ${patientId}/${fileName} 已被 ${req.user.name} 审核`);
    res.json({ message: '审核信息已保存', data: jsonData });
  } catch (err) {
    logError('保存审核信息失败:', err);
    res.status(500).json({ error: '保存审核信息失败' });
  }
});

// 提供图像文件服务
app.get('/api/patients/:patientId/images/:imageName', authenticateToken, (req, res) => {
  try {
    const { patientId, imageName } = req.params;
    
    // 验证图像文件扩展名
    const ext = path.extname(imageName).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      return res.status(400).json({ error: '不支持的图像格式' });
    }
    
    // 构造图像文件路径（直接在data目录中查找）
    const imagePath = path.join(DATA_DIR, imageName);
    
    // 检查文件是否存在
    if (!existsSync(imagePath)) {
      return res.status(404).json({ error: '图像文件不存在' });
    }
    
    // 发送图像文件
    res.sendFile(imagePath);
  } catch (err) {
    logError('提供图像文件时出错:', err);
    res.status(500).json({ error: '无法提供图像文件' });
  }
});

// 获取审核统计信息
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    let totalPatients = Object.keys(scannedFiles).length;
    let totalFiles = 0;
    let approvedFiles = 0;
    let pendingFiles = 0;
    
    // 遍历扫描到的所有文件
    for (const patientId in scannedFiles) {
      const patient = scannedFiles[patientId];
      const jsonFiles = patient.files;
      
      totalFiles += jsonFiles.length;
      
      for (const fileObj of jsonFiles) {
        try {
          const data = await fs.readFile(fileObj.filePath, 'utf8');
          const jsonData = JSON.parse(data);
          
          if (jsonData.audit && jsonData.audit.approved !== undefined) {
            approvedFiles++;
          } else {
            pendingFiles++;
          }
        } catch (err) {
          logError(`读取文件失败: ${fileObj.filePath}`, err);
          pendingFiles++;
        }
      }
    }
    
    res.json({
      totalPatients,
      totalFiles,
      approvedFiles,
      pendingFiles,
      approvalRate: totalFiles > 0 ? (approvedFiles / totalFiles * 100).toFixed(2) : 0
    });
  } catch (err) {
    logError('获取统计信息失败:', err);
    res.status(500).json({ error: '获取统计信息失败' });
  }
});

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
app.listen(PORT, async () => {
  logInfo(`服务器运行在端口 ${PORT}`);
  
  // 加载用户数据
  await loadUsers();
  
  ensureDataDir();
  startScheduledScanning();
});