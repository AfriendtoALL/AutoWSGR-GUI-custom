"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.localSitePackages = localSitePackages;
exports.pipEnv = pipEnv;
exports.ensureSslCertForPython = ensureSslCertForPython;
exports.isLocalPython = isLocalPython;
exports.ensurePthFile = ensurePthFile;
exports.ensurePip = ensurePip;
/**
 * 路径、环境工具函数与共享接口。
 */
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const context_1 = require("./context");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const CERT_ENV_KEYS = [
    'SSL_CERT_FILE',
    'REQUESTS_CA_BUNDLE',
    'PIP_CERT',
    'CURL_CA_BUNDLE',
];
const certFileCache = new Map();
// 路径工具
/** 返回项目本地包目录。 */
function localSitePackages() {
    return path.join((0, context_1.getCtx)().appRoot(), 'python', 'site-packages');
}
/** 构造优先使用项目包目录的 pip 环境。 */
function pipEnv() {
    const localSite = localSitePackages();
    const existing = process.env.PYTHONPATH || '';
    return {
        ...process.env,
        PYTHONUSERBASE: path.join((0, context_1.getCtx)().appRoot(), 'python'),
        PYTHONPATH: existing
            ? `${localSite}${path.delimiter}${existing}`
            : localSite,
    };
}
function isExistingFile(filePath) {
    return !!filePath && fs.existsSync(filePath);
}
function pickExistingCertFromEnv() {
    for (const key of CERT_ENV_KEYS) {
        const value = process.env[key];
        if (isExistingFile(value))
            return value;
    }
    return null;
}
function scriptPathForProbe() {
    const token = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return path.join((0, context_1.getCtx)().getTempDir(), `autowsgr_cert_probe_${token}.py`);
}
async function probePythonCertFile(pythonCmd) {
    const cached = certFileCache.get(pythonCmd);
    if (cached !== undefined)
        return cached;
    const scriptPath = scriptPathForProbe();
    const scriptContent = [
        'import json, os, ssl',
        'candidates = []',
        'for k in ["SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "PIP_CERT", "CURL_CA_BUNDLE"]:',
        '    p = os.environ.get(k)',
        '    if p: candidates.append(p)',
        'try:',
        '    dv = ssl.get_default_verify_paths()',
        '    for p in [dv.cafile, dv.openssl_cafile]:',
        '        if p: candidates.append(p)',
        'except Exception:',
        '    pass',
        'try:',
        '    import certifi',
        '    candidates.append(certifi.where())',
        'except Exception:',
        '    pass',
        'try:',
        '    import pip._vendor.certifi as pip_certifi',
        '    candidates.append(pip_certifi.where())',
        'except Exception:',
        '    pass',
        'resolved = None',
        'for p in candidates:',
        '    if p and os.path.exists(p):',
        '        resolved = p',
        '        break',
        'print(json.dumps({"cert_file": resolved}))',
    ].join('\n');
    try {
        fs.writeFileSync(scriptPath, scriptContent, 'utf-8');
        const { stdout } = await execAsync(`"${pythonCmd}" "${scriptPath}"`, {
            windowsHide: true,
            timeout: 12000,
            env: {
                ...process.env,
                PYTHONUTF8: '1',
                PYTHONIOENCODING: 'utf-8',
            },
        });
        const parsed = JSON.parse(stdout.trim());
        const certFile = typeof parsed.cert_file === 'string' ? parsed.cert_file.trim() : '';
        if (isExistingFile(certFile)) {
            certFileCache.set(pythonCmd, certFile);
            return certFile;
        }
    }
    catch {
        // 探测失败时由调用方继续使用原环境。
    }
    finally {
        try {
            fs.unlinkSync(scriptPath);
        }
        catch { /* 忽略清理失败。 */ }
    }
    certFileCache.set(pythonCmd, null);
    return null;
}
/** 沿用或探测证书，并补齐 Python TLS 环境变量。 */
async function ensureSslCertForPython(pythonCmd) {
    const existing = pickExistingCertFromEnv();
    const certFile = existing || await probePythonCertFile(pythonCmd);
    if (!certFile)
        return null;
    if (!isExistingFile(process.env.SSL_CERT_FILE))
        process.env.SSL_CERT_FILE = certFile;
    if (!isExistingFile(process.env.REQUESTS_CA_BUNDLE))
        process.env.REQUESTS_CA_BUNDLE = certFile;
    if (!isExistingFile(process.env.PIP_CERT))
        process.env.PIP_CERT = certFile;
    if (!isExistingFile(process.env.CURL_CA_BUNDLE))
        process.env.CURL_CA_BUNDLE = certFile;
    return certFile;
}
/** 判断是否使用本地便携版 Python。 */
function isLocalPython(pythonCmd) {
    if (!path.isAbsolute(pythonCmd))
        return false;
    const pythonRoot = path.resolve((0, context_1.getCtx)().appRoot(), 'python');
    const relative = path.relative(pythonRoot, path.resolve(pythonCmd));
    return relative !== ''
        && relative !== '..'
        && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative);
}
// ._pth 配置
/** 确保嵌入式 Python 的 ._pth 包含 site-packages。 */
function ensurePthFile() {
    const pythonDir = path.join((0, context_1.getCtx)().appRoot(), 'python');
    for (const pthName of ['python312._pth', 'python313._pth']) {
        const pthFile = path.join(pythonDir, pthName);
        if (!fs.existsSync(pthFile))
            continue;
        let content = fs.readFileSync(pthFile, 'utf-8');
        let changed = false;
        // 去除可能存在的 BOM。
        if (content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
            changed = true;
        }
        if (/^#\s*import site/m.test(content)) {
            content = content.replace(/^#\s*import site/m, 'import site');
            changed = true;
        }
        if (!content.includes('site-packages')) {
            content = content.trimEnd() + '\nsite-packages\n';
            changed = true;
        }
        if (changed)
            fs.writeFileSync(pthFile, content, 'utf-8');
    }
}
// pip 管理
/** 确保 pip 可用，缺失时自动安装。 */
async function ensurePip(pythonCmd) {
    const ctx = (0, context_1.getCtx)();
    try {
        await execAsync(`"${pythonCmd}" -m pip --version`, { windowsHide: true, timeout: 15000 });
        return true;
    }
    catch { /* pip 不可用时继续安装。 */ }
    if (isLocalPython(pythonCmd))
        ensurePthFile();
    ctx.sendProgress('pip 未就绪，正在安装…');
    const getPipPath = path.join(ctx.getTempDir(), 'get-pip.py');
    try {
        await execAsync(`curl -sSL -o "${getPipPath}" "https://bootstrap.pypa.io/get-pip.py"`, { windowsHide: true, timeout: 60000 });
        await execAsync(`"${pythonCmd}" "${getPipPath}"`, { windowsHide: true, timeout: 120000 });
        try {
            fs.unlinkSync(getPipPath);
        }
        catch { /* 忽略清理失败。 */ }
        ctx.sendProgress('pip 安装完成 ✓');
        return true;
    }
    catch {
        ctx.sendProgress('ERROR pip 安装失败');
        try {
            fs.unlinkSync(getPipPath);
        }
        catch { /* 忽略清理失败。 */ }
        return false;
    }
}
