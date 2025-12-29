# 标点程序审核系统

这是一个用于审核医学图像标点文件的服务器端应用程序。该系统可以自动扫描指定目录中的图像和标注文件，并提供Web界面供用户审核这些标点数据。

## 项目结构

```
server/
├── server.js              # 主服务器文件
├── package.json           # 项目依赖配置
├── README.md              # 项目说明文档
└── public/                # 前端静态资源目录
    ├── index.html         # 主页面
    ├── styles.css         # 样式文件
    └── script.js          # 前端交互逻辑
```

## 功能特性

1. **自动文件扫描**：系统会定期扫描指定的数据目录，查找新的图像和标注文件。
2. **Web界面审核**：提供直观的Web界面用于查看和审核标点数据。
3. **图像显示**：支持显示医学图像文件（如JPG格式）。
4. **标点渲染**：在图像上渲染标注点，支持交互式高亮显示。
5. **审核操作**：支持对标点数据进行通过或拒绝操作。
6. **状态跟踪**：跟踪每个文件的审核状态。

## 技术栈

- 后端：Node.js + Express
- 前端：HTML5, CSS3, JavaScript (ES6+)
- 数据存储：文件系统（JSON格式存储标注信息）

## 安装和运行

1. 确保已安装Node.js环境
2. 进入server目录：`cd server`
3. 安装依赖：`npm install`
4. 启动服务器：`node server.js`
5. 在浏览器中访问：`http://localhost:3000`

## API接口

- `GET /api/files` - 获取所有扫描到的文件列表
- `GET /api/image/:patientId/:fileName` - 获取指定图像文件
- `GET /api/annotation/:patientId/:fileName` - 获取指定标注文件
- `POST /api/approve/:patientId/:fileName` - 批准指定的标注文件
- `POST /api/reject/:patientId/:fileName` - 拒绝指定的标注文件

## 数据目录结构

```
data/
└── P001/                 # 病人ID目录
    ├── phase1_angle1.jpg # 医学图像文件
    ├── phase1_angle1.json # 对应的标注文件
    ├── phase2_angle1.jpg
    └── phase2_angle1.json
```

## 开发说明

1. 前端代码位于`public/`目录下
2. 后端API接口在`server.js`中定义
3. 文件扫描逻辑也在`server.js`中实现
4. 标注点渲染逻辑在`public/script.js`中实现

## 注意事项

1. 确保数据目录具有正确的读写权限
2. 图像文件和对应的JSON标注文件需要在同一目录下
3. 系统默认每5分钟扫描一次数据目录