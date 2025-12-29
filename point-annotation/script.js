// 在script.js的开头（或函数定义前）添加：
const dom = {
    patientIdInput: document.getElementById('patientId'), // 替换为页面中病历号输入框的id
    fileInput: document.getElementById('fileInput') // 替换为页面中文件上传控件的id
};
// 全局变量
let canvas, ctx;
let image = null;
let imageData = null;
let scale = 1.0;
let offsetX = 0;
let offsetY = 0;
let points = [];
let selectedPointIndex = -1;
let pointNames = [];
let patientInfo = {
    patientId: '',
    phase: '幼儿期术前',
    angle: '正面'
};

// 标点模式状态
let isPointMode = false;

// 标点显示模式：'fullName' | 'number' | 'pointOnly'
let pointDisplayMode = 'fullName';

// 撤销/重做栈
let undoStack = [];
let redoStack = [];

// 鼠标状态
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// 初始化函数
function init() {
    // 获取DOM元素
    canvas = document.getElementById('imageCanvas');
    ctx = canvas.getContext('2d');
    
    // 绑定事件监听器
    bindEventListeners();
    
    // 尝试加载Excel文件
    loadExcelFile();
    
    // 初始化Canvas
    resizeCanvas();
    
    // 初始化缩放级别
    scale = 1.0;
}

// 绑定事件监听器
function bindEventListeners() {
    // 文件选择
    document.getElementById('openImageBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    
    // Electron菜单事件监听
    if (typeof require !== 'undefined') {
        const { ipcRenderer } = require('electron');
        
        // 监听菜单事件
        ipcRenderer.on('menu-open-image', () => {
            document.getElementById('fileInput').click();
        });
        
        ipcRenderer.on('menu-save-annotation', () => {
            saveBothFiles();
        });
        
        ipcRenderer.on('menu-undo', () => {
            undo();
        });
        
        ipcRenderer.on('menu-redo', () => {
            redo();
        });
        
        ipcRenderer.on('menu-zoom-in', () => {
            zoomIn();
        });
        
        ipcRenderer.on('menu-zoom-out', () => {
            zoomOut();
        });
        
        ipcRenderer.on('menu-reset-zoom', () => {
            resetZoom();
        });
    }
    
    document.getElementById('fileInput').addEventListener('change', handleImageUpload);
    
    // 标点模式切换
    document.getElementById('pointModeBtn').addEventListener('click', togglePointMode);
    
    // 标点显示模式切换
    document.getElementById('displayFullNameBtn').addEventListener('click', () => setPointDisplayMode('fullName'));
    document.getElementById('displayNumberBtn').addEventListener('click', () => setPointDisplayMode('number'));
    document.getElementById('displayPointOnlyBtn').addEventListener('click', () => setPointDisplayMode('pointOnly'));
    
    // 保存文件按钮
    const saveFilesBtn = document.getElementById('saveFilesBtn');
    if (saveFilesBtn) {
        saveFilesBtn.addEventListener('click', saveBothFiles);
    } else {
        console.warn('保存文件按钮元素未找到');
    }
    
    // 导出按钮
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportAnnotation);
    } else {
        console.warn('导出按钮元素未找到');
    }
    
    // 导入按钮
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            document.getElementById('jsonInput').click();
        });
    } else {
        console.warn('导入按钮元素未找到');
    }
    
    // JSON文件导入
    const jsonInput = document.getElementById('jsonInput');
    if (jsonInput) {
        jsonInput.addEventListener('change', importAnnotation);
    }
    
    // 撤销/重做
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    if (undoBtn) {
        undoBtn.addEventListener('click', undo);
    }
    
    if (redoBtn) {
        redoBtn.addEventListener('click', redo);
    }
    
    // 清空图像
    // document.getElementById('clearBtn').addEventListener('click', clearImage);
    
    // 缩放控制
    document.getElementById('zoomInBtn').addEventListener('click', zoomIn);
    document.getElementById('zoomOutBtn').addEventListener('click', zoomOut);
    document.getElementById('zoomResetBtn').addEventListener('click', resetZoom);
    
    // 键盘快捷键
    document.addEventListener('keydown', handleKeyDown);
    
    // Canvas事件
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel);
    
    
    
    // 加载Excel文件
    const excelInput = document.getElementById('excelInput');
    if (excelInput) {
        excelInput.addEventListener('change', loadExcelFile);
    }
    
    // 病人信息保存
    const saveInfoBtn = document.getElementById('saveInfoBtn');
    if (saveInfoBtn) {
        saveInfoBtn.addEventListener('click', savePatientInfo);
    }
    
    // 图像信息保存
    // document.getElementById('saveImageInfo').addEventListener('click', saveImageInfo);
    
    // 模态框事件
    const modal = document.getElementById('imageInfoModal');
    if (modal) {
        const closeBtn = modal.querySelector('.close');
        const cancelBtn = document.getElementById('modalCancelBtn');
        const okBtn = document.getElementById('modalOkBtn');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('show');
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modal.classList.remove('show');
                // 清除图像
                clearImage();
            });
        }
        
        if (okBtn) {
            okBtn.addEventListener('click', saveModalInfo);
        }
        
        // 添加回车键支持，方便快速确认
        const modalPatientIdInput = document.getElementById('modalPatientId');
        if (modalPatientIdInput) {
            modalPatientIdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    saveModalInfo();
                }
            });
        }
    }
    
    // 点击模态框外部关闭
    window.addEventListener('click', (e) => {
        if (modal && e.target === modal) {
            modal.classList.remove('show');
            clearImage();
        }
    });
    
    // 窗口大小变化
    window.addEventListener('resize', resizeCanvas);
}

// 从文件路径中提取病历号的函数
function extractPatientIdFromPath(filePath) {
    try {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('文件路径无效');
        }
        
        // 标准化路径分隔符，统一使用正斜杠
        const normalizedPath = filePath.replace(/\\/g, '/');
        
        // 分割路径为目录部分
        const pathParts = normalizedPath.split('/');
        
        // 从路径中查找包含病历号的文件夹（从后往前遍历，优先处理靠近文件的目录）
        for (let i = pathParts.length - 2; i >= 0; i--) { // 从倒数第二个开始，跳过文件名
            const folderName = pathParts[i];
            
            // 跳过空字符串
            if (!folderName) continue;
            
            console.log(`检查路径部分[${i}]: ${folderName}`);
            
            // 方法1：优先从"数字+中文姓名"格式中提取（如："40634唐明轩"）
            // 支持格式：纯数字开头 + 中文姓名，数字长度通常为5-8位
            const numberNameMatch = folderName.match(/^(\d{4,8})([\u4e00-\u9fa5]{2,4})$/);
            if (numberNameMatch && numberNameMatch[1]) {
                console.log(`从数字+姓名格式提取病历号: ${numberNameMatch[1]}`);
                return {
                    patientId: numberNameMatch[1],
                    source: 'folder_number_name',
                    confidence: 'high'
                };
            }
            
            // 方法2：从包含分隔符的格式中提取（如"123456_张三"、"2024001-李四"）
            const separatorMatch = folderName.match(/^(\d{4,8})[-_]([\u4e00-\u9fa5a-zA-Z]{2,20})$/);
            if (separatorMatch && separatorMatch[1]) {
                console.log(`从分隔符格式提取病历号: ${separatorMatch[1]}`);
                return {
                    patientId: separatorMatch[1],
                    source: 'folder_separator',
                    confidence: 'high'
                };
            }
            
            // 方法3：直接提取纯数字串（连续数字，长度4-8位）
            // 用于处理纯数字文件夹名，如"40634"
            const pureNumberMatch = folderName.match(/^(\d{4,8})$/);
            if (pureNumberMatch && pureNumberMatch[1]) {
                console.log(`从纯数字文件夹提取病历号: ${pureNumberMatch[1]}`);
                return {
                    patientId: pureNumberMatch[1],
                    source: 'folder_pure_number',
                    confidence: 'high'
                };
            }
            
            // 方法4：从混合格式中提取数字部分（支持更灵活的模式）
            // 如："患者123456"、"病历789012"、"patient2024001"等
            const mixedFormatMatch = folderName.match(/(?:患者|病历|patient|case|id)[^\d]*(\d{4,8})/i);
            if (mixedFormatMatch && mixedFormatMatch[1]) {
                console.log(`从关键词格式提取病历号: ${mixedFormatMatch[1]}`);
                return {
                    patientId: mixedFormatMatch[1],
                    source: 'keyword_folder',
                    confidence: 'medium'
                };
            }
            
            // 方法5：宽松匹配 - 从任意位置提取4-8位连续数字
            // 作为最后的手段，从文件夹名中提取任何符合条件的数字序列
            const looseNumberMatch = folderName.match(/(\d{4,8})/);
            if (looseNumberMatch && looseNumberMatch[1]) {
                // 验证提取的数字是否看起来像病历号（不在其他数字序列中）
                const number = looseNumberMatch[1];
                const beforeChar = folderName[looseNumberMatch.index - 1] || '';
                const afterChar = folderName[looseNumberMatch.index + number.length] || '';
                
                // 如果数字前后都不是数字，则认为是有效的病历号
                if (!/\d/.test(beforeChar) && !/\d/.test(afterChar)) {
                    console.log(`从宽松匹配提取病历号: ${number}`);
                    return {
                        patientId: number,
                        source: 'loose_match',
                        confidence: 'medium'
                    };
                }
            }
        }
        
        // 如果无法从路径中提取，尝试从文件名中提取
        const fileName = pathParts[pathParts.length - 1];
        console.log(`检查文件名: ${fileName}`);
        
        // 从文件名中提取纯数字病历号（支持常见图像文件名格式）
        const fileNameMatch = fileName.match(/^(\d{4,8})(?:[^\d]|$)/);
        if (fileNameMatch && fileNameMatch[1]) {
            console.log(`从文件名提取病历号: ${fileNameMatch[1]}`);
            return {
                patientId: fileNameMatch[1],
                source: 'filename',
                confidence: 'low'
            };
        }
        
        // 如果所有方法都失败，返回未找到
        console.log('无法从路径中识别病历号格式');
        return {
            patientId: null,
            source: 'none',
            confidence: 'none',
            error: '无法从路径中识别病历号格式'
        };
    } catch (error) {
        console.error('病历号提取过程中发生错误:', error.message);
        return {
            patientId: null,
            source: 'error',
            confidence: 'none',
            error: error.message
        };
    }
}

// 验证病历号格式的函数
function validatePatientId(patientId) {
    if (!patientId || typeof patientId !== 'string') {
        return false;
    }
    
    // 新逻辑：病历号格式为纯数字串
    const patientIdPattern = /^\d+$/;
    return patientIdPattern.test(patientId);
}

// 定义固定的标点名称列表
const fixedPointNames = [
    "发际中点",
    "额点",
    "左眉点",
    "左眼外眦",
    "左眼睑最高点",
    "左眼内眦",
    "左瞳孔中点",
    "左眼睑最低点",
    "右眉点",
    "右眼外眦",
    "右眼睑最高点",
    "右眼内眦",
    "右瞳孔中点",
    "右眼睑最低点",
    "左耳屏点（外耳道点）",
    "右耳屏点（外耳道点）",
    "鼻根点",
    "鼻顶点",
    "鼻小柱基部中点",
    "鼻小柱基部左侧点",
    "鼻小柱基部右侧点",
    "左鼻翼沟顶点",
    "左鼻翼沟中点",
    "左鼻翼沟底点",
    "鼻左外侧点",
    "左鼻翼基角转折点",
    "右鼻翼沟顶点",
    "右鼻翼沟中点",
    "右鼻翼沟底点",
    "鼻右外侧点",
    "右鼻翼基角转折点",
    "鼻小柱左侧顶点",
    "左鼻翼上缘顶点（中点）",
    "左鼻翼上缘转折点",
    "左鼻翼下缘点",
    "左鼻翼基角外侧点",
    "左鼻翼基角中点",
    "鼻小柱右侧顶点",
    "右鼻翼上缘顶点（中点）",
    "右鼻翼上缘转折点",
    "右鼻翼下缘点",
    "右鼻翼基角外侧点",
    "右鼻翼基角中点",
    "左口角",
    "左上唇中点",
    "左侧唇顶点",
    "上唇点",
    "右侧唇顶点",
    "右上唇中点",
    "右口角",
    "下唇点",
    "颏唇沟点",
    "颏前点",
    "颏下点"
];

// 加载标点名称列表（原Excel加载功能，现使用固定列表）
function loadExcelFile() {
    // 直接使用固定的标点名称列表
    pointNames = fixedPointNames;
    
    // 更新标点表格
    updatePointsTable();
    
    console.log('标点名称列表已加载（使用固定列表）');
}

// 处理图像上传
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 记录当前操作开始时间，用于处理多次连续打开图像的操作顺序
    const operationStartTime = Date.now();
    console.log(`开始处理图像上传，操作时间戳: ${operationStartTime}`);
    
    // 尝试从文件路径中提取病历号
    let extractionResult = null;
    try {
        // 在浏览器环境中，file.path 通常不可用，只能获取文件名
        // 但我们可以通过其他方式获取更多路径信息
        let filePath = file.name; // 默认使用文件名
        
        // 尝试获取更完整的路径信息（如果可用）
        if (file.webkitRelativePath) {
            // 如果使用webkitRelativePath（在文件夹选择时可用）
            filePath = file.webkitRelativePath;
            console.log('使用webkitRelativePath:', filePath);
        } else if (file.path) {
            // 如果file.path可用（在某些浏览器中可能可用）
            filePath = file.path;
            console.log('使用file.path:', filePath);
        } else {
            // 如果只有文件名，尝试从其他方式获取路径信息
            console.log('只有文件名可用，尝试从其他方式获取路径信息');
            
            // 方法1：检查是否可以通过URL获取路径信息
            if (window.URL && window.URL.createObjectURL) {
                const objectUrl = window.URL.createObjectURL(file);
                console.log('对象URL:', objectUrl);
                // 注意：对象URL不包含原始路径信息
            }
            
            // 方法2：如果用户是通过文件夹选择，可以尝试记录选择时的路径信息
            // 这需要额外的实现来跟踪文件夹选择
        }
        
        console.log('用于提取病历号的路径:', filePath);
        extractionResult = extractPatientIdFromPath(filePath);
        
        // 记录提取结果用于调试
        console.log('病历号提取结果:', extractionResult);
        
        // 如果提取失败，显示警告信息
        if (!extractionResult.patientId && extractionResult.error) {
            console.warn('病历号提取失败:', extractionResult.error);
        }
    } catch (error) {
        console.error('病历号提取过程中发生错误:', error.message);
        extractionResult = {
            patientId: null,
            source: 'error',
            confidence: 'none',
            error: error.message
        };
    }
    
    const reader = new FileReader();
    
    // 文件读取成功处理
    reader.onload = (e) => {
        const img = new Image();
        
        // 图像加载成功处理
        img.onload = () => {
            console.log(`图像加载成功，操作时间戳: ${operationStartTime}`);
            
            // 在图像加载完成后，清除当前界面中所有已存在的信息数据
            clearCurrentData();
            
            // 设置新图像
            image = img;
            resizeCanvas();
            
            // 自动缩放图像以适应画布
            fitImageToCanvas();
            
            // 绘制新图像
            drawImage();
            
            // 显示信息录入模态框，并传入提取的病历号
            showImageInfoModal(extractionResult);
            
            // 添加模态框关闭监听器，确保数据同步
            setupModalCloseListener();
            
            console.log(`新图像加载完成，界面数据已清除，操作时间戳: ${operationStartTime}`);
        };
        
        // 图像加载失败处理
        img.onerror = () => {
            console.error(`图像加载失败，操作时间戳: ${operationStartTime}`);
            alert('图像加载失败，请检查文件是否为有效的图像格式。');
            // 图像加载失败时不触发清除操作
        };
        
        img.src = e.target.result;
    };
    
    // 文件读取错误处理
    reader.onerror = function() {
        console.error(`文件读取失败，操作时间戳: ${operationStartTime}`);
        alert('文件读取失败，请检查文件格式是否正确。');
        // 文件读取失败时不触发清除操作
    };
    
    reader.readAsDataURL(file);
}

// 智能适配图像以适应画布，确保图片完整显示且最大化利用显示空间
function fitImageToCanvas() {
    if (!image || !canvas) return;
    
    // 1. 获取图片原始长宽比
    const imageAspectRatio = image.width / image.height;
    
    // 2. 获取画布显示区域长宽比
    const canvasAspectRatio = canvas.width / canvas.height;
    
    // 3. 智能适配算法：基于双长宽比进行适配
    if (imageAspectRatio > canvasAspectRatio) {
        // 图片比画布更宽，按宽度适配
        scale = canvas.width / image.width;
    } else {
        // 图片比画布更高，按高度适配
        scale = canvas.height / image.height;
    }
    
    // 4. 处理边缘情况：当图片尺寸小于显示区域时居中显示
    const scaledWidth = image.width * scale;
    const scaledHeight = image.height * scale;
    
    if (scaledWidth < canvas.width && scaledHeight < canvas.height) {
        // 图片尺寸小于画布，居中显示
        offsetX = (canvas.width - scaledWidth) / 2;
        offsetY = (canvas.height - scaledHeight) / 2;
    } else {
        // 图片尺寸大于画布，按比例缩小至完全可见
        offsetX = 0;
        offsetY = 0;
    }
    
    // 5. 确保适配逻辑在不同尺寸设备上正常工作
    // 限制最小缩放比例，避免图片过小看不清
    const minScale = Math.min(0.1, Math.min(canvas.width / image.width, canvas.height / image.height));
    scale = Math.max(scale, minScale);
    
    // 6. 更新缩放显示
    document.getElementById('zoomLevel').textContent = Math.round(scale * 100);
    
    // 7. 提供平滑的过渡动画效果
    animateImageTransition();
}

// 平滑过渡动画效果
function animateImageTransition() {
    if (!image) return;
    
    const targetScale = scale;
    const targetOffsetX = offsetX;
    const targetOffsetY = offsetY;
    
    // 保存当前状态
    const startScale = scale;
    const startOffsetX = offsetX;
    const startOffsetY = offsetY;
    
    // 动画参数
    const duration = 300; // 动画时长（毫秒）
    const startTime = performance.now();
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // 使用缓动函数实现平滑过渡
        const easeProgress = easeOutCubic(progress);
        
        // 插值计算当前状态
        scale = startScale + (targetScale - startScale) * easeProgress;
        offsetX = startOffsetX + (targetOffsetX - startOffsetX) * easeProgress;
        offsetY = startOffsetY + (targetOffsetY - startOffsetY) * easeProgress;
        
        // 重绘图像
        drawImage();
        
        if (progress < 1) {
            // 继续动画
            requestAnimationFrame(animate);
        } else {
            // 动画结束，确保最终状态准确
            scale = targetScale;
            offsetX = targetOffsetX;
            offsetY = targetOffsetY;
            drawImage();
        }
    }
    
    // 启动动画
    requestAnimationFrame(animate);
}

// 缓动函数：缓出三次方
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// 显示图像信息模态框
function showImageInfoModal(extractionResult = null) {
    const modal = document.getElementById('imageInfoModal');
    modal.classList.add('show');
    
    // 清空表单
    document.getElementById('modalPatientId').value = '';
    document.getElementById('modalPhase').value = '幼儿期术前';
    document.getElementById('modalAngle').value = '正面';
    
    // 如果从路径中提取到了病历号，自动填充到输入框
    if (extractionResult && extractionResult.patientId && validatePatientId(extractionResult.patientId)) {
        document.getElementById('modalPatientId').value = extractionResult.patientId;
        // 可选：添加视觉提示表示这是自动填充的值
        const patientIdInput = document.getElementById('modalPatientId');
        
        // 根据置信度设置不同的视觉提示
        let borderColor = '#28a745'; // 高置信度 - 绿色
        let backgroundColor = '#f8fff9';
        
        if (extractionResult.confidence === 'medium') {
            borderColor = '#ffc107'; // 中等置信度 - 黄色
            backgroundColor = '#fffdf6';
        } else if (extractionResult.confidence === 'low') {
            borderColor = '#fd7e14'; // 低置信度 - 橙色
            backgroundColor = '#fff8f2';
        }
        
        // 添加视觉提示表示这是自动填充的值
        patientIdInput.style.borderColor = borderColor;
        patientIdInput.style.backgroundColor = backgroundColor;
        patientIdInput.title = `自动提取的病历号 (来源: ${extractionResult.source}, 置信度: ${extractionResult.confidence})`;
        
        // 3秒后恢复原样式
        setTimeout(() => {
            patientIdInput.style.borderColor = '';
            patientIdInput.style.backgroundColor = '';
            patientIdInput.title = '';
        }, 3000);
    } else if (extractionResult && extractionResult.error) {
        // 提取过程中发生错误，记录日志
        console.warn('病历号提取失败:', extractionResult.error);
    }
    
    // 聚焦到病历号输入框
    document.getElementById('modalPatientId').focus();
}

// 保存模态框信息
function saveModalInfo() {
    const patientIdInput = document.getElementById('modalPatientId');
    const patientId = patientIdInput ? patientIdInput.value.trim() : '';
    
    if (!patientId) {
        alert('请输入病人病历号');
        if (patientIdInput) {
            patientIdInput.focus();
        }
        return;
    }
    
    // 验证病历号格式
    if (!validatePatientId(patientId)) {
        alert('病历号格式不正确，请检查后重新输入');
        if (patientIdInput) {
            patientIdInput.focus();
            patientIdInput.select();
        }
        return;
    }
    
    // 保存信息到应用状态
    patientInfo.patientId = patientId;
    patientInfo.phase = document.getElementById('modalPhase') ? document.getElementById('modalPhase').value : '幼儿期术前';
    patientInfo.angle = document.getElementById('modalAngle') ? document.getElementById('modalAngle').value : '正面';
    
    console.log('病历号已保存到应用状态:', patientInfo);
    
    // 强制更新界面显示
    updatePatientInfoDisplay();
    
    // 触发自定义事件，通知其他组件数据已更新
    window.dispatchEvent(new CustomEvent('patientInfoUpdated', {
        detail: { patientInfo }
    }));
    
    // 关闭模态框
    const modal = document.getElementById('imageInfoModal');
    if (modal) {
        modal.classList.remove('show');
    }
    
    // 确保界面刷新
    setTimeout(() => {
        // 再次更新显示，确保数据同步
        updatePatientInfoDisplay();
        
        // 检查主界面的病历号输入框
        const mainPatientIdInput = document.getElementById('patientId');
        if (mainPatientIdInput && mainPatientIdInput.value !== patientInfo.patientId) {
            console.warn('病历号显示不同步，手动更新');
            mainPatientIdInput.value = patientInfo.patientId;
            // 再次触发事件确保同步
            mainPatientIdInput.dispatchEvent(new Event('input', { bubbles: true }));
            mainPatientIdInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, 100);
}

// 设置模态框关闭监听器
function setupModalCloseListener() {
    const modal = document.getElementById('imageInfoModal');
    if (!modal) return;
    
    // 监听模态框关闭事件
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const isModalVisible = modal.classList.contains('show');
                if (!isModalVisible) {
                    // 模态框已关闭，确保数据同步
                    console.log('模态框已关闭，同步数据到主界面');
                    updatePatientInfoDisplay();
                    
                    // 触发自定义事件，通知其他组件数据已更新
                    window.dispatchEvent(new CustomEvent('patientInfoUpdated', {
                        detail: { patientInfo }
                    }));
                }
            }
        });
    });
    
    observer.observe(modal, { attributes: true });
}

// 切换标点模式
function togglePointMode() {
    isPointMode = !isPointMode;
    const btn = document.getElementById('pointModeBtn');
    
    if (isPointMode) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        btn.textContent = '标点模式 (开启)';
        canvas.style.cursor = 'crosshair';
    } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        btn.textContent = '标点模式';
        canvas.style.cursor = 'default';
        // 取消选中标点
        selectedPointIndex = -1;
        document.getElementById('selectedPoint').textContent = '当前选择: 无';
        drawImage();
    }
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
            // 查找标点在固定列表中的序号
            const pointIndex = fixedPointNames.findIndex(name => name === point.name);
            return pointIndex !== -1 ? `#${pointIndex + 1}` : `#${index + 1}`;
        case 'pointOnly':
            return '';
        default:
            return point.name;
    }
}

// 更新病人信息显示
function updatePatientInfoDisplay() {
    console.log('更新病人信息显示:', patientInfo);
    
    const patientIdInput = document.getElementById('patientId');
    const phaseSelect = document.getElementById('phase');
    const angleSelect = document.getElementById('angle');
    
    if (patientIdInput) {
        patientIdInput.value = patientInfo.patientId || '';
        console.log('病历号输入框已更新:', patientIdInput.value);
    } else {
        console.error('未找到病历号输入框元素');
    }
    
    if (phaseSelect) {
        phaseSelect.value = patientInfo.phase || '幼儿期术前';
    }
    
    if (angleSelect) {
        angleSelect.value = patientInfo.angle || '正面';
    }
    
    // 触发输入事件，确保任何监听器都能收到更新
    if (patientIdInput) {
        patientIdInput.dispatchEvent(new Event('input', { bubbles: true }));
        patientIdInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

// 保存病人信息修改
function savePatientInfo() {
    const patientIdInput = document.getElementById('patientId');
    const patientId = patientIdInput ? patientIdInput.value.trim() : '';
    
    if (!patientId) {
        alert('请输入病人病历号');
        if (patientIdInput) {
            patientIdInput.focus();
        }
        return;
    }
    
    // 验证病历号格式
    if (!validatePatientId(patientId)) {
        alert('病历号格式不正确，请检查后重新输入');
        if (patientIdInput) {
            patientIdInput.focus();
            patientIdInput.select();
        }
        return;
    }
    
    // 保存修改
    patientInfo.patientId = patientId;
    patientInfo.phase = document.getElementById('phase') ? document.getElementById('phase').value : '幼儿期术前';
    patientInfo.angle = document.getElementById('angle') ? document.getElementById('angle').value : '正面';
    
    console.log('病人信息已更新:', patientInfo);
    
    // 触发自定义事件，通知其他组件数据已更新
    window.dispatchEvent(new CustomEvent('patientInfoUpdated', {
        detail: { patientInfo }
    }));
    
    alert('病人信息已更新');
}

// 更新滚动条显示
function updateScrollbars() {
    // 这个函数用于在图像移动或缩放时更新滚动条显示
    // 由于当前实现没有实际的滚动条控件，这里暂时留空
    // 可以在这里添加滚动条更新逻辑，如果需要的话
}

// 调整Canvas大小
function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    if (image) {
        // 重新适配图像以适应新的画布尺寸
        fitImageToCanvas();
        drawImage();
        updateScrollbars();
    }
}

// 绘制图像
function drawImage() {
    if (!image) return;
    
    // 清空Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 计算图像绘制位置和大小
    const imgWidth = image.width * scale;
    const imgHeight = image.height * scale;
    const x = (canvas.width - imgWidth) / 2 + offsetX;
    const y = (canvas.height - imgHeight) / 2 + offsetY;
    
    // 绘制图像
    ctx.drawImage(image, x, y, imgWidth, imgHeight);
    
    // 绘制标点
    drawPoints();
}

// 绘制标点
function drawPoints() {
    if (!image) return;
    
    const imgWidth = image.width * scale;
    const imgHeight = image.height * scale;
    const x = (canvas.width - imgWidth) / 2 + offsetX;
    const y = (canvas.height - imgHeight) / 2 + offsetY;
    
    points.forEach((point, index) => {
        // 只绘制存在的点
        if (!point.exists) {
            return;
        }
        
        // 检查坐标是否有效（不是-1,-1）
        if (point.x === -1 && point.y === -1) {
            return;
        }
        
        // 计算标点在Canvas上的位置
        const canvasX = x + point.x * scale;
        const canvasY = y + point.y * scale;
        
        // 设置绘制样式
        ctx.fillStyle = index === selectedPointIndex ? '#e74c3c' : '#3498db';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        
        // 如果是选中的标点，增加外发光效果
        if (index === selectedPointIndex) {
            ctx.shadowColor = '#e74c3c';
            ctx.shadowBlur = 10;
        } else {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }
        
        // 绘制标点
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // 根据显示模式绘制标点文本
        const displayText = getPointDisplayText(point, index);
        if (displayText) {
            ctx.fillStyle = '#000000';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(displayText, canvasX + 10, canvasY - 15);
        }
    });
}

// 处理鼠标按下事件
function handleMouseDown(e) {
    if (!image) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // 检查是否点击了标点
    const clickedPoint = getPointAtPosition(mouseX, mouseY);
    if (clickedPoint !== -1) {
        // 如果启用了标点模式，允许编辑标点位置
        if (isPointMode) {
            // 更新选中标点的坐标
            updatePointPosition(clickedPoint, mouseX, mouseY);
        } else {
            // 否则仅选择标点
            selectPoint(clickedPoint);
        }
        return;
    }
    
    // 检查是否按下了中键
    if (e.button === 1) {
        isDragging = true;
        lastMouseX = mouseX;
        lastMouseY = mouseY;
        canvas.style.cursor = 'grabbing';
        return;
    }
    
    // 左键点击处理
    if (e.button === 0) {
        // 如果启用了标点模式，则添加标点
        if (isPointMode) {
            addPointAtPosition(mouseX, mouseY);
        } else {
            // 否则开始拖动平移
            isDragging = true;
            lastMouseX = mouseX;
            lastMouseY = mouseY;
            canvas.style.cursor = 'grabbing';
        }
    }
}

// 处理鼠标移动事件
function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // 更新坐标显示
    updateCoordinateDisplay(mouseX, mouseY);
    
    // 处理拖动
    if (isDragging) {
        const deltaX = mouseX - lastMouseX;
        const deltaY = mouseY - lastMouseY;
        
        offsetX += deltaX;
        offsetY += deltaY;
        
        lastMouseX = mouseX;
        lastMouseY = mouseY;
        
        drawImage();
        updateScrollbars();
    }
}

// 处理鼠标释放事件
function handleMouseUp(e) {
    if (isDragging) {
        isDragging = false;
        canvas.style.cursor = isPointMode ? 'crosshair' : 'default';
    }
}

// 处理鼠标离开事件
function handleMouseLeave() {
    if (isDragging) {
        isDragging = false;
        canvas.style.cursor = isPointMode ? 'crosshair' : 'default';
    }
}

// 处理鼠标滚轮事件 - 优化的缩放功能，防止图片"乱跑"
function handleWheel(e) {
    if (!image) return;
    
    e.preventDefault();
    
    // 计算缩放因子
    const zoomIntensity = 0.05;
    const zoomFactor = e.deltaY > 0 ? (1 - zoomIntensity) : (1 + zoomIntensity);
    const newScale = Math.max(0.1, Math.min(10, scale * zoomFactor));
    
    // 计算当前图像在画布上的位置和尺寸
    const currentImgWidth = image.width * scale;
    const currentImgHeight = image.height * scale;
    const currentImgX = (canvas.width - currentImgWidth) / 2 + offsetX;
    const currentImgY = (canvas.height - currentImgHeight) / 2 + offsetY;
    
    // 计算图像几何中心在画布上的位置
    const centerX = currentImgX + currentImgWidth / 2;
    const centerY = currentImgY + currentImgHeight / 2;
    
    // 计算缩放后的图像尺寸
    const newImgWidth = image.width * newScale;
    const newImgHeight = image.height * newScale;
    
    // 调整偏移量，使图像几何中心保持不变
    offsetX = centerX - newImgWidth / 2 - (canvas.width - newImgWidth) / 2;
    offsetY = centerY - newImgHeight / 2 - (canvas.height - newImgHeight) / 2;
    
    scale = newScale;
    
    // 添加边界检查，防止图片移出可视区域
    constrainImageToBounds();
    
    // 更新缩放显示
    document.getElementById('zoomLevel').textContent = Math.round(scale * 100);
    
    // 使用requestAnimationFrame确保流畅的动画效果
    requestAnimationFrame(() => {
        drawImage();
        updateScrollbars();
    });
}

// 获取指定位置的标点
function getPointAtPosition(x, y) {
    if (!image) return -1;
    
    const imgWidth = image.width * scale;
    const imgHeight = image.height * scale;
    const imgX = (canvas.width - imgWidth) / 2 + offsetX;
    const imgY = (canvas.height - imgHeight) / 2 + offsetY;
    
    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const pointX = imgX + point.x * scale;
        const pointY = imgY + point.y * scale;
        
        const distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
        if (distance <= 10) {
            return i;
        }
    }
    
    return -1;
}

// 在指定位置添加标点
function addPointAtPosition(x, y) {
    // 检查是否有选中的标点名称
    const selectedRow = document.querySelector('#pointsTableBody tr.selected');
    if (!selectedRow) {
        alert('请先在右侧表格中选择要标注的点');
        return;
    }
    
    const pointName = selectedRow.cells[0].textContent;
    
    // 检查该点是否已经存在
    const existingPointIndex = points.findIndex(p => p.name === pointName);
    
    // 计算图像坐标
    const imgWidth = image.width * scale;
    const imgHeight = image.height * scale;
    const imgX = (canvas.width - imgWidth) / 2 + offsetX;
    const imgY = (canvas.height - imgHeight) / 2 + offsetY;
    
    const pointX = (x - imgX) / scale;
    const pointY = (y - imgY) / scale;
    
    // 添加到撤销栈
    pushToUndoStack();
    
    if (existingPointIndex !== -1) {
        // 如果点已存在，更新其坐标和存在状态
        points[existingPointIndex].x = pointX;
        points[existingPointIndex].y = pointY;
        points[existingPointIndex].exists = true; // 确保标记为存在
        
        // 更新表格
        updatePointInTable(points[existingPointIndex]);
    } else {
        // 创建新标点
        const newPoint = {
            name: pointName,
            x: pointX,
            y: pointY,
            exists: true,
            marked_at: new Date().toISOString()
        };
        
        // 添加标点
        points.push(newPoint);
        
        // 更新表格
        updatePointInTable(newPoint);
    }
    
    // 重绘
    drawImage();
}

// 选择标点
function selectPoint(index) {
    selectedPointIndex = index;
    const point = points[index];
    
    // 更新选中点显示
    document.getElementById('selectedPoint').textContent = `当前选择: ${point.name}`;
    
    // 高亮显示选中的表格行
    highlightSelectedTableRow(point.name);
    
    // 重绘
    drawImage();
}

// 更新标点位置
function updatePointPosition(index, mouseX, mouseY) {
    // 计算图像坐标
    const imgWidth = image.width * scale;
    const imgHeight = image.height * scale;
    const imgX = (canvas.width - imgWidth) / 2 + offsetX;
    const imgY = (canvas.height - imgHeight) / 2 + offsetY;
    
    const pointX = (mouseX - imgX) / scale;
    const pointY = (mouseY - imgY) / scale;
    
    // 添加到撤销栈
    pushToUndoStack();
    
    // 更新标点坐标
    points[index].x = pointX;
    points[index].y = pointY;
    
    // 更新表格
    updatePointInTable(points[index]);
    
    // 重绘
    drawImage();
}

// 更新坐标显示
function updateCoordinateDisplay(mouseX, mouseY) {
    if (!image) return;
    
    const imgWidth = image.width * scale;
    const imgHeight = image.height * scale;
    const imgX = (canvas.width - imgWidth) / 2 + offsetX;
    const imgY = (canvas.height - imgHeight) / 2 + offsetY;
    
    // 检查鼠标是否在图像上
    if (mouseX >= imgX && mouseX <= imgX + imgWidth && 
        mouseY >= imgY && mouseY <= imgY + imgHeight) {
        
        const x = (mouseX - imgX) / scale;
        const y = (mouseY - imgY) / scale;
        document.getElementById('coordinates').textContent = `坐标: (${x.toFixed(1)}, ${y.toFixed(1)})`;
    } else {
        document.getElementById('coordinates').textContent = '坐标: (0, 0)';
    }
}

// 高亮显示选中的表格行
function highlightSelectedTableRow(pointName) {
    // 移除所有行的选中状态
    document.querySelectorAll('#pointsTableBody tr').forEach(row => {
        row.classList.remove('selected');
    });
    
    // 查找并高亮显示对应点的行
    const rows = document.querySelectorAll('#pointsTableBody tr');
    rows.forEach(row => {
        if (row.cells[0].textContent === pointName) {
            row.classList.add('selected');
        }
    });
}

// 取消标点选择状态
function clearPointSelection() {
    // 清除选中标点索引
    selectedPointIndex = -1;
    
    // 更新选中点显示
    document.getElementById('selectedPoint').textContent = '当前选择: 无';
    
    // 移除表格行的选中状态
    document.querySelectorAll('#pointsTableBody tr').forEach(row => {
        row.classList.remove('selected');
    });
}

// 处理点存在状态变化
function handlePointExistenceChange(pointName, exists) {
    // 添加到撤销栈
    pushToUndoStack();
    
    // 查找该点是否已存在
    const existingPointIndex = points.findIndex(p => p.name === pointName);
    
    if (exists) {
        // 勾选"存在"：恢复或创建点
        if (existingPointIndex !== -1) {
            // 点已存在，恢复其状态
            points[existingPointIndex].exists = true;
            // 如果坐标是(-1,-1)，则重置为默认值(0,0)
            if (points[existingPointIndex].x === -1 && points[existingPointIndex].y === -1) {
                points[existingPointIndex].x = 0;
                points[existingPointIndex].y = 0;
            }
        } else {
            // 点不存在，创建新点
            points.push({
                name: pointName,
                x: 0,
                y: 0,
                exists: true,
                marked_at: new Date().toISOString()
            });
        }
    } else {
        // 取消勾选"存在"：设置坐标为(-1,-1)并移除视觉标记
        if (existingPointIndex !== -1) {
            // 点已存在，设置不存在状态
            points[existingPointIndex].exists = false;
            points[existingPointIndex].x = -1;
            points[existingPointIndex].y = -1;
        } else {
            // 点不存在，创建不存在状态的点
            points.push({
                name: pointName,
                x: -1,
                y: -1,
                exists: false,
                marked_at: new Date().toISOString()
            });
        }
    }
    
    // 更新表格显示
    updatePointsTable();
    
    // 重绘画布（这会自动移除不存在的点的视觉标记）
    drawImage();
    
    console.log(`点"${pointName}"存在状态已更新: ${exists ? '存在' : '不存在'}`);
}

// 更新表格中的标点信息
function updatePointInTable(point) {
    const rows = document.querySelectorAll('#pointsTableBody tr');
    rows.forEach(row => {
        if (row.cells[0].textContent === point.name) {
            // 更新坐标显示
            if (point.exists) {
                row.cells[2].textContent = point.x.toFixed(1);
                row.cells[3].textContent = point.y.toFixed(1);
            } else {
                row.cells[2].textContent = '不存在';
                row.cells[3].textContent = '不存在';
            }
            
            // 更新复选框状态
            const checkbox = row.cells[1].querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.checked = point.exists;
            }
            
            // 更新行的视觉样式
            if (!point.exists) {
                row.classList.add('point-not-exists');
            } else {
                row.classList.remove('point-not-exists');
            }
        }
    });
}

// 更新标点表格
function updatePointsTable() {
    const tbody = document.getElementById('pointsTableBody');
    tbody.innerHTML = '';
    
    pointNames.forEach(pointName => {
        const row = document.createElement('tr');
        
        // 标点名称
        const nameCell = document.createElement('td');
        nameCell.textContent = pointName;
        row.appendChild(nameCell);
        
        // 存在复选框
        const existsCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.addEventListener('change', (e) => {
            handlePointExistenceChange(pointName, e.target.checked);
        });
        existsCell.appendChild(checkbox);
        row.appendChild(existsCell);
        
        // X坐标
        const xCell = document.createElement('td');
        xCell.textContent = '0.0';
        row.appendChild(xCell);
        
        // Y坐标
        const yCell = document.createElement('td');
        yCell.textContent = '0.0';
        row.appendChild(yCell);
        
        // 点击行选择标点
        row.addEventListener('click', () => {
            // 移除其他行的选中状态
            document.querySelectorAll('#pointsTableBody tr').forEach(r => {
                r.classList.remove('selected');
            });
            // 添加当前行的选中状态
            row.classList.add('selected');
        });
        
        tbody.appendChild(row);
    });
    
    // 初始化表格显示
    points.forEach(point => updatePointInTable(point));
}

// 保存图片文件
function saveImageFile() {
    if (!image || !patientInfo.patientId) {
        alert('请先加载图像并填写病人信息');
        return false;
    }
    
    // 获取原始图片文件
    const fileInput = document.getElementById('fileInput');
    const currentFile = fileInput.files[0];
    
    if (!currentFile) {
        alert('无法获取原始图片文件');
        return false;
    }
    
    // 生成统一格式的文件名：病历号_拍摄时期_拍摄角度
    const fileName = `${patientInfo.patientId}_${patientInfo.phase}_${patientInfo.angle}`;
    
    // 获取文件扩展名
    const fileExtension = currentFile.name.split('.').pop();
    const imageFileName = `${fileName}.${fileExtension}`;
    
    // 创建下载链接
    const url = URL.createObjectURL(currentFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = imageFileName;
    
    // 触发下载
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // 释放URL对象
    URL.revokeObjectURL(url);
    
    return true;
}

// 导出标注数据
function exportAnnotation() {
    // 检查病历号是否存在
    if (!patientInfo.patientId || patientInfo.patientId.trim() === '') {
        // 尝试自动填充病历号
        const mainPatientIdInput = document.getElementById('patientId');
        if (mainPatientIdInput && mainPatientIdInput.value.trim()) {
            patientInfo.patientId = mainPatientIdInput.value.trim();
            console.log('从主界面自动获取病历号:', patientInfo.patientId);
        } else {
            // 如果没有病历号，提示用户输入
            const modalPatientIdInput = document.getElementById('modalPatientId');
            if (modalPatientIdInput && modalPatientIdInput.value.trim()) {
                patientInfo.patientId = modalPatientIdInput.value.trim();
                console.log('从模态框自动获取病历号:', patientInfo.patientId);
            } else {
                alert('请先在病人信息区域或图片信息弹窗中输入病历号');
                return;
            }
        }
    }
    
    if (!image) {
        alert('请先上传图片');
        return;
    }
    
    // 准备导出数据 - 包含所有标点列表项，使用统一标准格式
    const allPointsData = pointNames.map((pointName, index) => {
        // 查找当前标点是否已标记
        const existingPoint = points.find(point => point.name === pointName);
        
        if (existingPoint) {
            // 已标记的点：根据实际存在状态记录
            return {
                id: index, // 从0开始的排序序号
                name: pointName,
                exists: existingPoint.exists, // 正确保存点的实际存在状态
                x: existingPoint.x,
                y: existingPoint.y
            };
        } else {
            // 未标记的点：明确记录为"不存在"状态，坐标设置为(-1, -1)
            return {
                id: index, // 从0开始的排序序号
                name: pointName,
                exists: false,
                x: -1,
                y: -1
            };
        }
    });
    
    // 获取图片文件信息（如果可用）
    const fileInput = document.getElementById('fileInput');
    const currentFile = fileInput.files[0];
    
    // 准备完整的图片信息
    const imageInfo = {
        width: image.width,
        height: image.height,
        original_width: image.naturalWidth || image.width,
        original_height: image.naturalHeight || image.height,
        format: currentFile ? currentFile.type : 'unknown',
        file_name: currentFile ? currentFile.name : 'unknown',
        file_size: currentFile ? currentFile.size : 0,
        resolution: `${image.width} x ${image.height} pixels`,
        aspect_ratio: (image.width / image.height).toFixed(3),
        dpi: 72, // 默认DPI，实际应用中可能需要从EXIF数据获取
        color_depth: 24, // 默认24位色深
        compression: 'none', // 默认无压缩
        orientation: 'landscape' // 根据宽高比判断方向
    };
    
    // 准备完整的导出数据
    const annotationData = {
        // 病人信息
        patient_info: {
            patient_id: patientInfo.patientId,
            phase: patientInfo.phase,
            angle: patientInfo.angle
        },
        
        // 图片信息
        image_info: imageInfo,
        
        // 标点数据
        points: allPointsData,
        
        // 系统信息
        system_info: {
            timestamp: new Date().toISOString(),
            version: '1.0',
            software: '医学图像标点标注系统'
        },
        
        // 统计信息
        statistics: {
            total_points: pointNames.length,
            marked_points: points.length,
            unmarked_points: pointNames.length - points.length,
            marking_ratio: (points.length / pointNames.length).toFixed(3)
        }
    };
    
    // 转换为JSON字符串
    const jsonString = JSON.stringify(annotationData, null, 2);
    
    // 生成统一格式的文件名：病历号_拍摄时期_拍摄角度
    const fileName = `${patientInfo.patientId}_${patientInfo.phase}_${patientInfo.angle}`;
    const jsonFileName = `${fileName}.json`;
    
    // 创建下载链接
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = jsonFileName;
    
    // 触发下载
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // 释放URL对象
    URL.revokeObjectURL(url);
    
    // 显示导出成功信息
    alert(`导出成功！\n总标点数: ${pointNames.length}\n已标记: ${points.length}\n未标记: ${pointNames.length - points.length}`);
}

// 同时保存图片和JSON文件
function saveBothFiles() {
    // 检查病历号是否存在
    if (!patientInfo.patientId || patientInfo.patientId.trim() === '') {
        // 尝试自动填充病历号
        const mainPatientIdInput = document.getElementById('patientId');
        if (mainPatientIdInput && mainPatientIdInput.value.trim()) {
            patientInfo.patientId = mainPatientIdInput.value.trim();
            console.log('从主界面自动获取病历号:', patientInfo.patientId);
        } else {
            // 如果没有病历号，提示用户输入
            const modalPatientIdInput = document.getElementById('modalPatientId');
            if (modalPatientIdInput && modalPatientIdInput.value.trim()) {
                patientInfo.patientId = modalPatientIdInput.value.trim();
                console.log('从模态框自动获取病历号:', patientInfo.patientId);
            } else {
                alert('请先在病人信息区域或图片信息弹窗中输入病历号');
                return;
            }
        }
    }
    
    if (!image) {
        alert('请先上传图片');
        return;
    }
    
    // 保存图片文件
    const imageSaved = saveImageFile();
    
    if (imageSaved) {
        // 延迟一小段时间后保存JSON文件，确保浏览器下载队列处理正常
        setTimeout(() => {
            exportAnnotation(); // 你原有：本地导出JSON
            uploadToServer();   // 新增：自动上传到服务器（不影响原有逻辑）
        }, 500);
    } else {
        alert('图片文件保存失败，JSON文件未保存');
    }
}

// 处理键盘快捷键
function handleKeyDown(e) {
    // Ctrl+Z: 撤销
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
    }
    
    // Ctrl+Y: 重做
    if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redo();
    }
}

// 撤销操作
function undo() {
    if (undoStack.length === 0) return;
    
    // 保存当前状态到重做栈
    redoStack.push(JSON.stringify(points));
    
    // 恢复上一个状态
    const lastState = undoStack.pop();
    points = JSON.parse(lastState);
    
    // 更新界面
    updatePointsTable();
    points.forEach(updatePointInTable);
    drawImage();
    
    // 清除选择
    clearPointSelection();
}

// 重做操作
function redo() {
    if (redoStack.length === 0) return;
    
    // 保存当前状态到撤销栈
    undoStack.push(JSON.stringify(points));
    
    // 恢复下一个状态
    const nextState = redoStack.pop();
    points = JSON.parse(nextState);
    
    // 更新界面
    updatePointsTable();
    points.forEach(updatePointInTable);
    drawImage();
    
    // 清除选择
    clearPointSelection();
}

// 将当前状态推入撤销栈
function pushToUndoStack() {
    undoStack.push(JSON.stringify(points));
    redoStack = []; // 清空重做栈
    
    // 限制撤销栈大小
    if (undoStack.length > 20) {
        undoStack.shift();
    }
}

// 清除图像
function clearImage() {
    image = null;
    scale = 1.0;
    offsetX = 0;
    offsetY = 0;
    points = [];
    selectedPointIndex = -1;
    
    // 清空Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 重置界面
    document.getElementById('zoomLevel').textContent = '100';
    document.getElementById('coordinates').textContent = '坐标: (0, 0)';
    document.getElementById('selectedPoint').textContent = '当前选择: 无';
    
    // 清空表格中的坐标
    updatePointsTable();
}

// 清除当前界面中已存在的信息数据，但保留标点任务列表结构（用于新图像加载前的清理）
function clearCurrentData() {
    console.log('开始清除当前界面中的信息数据，保留标点任务列表结构');
    
    // 保留标点任务列表结构，但将每个点的坐标和状态恢复到默认值
    if (points && points.length > 0) {
        points.forEach(point => {
            // 重置坐标到默认值 (-1, -1)
            point.x = 0;
            point.y = 0;
            
            // 重置存在状态为默认值 (true - 存在)
            point.exists = true;
            
            console.log(`重置点 ${point.name} 的坐标和状态到默认值`);
        });
        
        // 更新表格显示，反映重置后的状态
        updatePointsTable();
    }
    
    // 清除患者信息
    patientInfo = {
        patientId: '',
        phase: '幼儿期术前',
        angle: '正面'
    };
    
    // 清除表单数据
    const patientIdInput = document.getElementById('patientId');
    const phaseSelect = document.getElementById('phase');
    const angleSelect = document.getElementById('angle');
    
    if (patientIdInput) patientIdInput.value = '';
    if (phaseSelect) phaseSelect.value = '幼儿期术前';
    if (angleSelect) angleSelect.value = '正面';
    
    // 清除选中状态
    selectedPointIndex = -1;
    
    // 清除画布上的视觉标记（重新绘制）
    if (image) {
        drawImage();
    }
    
    console.log('当前界面信息数据已清除完成，标点任务列表结构已保留');
}



// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    init();
    // 初始化标点模式按钮状态
    const pointModeBtn = document.getElementById('pointModeBtn');
    pointModeBtn.classList.add('btn-secondary');
    pointModeBtn.textContent = '标点模式';
    
    // 初始化病人信息显示
    updatePatientInfoDisplay();
    
    // 添加全局事件监听器，确保数据同步
    window.addEventListener('patientInfoUpdated', function(e) {
        console.log('收到病人信息更新事件:', e.detail);
        updatePatientInfoDisplay();
    });
});

// 添加边界检查函数，防止图片移出可视区域
function constrainImageToBounds() {
    if (!image || !canvas) return;
    
    // 计算当前图像尺寸
    const imgWidth = image.width * scale;
    const imgHeight = image.height * scale;
    
    // 计算图像在画布上的位置
    const imgX = (canvas.width - imgWidth) / 2 + offsetX;
    const imgY = (canvas.height - imgHeight) / 2 + offsetY;
    
    // 计算图像右下角位置
    const imgRight = imgX + imgWidth;
    const imgBottom = imgY + imgHeight;
    
    // 边界检查和调整
    // 只有当图像尺寸小于画布尺寸时才进行边界约束
    if (imgWidth < canvas.width) {
        // 水平方向居中对齐
        offsetX = 0;
    } else {
        // 防止图像水平方向移出可视区域
        if (imgX > 0) offsetX -= imgX;
        if (imgRight < canvas.width) offsetX += (canvas.width - imgRight);
    }
    
    if (imgHeight < canvas.height) {
        // 垂直方向居中对齐
        offsetY = 0;
    } else {
        // 防止图像垂直方向移出可视区域
        if (imgY > 0) offsetY -= imgY;
        if (imgBottom < canvas.height) offsetY += (canvas.height - imgBottom);
    }
}

// 实现平滑缩放动画效果
function smoothZoom(targetScale, targetOffsetX, targetOffsetY, duration = 200) {
    const startScale = scale;
    const startOffsetX = offsetX;
    const startOffsetY = offsetY;
    const startTime = performance.now();
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // 使用缓动函数使动画更自然
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        // 插值计算当前的scale和offset
        scale = startScale + (targetScale - startScale) * easeProgress;
        offsetX = startOffsetX + (targetOffsetX - startOffsetX) * easeProgress;
        offsetY = startOffsetY + (targetOffsetY - startOffsetY) * easeProgress;
        
        // 更新显示和重绘
        document.getElementById('zoomLevel').textContent = Math.round(scale * 100);
        drawImage();
        updateScrollbars();
        
        // 如果动画完成，执行边界检查
        if (progress >= 1) {
            constrainImageToBounds();
            // 最后一次重绘以确保边界约束生效
            drawImage();
            updateScrollbars();
        }
        // 如果动画未完成，继续下一帧
        else {
            requestAnimationFrame(animate);
        }
    }
    
    requestAnimationFrame(animate);
}

// 缩放控制函数 - 优化的缩放功能，防止图片"乱跑"
function zoomIn() {
    if (!image) return;
    
    // 计算当前图像在画布上的位置和尺寸
    const currentImgWidth = image.width * scale;
    const currentImgHeight = image.height * scale;
    const currentImgX = (canvas.width - currentImgWidth) / 2 + offsetX;
    const currentImgY = (canvas.height - currentImgHeight) / 2 + offsetY;
    
    // 计算图像几何中心在画布上的位置
    const centerX = currentImgX + currentImgWidth / 2;
    const centerY = currentImgY + currentImgHeight / 2;
    
    // 计算新的缩放比例
    const newScale = Math.max(0.1, Math.min(10, scale * 1.1));
    
    // 计算缩放后的图像尺寸
    const newImgWidth = image.width * newScale;
    const newImgHeight = image.height * newScale;
    
    // 调整偏移量，使图像几何中心保持不变
    const targetOffsetX = centerX - newImgWidth / 2 - (canvas.width - newImgWidth) / 2;
    const targetOffsetY = centerY - newImgHeight / 2 - (canvas.height - newImgHeight) / 2;
    
    // 使用平滑动画进行缩放
    smoothZoom(newScale, targetOffsetX, targetOffsetY);
}

function zoomOut() {
    if (!image) return;
    
    // 计算当前图像在画布上的位置和尺寸
    const currentImgWidth = image.width * scale;
    const currentImgHeight = image.height * scale;
    const currentImgX = (canvas.width - currentImgWidth) / 2 + offsetX;
    const currentImgY = (canvas.height - currentImgHeight) / 2 + offsetY;
    
    // 计算图像几何中心在画布上的位置
    const centerX = currentImgX + currentImgWidth / 2;
    const centerY = currentImgY + currentImgHeight / 2;
    
    // 计算新的缩放比例
    const newScale = Math.max(0.1, Math.min(10, scale * 0.9));
    
    // 计算缩放后的图像尺寸
    const newImgWidth = image.width * newScale;
    const newImgHeight = image.height * newScale;
    
    // 调整偏移量，使图像几何中心保持不变
    const targetOffsetX = centerX - newImgWidth / 2 - (canvas.width - newImgWidth) / 2;
    const targetOffsetY = centerY - newImgHeight / 2 - (canvas.height - newImgHeight) / 2;
    
    // 使用平滑动画进行缩放
    smoothZoom(newScale, targetOffsetX, targetOffsetY);
}

function resetZoom() {
    if (!image) return;
    
    // 使用智能适配函数重置缩放
    fitImageToCanvas();
    
    // 更新缩放显示
    document.getElementById('zoomLevel').textContent = Math.round(scale * 100);
    
    // 重绘图像
    drawImage();
    updateScrollbars();
}

// 导入标注数据函数
function importAnnotation(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('开始导入标注文件:', file.name);
    
    // 显示导入进度
    showImportProgress('正在读取文件...');
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            showImportProgress('正在解析JSON数据...');
            
            // 解析JSON数据
            const jsonData = JSON.parse(e.target.result);
            
            // 验证文件格式
            if (!validateImportFormat(jsonData)) {
                hideImportProgress();
                return;
            }
            
            showImportProgress('正在恢复标注数据...');
            
            // 恢复标注数据
            restoreAnnotationData(jsonData);
            
            hideImportProgress();
            alert('标注导入成功！\\n总标点数: ' + jsonData.points.length + '\\n已标记: ' + jsonData.statistics.marked_points);
            
        } catch (error) {
            hideImportProgress();
            console.error('JSON导入错误:', error);
            alert('导入失败：' + error.message);
        }
    };
    
    reader.onerror = function() {
        hideImportProgress();
        alert('文件读取失败，请检查文件是否损坏或格式是否正确。');
    };
    
    reader.readAsText(file);
}

// 验证导入文件格式
function validateImportFormat(data) {
    // 检查顶层结构
    const requiredTopLevelFields = ['patient_info', 'image_info', 'points', 'system_info', 'statistics'];
    const missingTopLevelFields = requiredTopLevelFields.filter(field => !data.hasOwnProperty(field));
    
    if (missingTopLevelFields.length > 0) {
        alert('文件格式错误：缺少必要的字段 - ' + missingTopLevelFields.join(', '));
        return false;
    }
    
    // 检查病人信息
    if (!data.patient_info.patient_id || typeof data.patient_info.patient_id !== 'string') {
        alert('文件格式错误：病人信息中的patient_id字段无效');
        return false;
    }
    
    // 检查标点数据
    if (!Array.isArray(data.points)) {
        alert('文件格式错误：points字段必须是数组');
        return false;
    }
    
    // 检查每个标点的数据结构
    for (let i = 0; i < data.points.length; i++) {
        const point = data.points[i];
        const requiredPointFields = ['id', 'name', 'exists', 'x', 'y'];
        const missingFields = requiredPointFields.filter(field => !point.hasOwnProperty(field));
        
        if (missingFields.length > 0) {
            alert(`文件格式错误：第 ${i} 个标点缺少字段 - ${missingFields.join(', ')}`);
            return false;
        }
        
        // 验证坐标格式
        if (typeof point.x !== 'number' || typeof point.y !== 'number') {
            alert(`文件格式错误：第 ${i} 个标点坐标格式不正确`);
            return false;
        }
        
        // 验证未标记点的坐标
        if (!point.exists && (point.x !== -1 || point.y !== -1)) {
            alert(`文件格式错误：第 ${i} 个标点未标记但坐标不是(-1, -1)`);
            return false;
        }
    }
    
    return true;
}

// 恢复标注数据
function restoreAnnotationData(data) {
    // 恢复病人信息
    patientInfo = {
        patientId: data.patient_info.patient_id,
        phase: data.patient_info.phase,
        angle: data.patient_info.angle
    };
    
    // 更新界面上的病人信息
    const patientIdInput = document.getElementById('patientId');
    const phaseSelect = document.getElementById('phase');
    const angleSelect = document.getElementById('angle');
    
    if (patientIdInput) patientIdInput.value = patientInfo.patientId;
    if (phaseSelect) phaseSelect.value = patientInfo.phase;
    if (angleSelect) angleSelect.value = patientInfo.angle;
    
    // 清空当前标点数据
    points = [];
    
    // 恢复标点数据 - 恢复所有点，包括存在状态
    data.points.forEach(point => {
        points.push({
            name: point.name,
            x: point.x,
            y: point.y,
            exists: point.exists, // 正确恢复存在状态
            marked_at: point.marked_at || new Date().toISOString() // 恢复标记时间或使用当前时间
        });
    });
    
    // 更新标点表格
    updatePointsTable();
    points.forEach(updatePointInTable);
    
    // 重绘画布
    if (image) {
        drawImage();
    }
    
    console.log('标注数据恢复完成，共恢复', points.length, '个标点');
}

// 显示导入进度
function showImportProgress(message) {
    // 创建或获取进度提示元素
    let progressElement = document.getElementById('importProgress');
    if (!progressElement) {
        progressElement = document.createElement('div');
        progressElement.id = 'importProgress';
        progressElement.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px 30px;
            border-radius: 8px;
            z-index: 1000;
            font-size: 16px;
        `;
        document.body.appendChild(progressElement);
    }
    
    progressElement.textContent = message;
    progressElement.style.display = 'block';
}

// 隐藏导入进度
function hideImportProgress() {
    const progressElement = document.getElementById('importProgress');
    if (progressElement) {
        progressElement.style.display = 'none';
    }
}

// 生成标注数据（全局函数）
function generateAnnotationData() {
    let patientId = patientInfo.patientId.trim();
    if (!patientId) {
        patientId = dom.patientIdInput?.value.trim() || '';
    }
    const allPointsData = pointNames.map((pointName, index) => {
        const existingPoint = points.find(point => point.name === pointName);
        if (existingPoint) {
            return {id: index, name: pointName, exists: existingPoint.exists, x: existingPoint.x, y: existingPoint.y};
        } else {
            return {id: index, name: pointName, exists: false, x: -1, y: -1};
        }
    });
    const currentFile = dom.fileInput?.files[0];
    const imageInfo = {
        width: image.width, height: image.height,
        original_width: image.naturalWidth || image.width,
        original_height: image.naturalHeight || image.height,
        format: currentFile ? currentFile.type : 'unknown',
        file_name: currentFile ? currentFile.name : 'unknown',
        file_size: currentFile ? currentFile.size : 0
    };
    return {
        patient_info: {patient_id: patientId, phase: patientInfo.phase, angle: patientInfo.angle},
        image_info: imageInfo, points: allPointsData
    };
}

// 上传函数（全局函数，简化版，仅保留核心）
async function uploadToServer() {
    try {
        console.log('===== uploadToServer函数已触发 =====');
        
        let patientId = patientInfo.patientId.trim() || dom.patientIdInput?.value.trim();
        if (!patientId) {alert('请填病人ID'); return false;}
        if (!image) {alert('请上传图片'); return false;}
        
        const phase = document.getElementById('modalPhase').value; // 比如前端阶段下拉框ID是modalPhase
        const angle = document.getElementById('modalAngle').value; // 比如前端角度下拉框ID是modalAngle
        
        // 新增：打印所有参数到控制台
        console.log('===== 准备传递的参数 =====');
        console.log('病人ID：', patientId);
        console.log('阶段：', phase); // 看这里是否是你选择的值（比如“儿童期术后”）
        console.log('角度：', angle); // 看这里是否是你选择的值（比如“左侧面”）
        console.log('是否为空：', phase === '' || angle === '');

        
        const formData = new FormData();
        formData.append('patientId', patientId);
        formData.append('phase', phase); // 传递选择的阶段
        formData.append('angle', angle); // 传递选择的角度
        formData.append('image', dom.fileInput.files[0]);
        formData.append('annotationJson', new Blob([JSON.stringify(generateAnnotationData())], {type: 'application/json'}), `${patientId}.json`);
        
        const response = await fetch('../save_annotation.php', {method: 'POST', body: formData});
        const result = await response.json();
        alert(result.success ? '上传成功' : '上传失败：' + result.msg);
    } catch (e) {
        alert('上传出错：' + e.message);
    }
}
// 测试代码：确认函数加载
console.log('generateAnnotationData:', typeof generateAnnotationData);
console.log('uploadToServer:', typeof uploadToServer);