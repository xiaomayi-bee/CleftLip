// 日志记录函数
function logInfo(message) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
}

function logError(message, error) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
}

// DOM元素
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorBanner = document.getElementById('errorBanner');
const errorText = document.getElementById('errorText');
const usernameError = document.getElementById('usernameError');
const passwordError = document.getElementById('passwordError');

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    try {
        logInfo('登录页面初始化开始');
        
        // 检查是否已登录
        checkLoginStatus();
        
        // 绑定事件监听器
        bindEventListeners();
        
        logInfo('登录页面初始化完成');
    } catch (error) {
        logError('登录页面初始化时出错:', error);
        showError('页面初始化失败，请刷新页面重试');
    }
});

// 检查登录状态
function checkLoginStatus() {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');
    
    if (token && user) {
        logInfo('用户已登录，跳转到主页');
        window.location.href = '/index.html';
    }
}

// 绑定事件监听器
function bindEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
    
    // 输入框获得焦点时清除错误提示
    usernameInput.addEventListener('focus', () => {
        clearFieldError(usernameInput, usernameError);
        hideErrorBanner();
    });
    
    passwordInput.addEventListener('focus', () => {
        clearFieldError(passwordInput, passwordError);
        hideErrorBanner();
    });
    
    // 输入框失去焦点时进行验证
    usernameInput.addEventListener('blur', () => {
        validateUsername();
    });
    
    passwordInput.addEventListener('blur', () => {
        validatePassword();
    });
}

// 处理登录
async function handleLogin(event) {
    event.preventDefault();
    
    try {
        // 清除之前的错误信息
        hideErrorBanner();
        
        // 验证表单
        if (!validateForm()) {
            return;
        }
        
        // 获取表单数据
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        
        logInfo(`用户 ${username} 尝试登录`);
        
        // 显示加载状态
        setLoading(true);
        
        // 发送登录请求
        let response;
        try {
            response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
        } catch (networkError) {
            if (networkError.name === 'TypeError' && networkError.message.includes('fetch')) {
                showError('网络连接失败，请检查网络连接后重试');
                return;
            }
            throw networkError;
        }
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            logInfo('登录成功');
            
            // 保存登录信息
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            
            // 跳转到主页
            window.location.href = '/index.html';
        } else {
            logError('登录失败:', data.message);
            showError(data.message || '登录失败，请检查用户名和密码');
        }
    } catch (error) {
        logError('登录请求失败:', error);
        showError('服务器错误，请稍后重试');
    } finally {
        setLoading(false);
    }
}

// 验证表单
function validateForm() {
    const isUsernameValid = validateUsername();
    const isPasswordValid = validatePassword();
    
    return isUsernameValid && isPasswordValid;
}

// 验证用户名
function validateUsername() {
    const username = usernameInput.value.trim();
    
    if (!username) {
        showFieldError(usernameInput, usernameError, '请输入用户名');
        return false;
    }
    
    if (username.length < 2) {
        showFieldError(usernameInput, usernameError, '用户名至少需要2个字符');
        return false;
    }
    
    if (username.length > 20) {
        showFieldError(usernameInput, usernameError, '用户名不能超过20个字符');
        return false;
    }
    
    clearFieldError(usernameInput, usernameError);
    return true;
}

// 验证密码
function validatePassword() {
    const password = passwordInput.value;
    
    if (!password) {
        showFieldError(passwordInput, passwordError, '请输入密码');
        return false;
    }
    
    if (password.length < 4) {
        showFieldError(passwordInput, passwordError, '密码至少需要4个字符');
        return false;
    }
    
    clearFieldError(passwordInput, passwordError);
    return true;
}

// 显示字段错误
function showFieldError(input, errorElement, message) {
    input.classList.add('error');
    errorElement.textContent = message;
}

// 清除字段错误
function clearFieldError(input, errorElement) {
    input.classList.remove('error');
    errorElement.textContent = '';
}

// 显示错误横幅
function showError(message) {
    errorText.textContent = message;
    errorBanner.style.display = 'flex';
}

// 隐藏错误横幅
function hideErrorBanner() {
    errorBanner.style.display = 'none';
}

// 设置加载状态
function setLoading(loading) {
    loginBtn.disabled = loading;
    
    if (loading) {
        loginBtn.classList.add('loading');
    } else {
        loginBtn.classList.remove('loading');
    }
}
