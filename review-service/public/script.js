// 日志记录函数
function logInfo(message) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
}

function logError(message, error) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
}

function logWarn(message) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
}

// 认证相关函数
function getAuthToken() {
    return localStorage.getItem('authToken');
}

function getCurrentUser() {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
}

function isAuthenticated() {
    return !!getAuthToken();
}

// 带认证的fetch请求
async function authenticatedFetch(url, options = {}) {
    const token = getAuthToken();
    if (!token) {
        throw new Error('未登录');
    }

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };

    let response;
    try {
        response = await fetch(url, { ...options, headers });
    } catch (networkError) {
        if (networkError.name === 'TypeError' && networkError.message.includes('fetch')) {
            throw new Error('网络连接失败，请检查网络连接');
        }
        throw networkError;
    }

    if (response.status === 401 || response.status === 403) {
        logout();
        throw new Error('认证失败，请重新登录');
    }

    if (response.status >= 500) {
        throw new Error('服务器错误，请稍后重试');
    }

    return response;
}

// 登出
function logout() {
    logInfo('用户登出');
    
    // 清除本地存储
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    
    // 跳转到登录页面
    window.location.href = '/login.html';
}

// 全局变量
let currentPatientId = null;
let currentFileName = null;
let currentAnnotationData = null;

// 图片缩放和平移相关变量 - 与Marking系统保持一致
let currentScale = 1;
let currentOffsetX = 0;
let currentOffsetY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let lastMouseX = 0;
let lastMouseY = 0;

// 防抖定时器
let resizeTimeout = null;

// 标点显示模式：'fullName' | 'number' | 'pointOnly'
let pointDisplayMode = 'fullName';

// 渲染配置 - 与Marking系统保持一致
const RENDER_CONFIG = {
    pointRadius: 6,
    pointColor: 'rgba(52, 152, 219, 1)',
    pointStrokeColor: '#ffffff',
    pointStrokeWidth: 2,
    labelColor: '#000000',
    labelFont: '12px Arial',
    highlightColor: '#e74c3c',
    selectionColor: 'rgba(0, 255, 0, 0.7)',
    scaleStep: 0.1,
    maxScale: 10,
    minScale: 0.1
};

// DOM元素
const annotationFileListEl = document.getElementById('annotationFileList');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const sortSelect = document.getElementById('sortSelect');
const refreshBtn = document.getElementById('refreshBtn');
const logoutBtn = document.getElementById('logoutBtn');
const approveBtn = document.getElementById('approveBtn');
const rejectBtn = document.getElementById('rejectBtn');
const patientIdDisplay = document.getElementById('patientIdDisplay');
const phaseDisplay = document.getElementById('phaseDisplay');
const angleDisplay = document.getElementById('angleDisplay');
const currentUserNameEl = document.getElementById('currentUserName');
const imagePreview = document.getElementById('imagePreview');
const overlayCanvas = document.getElementById('overlayCanvas');
const noImageMessage = document.getElementById('noImageMessage');
const pointsTableBody = document.getElementById('pointsTableBody');
const commentsTextarea = document.getElementById('commentsTextarea');
const auditHistory = document.getElementById('auditHistory');

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    try {
        logInfo('应用初始化开始');
        
        // 检查登录状态
        if (!isAuthenticated()) {
            logWarn('用户未登录，跳转到登录页面');
            window.location.href = '/login.html';
            return;
        }
        
        // 显示当前用户信息
        const currentUser = getCurrentUser();
        if (currentUser) {
            currentUserNameEl.textContent = currentUser.name;
            logInfo(`当前用户: ${currentUser.name} (${currentUser.username})`);
        }
        
        // 绑定事件监听器
        bindEventListeners();
        
        // 加载初始数据
        loadAllAnnotationFiles();
        logInfo('应用初始化完成');
    } catch (error) {
        logError('应用初始化时出错:', error);
        alert('应用初始化失败: ' + error.message);
    }
});

// 绑定事件监听器
function bindEventListeners() {
    try {
        refreshBtn.addEventListener('click', loadAllAnnotationFiles);
        logoutBtn.addEventListener('click', handleLogout);
        approveBtn.addEventListener('click', () => auditFile(true));
        rejectBtn.addEventListener('click', () => auditFile(false));
        
        // 搜索、筛选和排序控件
        searchInput.addEventListener('input', renderAnnotationFileList);
        statusFilter.addEventListener('change', renderAnnotationFileList);
        sortSelect.addEventListener('change', renderAnnotationFileList);
        
        // 标点显示模式切换
        document.getElementById('displayFullNameBtn').addEventListener('click', () => setPointDisplayMode('fullName'));
        document.getElementById('displayNumberBtn').addEventListener('click', () => setPointDisplayMode('number'));
        document.getElementById('displayPointOnlyBtn').addEventListener('click', () => setPointDisplayMode('pointOnly'));
        
        // 缩放控制按钮
        document.getElementById('zoomInBtn').addEventListener('click', zoomIn);
        document.getElementById('zoomOutBtn').addEventListener('click', zoomOut);
        
        // 鼠标滚轮缩放事件 - 直接绑定到canvas
        overlayCanvas.addEventListener('wheel', handleZoom);
        
        // 鼠标拖拽事件 - 直接绑定到canvas
        overlayCanvas.addEventListener('mousedown', startDrag);
        overlayCanvas.addEventListener('mousemove', handleDrag);
        overlayCanvas.addEventListener('mouseup', endDrag);
        overlayCanvas.addEventListener('mouseleave', endDrag);
        
        // 设置初始光标样式
        overlayCanvas.style.cursor = 'grab';
        
        // 监听窗口大小改变事件 - 使用防抖优化
        window.addEventListener('resize', () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            resizeTimeout = setTimeout(() => {
                updateCanvasSize();
                drawImage();
            }, 100);
        });
        
        logInfo('事件监听器绑定成功');
    } catch (error) {
        logError('绑定事件监听器时出错:', error);
    }
}

// 全局变量存储所有标注文件
let allAnnotationFiles = [];
let currentSelectedFile = null;

// 加载所有标注文件
async function loadAllAnnotationFiles() {
    try {
        logInfo('正在加载所有标注文件...');
        const response = await authenticatedFetch('/api/patients');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.patients) {
            allAnnotationFiles = [];
            
            for (const patientId of data.patients) {
                const filesResponse = await authenticatedFetch(`/api/patients/${patientId}/files`);
                if (filesResponse.ok) {
                    const filesData = await filesResponse.json();
                    if (filesData.files) {
                        for (const fileName of filesData.files) {
                            const fileResponse = await authenticatedFetch(`/api/patients/${patientId}/files/${encodeURIComponent(fileName)}`);
                            if (fileResponse.ok) {
                                const fileData = await fileResponse.json();
                                const auditStatus = getAuditStatus(fileData.audit);
                                
                                allAnnotationFiles.push({
                                    patientId: patientId,
                                    fileName: fileName,
                                    auditStatus: auditStatus,
                                    auditData: fileData.audit || [],
                                    patientInfo: fileData.patient_info || {},
                                    uploadTime: fileData.upload_time || new Date().toISOString(),
                                    fileSize: fileData.file_size || 0
                                });
                            }
                        }
                    }
                }
            }
            
            logInfo(`成功加载 ${allAnnotationFiles.length} 个标注文件`);
            renderAnnotationFileList();
        }
    } catch (error) {
        logError('加载标注文件列表失败:', error);
        if (error.message !== '认证失败，请重新登录') {
            alert('加载标注文件列表失败: ' + error.message);
        }
    }
}

// 获取审核状态
function getAuditStatus(auditData) {
    if (!auditData || auditData.length === 0) {
        return 'pending';
    }
    
    const latestAudit = auditData[auditData.length - 1];
    if (latestAudit.approved) {
        return 'approved';
    } else {
        return 'rejected';
    }
}

// 渲染标注文件列表
function renderAnnotationFileList() {
    try {
        annotationFileListEl.innerHTML = '';
        
        // 获取筛选和排序参数
        const searchTerm = searchInput.value.toLowerCase();
        const statusFilterValue = statusFilter.value;
        const sortValue = sortSelect.value;
        
        // 筛选文件
        let filteredFiles = allAnnotationFiles.filter(file => {
            const matchesSearch = file.fileName.toLowerCase().includes(searchTerm) || 
                                  file.patientId.toLowerCase().includes(searchTerm);
            const matchesStatus = statusFilterValue === 'all' || file.auditStatus === statusFilterValue;
            return matchesSearch && matchesStatus;
        });
        
        // 排序文件
        filteredFiles.sort((a, b) => {
            switch (sortValue) {
                case 'name-asc':
                    return a.fileName.localeCompare(b.fileName);
                case 'name-desc':
                    return b.fileName.localeCompare(a.fileName);
                case 'date-desc':
                    return new Date(b.uploadTime) - new Date(a.uploadTime);
                case 'date-asc':
                    return new Date(a.uploadTime) - new Date(b.uploadTime);
                case 'size-desc':
                    return b.fileSize - a.fileSize;
                case 'size-asc':
                    return a.fileSize - b.fileSize;
                default:
                    return 0;
            }
        });
        
        if (filteredFiles.length === 0) {
            const li = document.createElement('li');
            li.textContent = '暂无标注文件';
            li.classList.add('empty-message');
            annotationFileListEl.appendChild(li);
            return;
        }
        
        filteredFiles.forEach(file => {
            const li = document.createElement('li');
            li.classList.add('annotation-file-item');
            if (currentSelectedFile && currentSelectedFile.fileName === file.fileName && 
                currentSelectedFile.patientId === file.patientId) {
                li.classList.add('active');
            }
            
            const statusText = {
                'pending': '未审核',
                'approved': '审核通过',
                'rejected': '审核未通过'
            };
            
            const uploadDate = new Date(file.uploadTime).toLocaleString('zh-CN');
            const fileSizeKB = (file.fileSize / 1024).toFixed(2);
            
            li.innerHTML = `
                <div class="file-name">${file.fileName}</div>
                <div class="file-meta">
                    <div class="meta-row">
                        <span class="meta-label">病历号:</span>
                        <span>${file.patientId}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">上传时间:</span>
                        <span>${uploadDate}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">文件大小:</span>
                        <span>${fileSizeKB} KB</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">审核状态:</span>
                        <span class="file-status ${file.auditStatus}">${statusText[file.auditStatus]}</span>
                    </div>
                </div>
            `;
            
            li.addEventListener('click', () => selectAnnotationFile(file));
            annotationFileListEl.appendChild(li);
        });
    } catch (error) {
        logError('渲染标注文件列表时出错:', error);
        const li = document.createElement('li');
        li.textContent = '标注文件列表加载失败';
        li.classList.add('empty-message');
        annotationFileListEl.appendChild(li);
    }
}

// 选择标注文件
async function selectAnnotationFile(file) {
    try {
        currentSelectedFile = file;
        currentPatientId = file.patientId;
        currentFileName = file.fileName;
        
        logInfo(`选择标注文件: ${file.patientId}/${file.fileName}`);
        
        renderAnnotationFileList();
        
        await loadAnnotationFile(file.fileName);
    } catch (error) {
        logError('选择标注文件时出错:', error);
        alert('选择标注文件时出错: ' + error.message);
    }
}

// 加载标注文件
async function loadAnnotationFile(fileName) {
    if (!currentPatientId) {
        logWarn('未选择病人，无法加载标注文件');
        return;
    }
    
    try {
        logInfo(`正在加载标注文件 ${fileName}...`);
        const response = await authenticatedFetch(`/api/patients/${currentPatientId}/files/${encodeURIComponent(fileName)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.data) {
            currentFileName = fileName;
            currentAnnotationData = data.data;
            renderAnnotationData(data.data);
            
            logInfo('标注文件加载成功');
        }
    } catch (error) {
        logError('加载标注文件失败:', error);
        if (error.message !== '认证失败，请重新登录') {
            alert('加载标注文件失败: ' + error.message);
        }
    }
}

// 渲染标注数据
function renderAnnotationData(data) {
    try {
        // 显示病人信息
        if (data.patient_info) {
            patientIdDisplay.textContent = data.patient_info.patient_id || '-';
            phaseDisplay.textContent = data.patient_info.phase || '-';
            angleDisplay.textContent = data.patient_info.angle || '-';
        }
        
        // 显示图像预览（如果有对应的图像文件）
        displayImagePreview();
        
        // 显示标点数据
        renderPointsTable(data.points);
        
        // 显示审核历史
        renderAuditHistory(data.audit);
    } catch (error) {
        logError('渲染标注数据时出错:', error);
        alert('渲染标注数据时出错: ' + error.message);
    }
}

// 显示图像预览 - 重构为与Marking系统一致
function displayImagePreview() {
    if (!currentPatientId || !currentFileName) {
        logWarn('缺少病人ID或文件名，无法显示图像预览');
        imagePreview.style.display = 'none';
        overlayCanvas.style.display = 'none';
        noImageMessage.style.display = 'block';
        noImageMessage.textContent = '请选择一个标注文件';
        return;
    }
    
    // 构造图像文件名（与JSON文件同名，尝试多种扩展名）
    const baseName = currentFileName.replace('.json', '');
    const imageExtensions = ['.jpg', '.JPG', '.jpeg', '.JPEG', '.png', '.PNG', '.bmp', '.BMP'];
    let currentExtensionIndex = 0;
    
    async function tryLoadImage() {
        if (currentExtensionIndex >= imageExtensions.length) {
            logWarn('图像文件未找到或加载失败');
            imagePreview.style.display = 'none';
            overlayCanvas.style.display = 'none';
            noImageMessage.style.display = 'block';
            noImageMessage.textContent = '未找到对应的图像文件';
            return;
        }
        
        const imageFileName = baseName + imageExtensions[currentExtensionIndex];
        const imageUrl = `/api/patients/${encodeURIComponent(currentPatientId)}/images/${encodeURIComponent(imageFileName)}`;
        
        logInfo(`正在加载图像 (尝试 ${currentExtensionIndex + 1}/${imageExtensions.length}): ${imageUrl}`);
        
        try {
            const response = await authenticatedFetch(imageUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            
            logInfo('图像加载成功');
            imagePreview.src = objectUrl;
            imagePreview.style.display = 'none';
            noImageMessage.style.display = 'none';
            
            overlayCanvas.style.display = 'block';
            resetView();
            
            const img = new Image();
            img.onload = function() {
                window.currentImage = img;
                setTimeout(() => {
                    updateCanvasSize();
                    fitImageToCanvas();
                    renderAnnotationPoints();
                }, 100);
            };
            img.src = objectUrl;
            
        } catch (error) {
            logWarn(`图像加载失败 (${imageExtensions[currentExtensionIndex]}): ${error.message}`);
            currentExtensionIndex++;
            tryLoadImage();
        }
    }
    
    tryLoadImage();
}

// 更新canvas尺寸 - 优化版本
function updateCanvasSize() {
    const container = document.querySelector('.image-container');
    if (!container) {
        logWarn('未找到图像容器，无法更新canvas尺寸');
        return;
    }
    
    if (overlayCanvas.style.display === 'none') {
        return;
    }
    
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;
    
    if (newWidth <= 0 || newHeight <= 0) {
        logWarn('容器尺寸无效，无法更新canvas尺寸');
        return;
    }
    
    overlayCanvas.width = newWidth;
    overlayCanvas.height = newHeight;
    
    logInfo(`Canvas尺寸已更新: ${newWidth}x${newHeight}`);
}

// 智能适配图像以适应画布 - 与Marking系统保持一致
function fitImageToCanvas() {
    const image = window.currentImage;
    if (!image || !overlayCanvas) return;
    
    // 1. 获取图片原始长宽比
    const imageAspectRatio = image.width / image.height;
    
    // 2. 获取画布显示区域长宽比
    const canvasAspectRatio = overlayCanvas.width / overlayCanvas.height;
    
    // 3. 智能适配算法：基于双长宽比进行适配
    if (imageAspectRatio > canvasAspectRatio) {
        // 图片比画布更宽，按宽度适配
        currentScale = overlayCanvas.width / image.width;
    } else {
        // 图片比画布更高，按高度适配
        currentScale = overlayCanvas.height / image.height;
    }
    
    // 4. 处理边缘情况：当图片尺寸小于显示区域时居中显示
    const scaledWidth = image.width * currentScale;
    const scaledHeight = image.height * currentScale;
    
    if (scaledWidth < overlayCanvas.width && scaledHeight < overlayCanvas.height) {
        // 图片尺寸小于画布，居中显示
        currentOffsetX = (overlayCanvas.width - scaledWidth) / 2;
        currentOffsetY = (overlayCanvas.height - scaledHeight) / 2;
    } else {
        // 图片尺寸大于画布，按比例缩小至完全可见
        currentOffsetX = 0;
        currentOffsetY = 0;
    }
    
    // 5. 确保适配逻辑在不同尺寸设备上正常工作
    // 限制最小缩放比例，避免图片过小看不清
    const minScale = Math.min(0.1, Math.min(overlayCanvas.width / image.width, overlayCanvas.height / image.height));
    currentScale = Math.max(currentScale, minScale);
    
    // 6. 重绘图像和标注点
    drawImage();
}

// 绘制图像和标注点 - 与Marking系统保持一致
function drawImage() {
    const image = window.currentImage;
    if (!image) return;
    
    const ctx = overlayCanvas.getContext('2d');
    
    // 清空Canvas
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    // 计算图像绘制位置和大小
    const imgWidth = image.width * currentScale;
    const imgHeight = image.height * currentScale;
    const x = (overlayCanvas.width - imgWidth) / 2 + currentOffsetX;
    const y = (overlayCanvas.height - imgHeight) / 2 + currentOffsetY;
    
    // 绘制图像
    ctx.drawImage(image, x, y, imgWidth, imgHeight);
    
    // 绘制标点
    drawPoints();
}

// 绘制标点 - 与Marking系统保持一致
function drawPoints() {
    const image = window.currentImage;
    if (!image || !currentAnnotationData || !currentAnnotationData.points) return;
    
    const ctx = overlayCanvas.getContext('2d');
    
    const imgWidth = image.width * currentScale;
    const imgHeight = image.height * currentScale;
    const x = (overlayCanvas.width - imgWidth) / 2 + currentOffsetX;
    const y = (overlayCanvas.height - imgHeight) / 2 + currentOffsetY;
    
    currentAnnotationData.points.forEach((point, index) => {
        // 只绘制存在的点
        if (!point.exists) {
            return;
        }
        
        // 检查坐标是否有效（不是-1,-1）
        if (point.x === -1 && point.y === -1) {
            return;
        }
        
        // 计算标点在Canvas上的位置 - 与Marking系统一致
        const canvasX = x + point.x * currentScale;
        const canvasY = y + point.y * currentScale;
        
        // 设置绘制样式
        ctx.fillStyle = RENDER_CONFIG.pointColor;
        ctx.strokeStyle = RENDER_CONFIG.pointStrokeColor;
        ctx.lineWidth = RENDER_CONFIG.pointStrokeWidth;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        // 绘制标点
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, RENDER_CONFIG.pointRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // 绘制标点标签 - 根据显示模式决定
        const labelText = getPointDisplayText(point, index);
        if (labelText) {
            ctx.fillStyle = RENDER_CONFIG.labelColor;
            ctx.font = RENDER_CONFIG.labelFont;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(labelText, canvasX + 10, canvasY - 15);
        }
    });
}

// 设置标点显示模式
function setPointDisplayMode(mode) {
    pointDisplayMode = mode;
    
    // 更新按钮状态
    document.querySelectorAll('.display-mode-btn').forEach(btn => {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-secondary');
    });
    
    const activeBtn = document.getElementById(`display${mode.charAt(0).toUpperCase() + mode.slice(1)}Btn`);
    if (activeBtn) {
        activeBtn.classList.remove('btn-secondary');
        activeBtn.classList.add('btn-primary', 'active');
    }
    
    // 重绘画布
    drawImage();
}

// 获取标点显示文本
function getPointDisplayText(point, index) {
    switch (pointDisplayMode) {
        case 'fullName':
            return point.name;
        case 'number':
            return `#${index + 1}`;
        case 'pointOnly':
            return '';
        default:
            return point.name;
    }
}

// 渲染标点表格
function renderPointsTable(points) {
    try {
        pointsTableBody.innerHTML = '';
        
        if (!points || points.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 4;
            td.textContent = '暂无标点数据';
            td.style.textAlign = 'center';
            tr.appendChild(td);
            pointsTableBody.appendChild(tr);
            return;
        }
        
        points.forEach((point, index) => {
            const tr = document.createElement('tr');
            
            // 标点名称
            const nameTd = document.createElement('td');
            nameTd.textContent = point.name || '-';
            tr.appendChild(nameTd);
            
            // 存在状态
            const existsTd = document.createElement('td');
            existsTd.textContent = point.exists ? '是' : '否';
            if (!point.exists) {
                tr.classList.add('point-not-exists');
            }
            tr.appendChild(existsTd);
            
            // X坐标
            const xTd = document.createElement('td');
            xTd.textContent = point.exists ? point.x.toFixed(1) : '不存在';
            tr.appendChild(xTd);
            
            // Y坐标
            const yTd = document.createElement('td');
            yTd.textContent = point.exists ? point.y.toFixed(1) : '不存在';
            tr.appendChild(yTd);
            
            // 添加鼠标事件
            if (point.exists) {
                tr.addEventListener('mouseenter', () => {
                    renderHighlightedPoint(point);
                });
                
                tr.addEventListener('mouseleave', () => {
                    renderAnnotationPoints(); // 重新渲染所有点以清除高亮
                });
            }
            
            pointsTableBody.appendChild(tr);
        });
    } catch (error) {
        logError('渲染标点表格时出错:', error);
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.textContent = '标点数据加载失败';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        pointsTableBody.appendChild(tr);
    }
}

// 渲染标记点到canvas上 - 重构为与Marking系统一致
function renderAnnotationPoints() {
    if (!currentAnnotationData || !currentAnnotationData.points) {
        logWarn('缺少标注数据，无法渲染标记点');
        return;
    }
    
    // 使用统一的绘制函数
    drawImage();
}

// 渲染单个高亮标记点 - 重构为与Marking系统一致
function renderHighlightedPoint(point) {
    if (!point || !point.exists) {
        logWarn('无效的标记点，无法渲染高亮效果');
        return;
    }
    
    const image = window.currentImage;
    if (!image) return;
    
    try {
        const ctx = overlayCanvas.getContext('2d');
        
        // 重绘图像和所有点
        drawImage();
        
        // 计算图像绘制位置和大小
        const imgWidth = image.width * currentScale;
        const imgHeight = image.height * currentScale;
        const x = (overlayCanvas.width - imgWidth) / 2 + currentOffsetX;
        const y = (overlayCanvas.height - imgHeight) / 2 + currentOffsetY;
        
        // 计算标点在Canvas上的位置 - 与Marking系统一致
        const canvasX = x + point.x * currentScale;
        const canvasY = y + point.y * currentScale;
        
        // 绘制高亮效果
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, RENDER_CONFIG.pointRadius + 4, 0, 2 * Math.PI);
        ctx.fillStyle = RENDER_CONFIG.highlightColor;
        ctx.fill();
        
        // 绘制高亮外圈
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, RENDER_CONFIG.pointRadius + 6, 0, 2 * Math.PI);
        ctx.strokeStyle = RENDER_CONFIG.highlightColor;
        ctx.lineWidth = 3;
        ctx.stroke();
    } catch (error) {
        logError('渲染高亮标记点时出错:', error);
    }
}

// 渲染选中的标记点 - 重构为与Marking系统一致
function renderSelectedPoint(point) {
    if (!point || !point.exists) {
        logWarn('无效的标记点，无法渲染选中效果');
        return;
    }
    
    const image = window.currentImage;
    if (!image) return;
    
    try {
        const ctx = overlayCanvas.getContext('2d');
        
        // 计算图像绘制位置和大小
        const imgWidth = image.width * currentScale;
        const imgHeight = image.height * currentScale;
        const x = (overlayCanvas.width - imgWidth) / 2 + currentOffsetX;
        const y = (overlayCanvas.height - imgHeight) / 2 + currentOffsetY;
        
        // 计算标点在Canvas上的位置 - 与Marking系统一致
        const canvasX = x + point.x * currentScale;
        const canvasY = y + point.y * currentScale;
        
        // 绘制选中效果
        ctx.fillStyle = RENDER_CONFIG.selectionColor;
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)';
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, RENDER_CONFIG.pointRadius + 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        
        // 恢复默认样式
        ctx.fillStyle = RENDER_CONFIG.pointColor;
        ctx.strokeStyle = RENDER_CONFIG.pointStrokeColor;
        ctx.lineWidth = RENDER_CONFIG.pointStrokeWidth;
    } catch (error) {
        logError('渲染选中标记点时出错:', error);
    }
}

// 渲染审核历史
function renderAuditHistory(auditData) {
    try {
        if (!auditData) {
            auditHistory.textContent = '暂无审核记录';
            return;
        }
        
        const status = auditData.approved ? '已批准' : '已拒绝';
        const date = new Date(auditData.auditedAt).toLocaleString('zh-CN');
        const comments = auditData.comments || '无';
        const auditor = auditData.auditor || auditData.auditorUsername || '-';
        
        auditHistory.innerHTML = `
            <div><strong>状态:</strong> ${status}</div>
            <div><strong>审核时间:</strong> ${date}</div>
            <div><strong>审核人:</strong> ${auditor}</div>
            <div><strong>审核意见:</strong> ${comments}</div>
        `;
    } catch (error) {
        logError('渲染审核历史时出错:', error);
        auditHistory.textContent = '审核记录加载失败';
    }
}

// 处理缩放事件 - 重构为与Marking系统一致
function handleZoom(event) {
    event.preventDefault();
    
    const image = window.currentImage;
    if (!image) return;
    
    // 计算缩放因子 - 与Marking系统保持一致
    const zoomIntensity = 0.1;
    const zoomFactor = event.deltaY > 0 ? (1 - zoomIntensity) : (1 + zoomIntensity);
    const newScale = Math.max(RENDER_CONFIG.minScale, Math.min(RENDER_CONFIG.maxScale, currentScale * zoomFactor));
    
    // 如果缩放没有变化，直接返回
    if (newScale === currentScale) return;
    
    // 计算当前图像在画布上的位置和尺寸 - 与Marking系统保持一致
    const currentImgWidth = image.width * currentScale;
    const currentImgHeight = image.height * currentScale;
    const currentImgX = (overlayCanvas.width - currentImgWidth) / 2 + currentOffsetX;
    const currentImgY = (overlayCanvas.height - currentImgHeight) / 2 + currentOffsetY;
    
    // 计算图像几何中心在画布上的位置 - 与Marking系统保持一致
    const centerX = currentImgX + currentImgWidth / 2;
    const centerY = currentImgY + currentImgHeight / 2;
    
    // 计算缩放后的图像尺寸 - 与Marking系统保持一致
    const newImgWidth = image.width * newScale;
    const newImgHeight = image.height * newScale;
    
    // 调整偏移量，使图像几何中心保持不变 - 与Marking系统保持一致
    currentOffsetX = centerX - newImgWidth / 2 - (overlayCanvas.width - newImgWidth) / 2;
    currentOffsetY = centerY - newImgHeight / 2 - (overlayCanvas.height - newImgHeight) / 2;
    
    currentScale = newScale;
    
    // 更新缩放级别显示
    updateZoomLevelDisplay();
    
    // 使用requestAnimationFrame确保流畅的动画效果
    requestAnimationFrame(() => {
        drawImage();
    });
}

// 放大
function zoomIn() {
    const image = window.currentImage;
    if (!image) return;
    
    const zoomFactor = 1.1;
    const newScale = Math.min(RENDER_CONFIG.maxScale, currentScale * zoomFactor);
    
    if (newScale === currentScale) return;
    
    // 计算当前图像在画布上的位置和尺寸
    const currentImgWidth = image.width * currentScale;
    const currentImgHeight = image.height * currentScale;
    const currentImgX = (overlayCanvas.width - currentImgWidth) / 2 + currentOffsetX;
    const currentImgY = (overlayCanvas.height - currentImgHeight) / 2 + currentOffsetY;
    
    // 计算图像几何中心在画布上的位置
    const centerX = currentImgX + currentImgWidth / 2;
    const centerY = currentImgY + currentImgHeight / 2;
    
    // 计算缩放后的图像尺寸
    const newImgWidth = image.width * newScale;
    const newImgHeight = image.height * newScale;
    
    // 调整偏移量，使图像几何中心保持不变
    currentOffsetX = centerX - newImgWidth / 2 - (overlayCanvas.width - newImgWidth) / 2;
    currentOffsetY = centerY - newImgHeight / 2 - (overlayCanvas.height - newImgHeight) / 2;
    
    currentScale = newScale;
    
    // 更新缩放级别显示
    updateZoomLevelDisplay();
    
    // 使用requestAnimationFrame确保流畅的动画效果
    requestAnimationFrame(() => {
        drawImage();
    });
}

// 缩小
function zoomOut() {
    const image = window.currentImage;
    if (!image) return;
    
    const zoomFactor = 0.9;
    const newScale = Math.max(RENDER_CONFIG.minScale, currentScale * zoomFactor);
    
    if (newScale === currentScale) return;
    
    // 计算当前图像在画布上的位置和尺寸
    const currentImgWidth = image.width * currentScale;
    const currentImgHeight = image.height * currentScale;
    const currentImgX = (overlayCanvas.width - currentImgWidth) / 2 + currentOffsetX;
    const currentImgY = (overlayCanvas.height - currentImgHeight) / 2 + currentOffsetY;
    
    // 计算图像几何中心在画布上的位置
    const centerX = currentImgX + currentImgWidth / 2;
    const centerY = currentImgY + currentImgHeight / 2;
    
    // 计算缩放后的图像尺寸
    const newImgWidth = image.width * newScale;
    const newImgHeight = image.height * newScale;
    
    // 调整偏移量，使图像几何中心保持不变
    currentOffsetX = centerX - newImgWidth / 2 - (overlayCanvas.width - newImgWidth) / 2;
    currentOffsetY = centerY - newImgHeight / 2 - (overlayCanvas.height - newImgHeight) / 2;
    
    currentScale = newScale;
    
    // 更新缩放级别显示
    updateZoomLevelDisplay();
    
    // 使用requestAnimationFrame确保流畅的动画效果
    requestAnimationFrame(() => {
        drawImage();
    });
}

// 更新缩放级别显示
function updateZoomLevelDisplay() {
    const zoomLevelDisplay = document.getElementById('zoomLevelDisplay');
    if (zoomLevelDisplay) {
        const zoomPercentage = Math.round(currentScale * 100);
        zoomLevelDisplay.textContent = `${zoomPercentage}%`;
    }
}

// 开始拖拽 - 重构为与Marking系统一致
function startDrag(event) {
    const image = window.currentImage;
    if (!image) return;
    
    const rect = overlayCanvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // 检查是否按下了中键
    if (event.button === 1) {
        isDragging = true;
        lastMouseX = mouseX;
        lastMouseY = mouseY;
        overlayCanvas.style.cursor = 'grabbing';
        return;
    }
    
    // 左键点击处理
    if (event.button === 0) {
        // 开始拖动平移
        isDragging = true;
        lastMouseX = mouseX;
        lastMouseY = mouseY;
        overlayCanvas.style.cursor = 'grabbing';
    }
}

// 结束拖拽 - 重构为与Marking系统一致
function endDrag(event) {
    if (isDragging) {
        isDragging = false;
        overlayCanvas.style.cursor = 'grab';
    }
}

// 处理拖拽 - 重构为与Marking系统一致
function handleDrag(event) {
    if (isDragging) {
        const rect = overlayCanvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        
        const deltaX = mouseX - lastMouseX;
        const deltaY = mouseY - lastMouseY;
        
        currentOffsetX += deltaX;
        currentOffsetY += deltaY;
        
        // 应用边界检查，确保图像不会完全移出视图
        applyBoundaryConstraints();
        
        lastMouseX = mouseX;
        lastMouseY = mouseY;
        
        // 使用requestAnimationFrame确保流畅的动画效果
        requestAnimationFrame(() => {
            drawImage();
        });
    }
}

// 应用边界约束 - 确保图像至少有一部分在视图内
function applyBoundaryConstraints() {
    const image = window.currentImage;
    if (!image) return;
    
    const imgWidth = image.width * currentScale;
    const imgHeight = image.height * currentScale;
    const imgX = (overlayCanvas.width - imgWidth) / 2 + currentOffsetX;
    const imgY = (overlayCanvas.height - imgHeight) / 2 + currentOffsetY;
    
    // 允许图像移出视图，但至少保留50像素在视图内
    const minVisiblePixels = 50;
    
    // 检查左边界
    if (imgX + imgWidth < minVisiblePixels) {
        currentOffsetX = minVisiblePixels - imgWidth - (overlayCanvas.width - imgWidth) / 2;
    }
    
    // 检查右边界
    if (imgX > overlayCanvas.width - minVisiblePixels) {
        currentOffsetX = overlayCanvas.width - minVisiblePixels - (overlayCanvas.width - imgWidth) / 2;
    }
    
    // 检查上边界
    if (imgY + imgHeight < minVisiblePixels) {
        currentOffsetY = minVisiblePixels - imgHeight - (overlayCanvas.height - imgHeight) / 2;
    }
    
    // 检查下边界
    if (imgY > overlayCanvas.height - minVisiblePixels) {
        currentOffsetY = overlayCanvas.height - minVisiblePixels - (overlayCanvas.height - imgHeight) / 2;
    }
}

// 重置视图 - 重构为与Marking系统一致
function resetView() {
    currentScale = 1;
    currentOffsetX = 0;
    currentOffsetY = 0;
    updateZoomLevelDisplay();
    drawImage();
}

// 审核文件
async function auditFile(approved) {
    if (!currentPatientId || !currentFileName) {
        logWarn('未选择标注文件，无法进行审核操作');
        alert('请先选择一个标注文件');
        return;
    }
    
    const comments = commentsTextarea.value;
    
    try {
        logInfo(`正在提交${approved ? '批准' : '拒绝'}审核操作...`);
        const response = await authenticatedFetch(`/api/patients/${currentPatientId}/files/${currentFileName}/audit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ approved, comments })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.message) {
            logInfo(`审核操作成功: ${data.message}`);
            alert(data.message);
            // 更新当前数据
            if (data.data) {
                currentAnnotationData = data.data;
                renderAuditHistory(data.data.audit);
            }
        }
    } catch (error) {
        logError('审核操作失败:', error);
        if (error.message !== '认证失败，请重新登录') {
            alert('审核操作失败: ' + error.message);
        }
    }
}

// 处理登出
async function handleLogout() {
    try {
        const token = getAuthToken();
        if (token) {
            await authenticatedFetch('/api/auth/logout', {
                method: 'POST'
            });
        }
    } catch (error) {
        logError('登出请求失败:', error);
    } finally {
        logout();
    }
}