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
exports.buildBackendRuntimeInstallArgs = buildBackendRuntimeInstallArgs;
exports.buildRequirementProbeScript = buildRequirementProbeScript;
exports.buildManagedAutowsgrUpdateArgs = buildManagedAutowsgrUpdateArgs;
exports.verifyBackendRuntimeContract = verifyBackendRuntimeContract;
exports.installBackendArchive = installBackendArchive;
exports.autoUpdateAutowsgr = autoUpdateAutowsgr;
/**
 * 通过依赖注入检查并更新 autowsgr。
 */
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const backendContractProbe_1 = require("./backendContractProbe");
const dependencies_1 = require("./dependencies");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const BACKEND_BUILD_REQUIREMENTS = ['hatchling', 'hatch-vcs'];
/** 生成依赖安装参数，调用方只传入检查后确认需要处理的包。 */
function buildBackendRuntimeInstallArgs(targetDir, requirements = dependencies_1.BACKEND_RUNTIME_REQUIREMENTS) {
    return [
        '-m', 'pip', 'install',
        '--upgrade',
        '--target', targetDir,
        '--no-deps',
        '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple',
        '--trusted-host', 'pypi.tuna.tsinghua.edu.cn',
        ...requirements,
    ];
}
/** 元数据探测失败时才使用 pip 自身的完整依赖解析。 */
function buildRequirementFallbackArgs(targetDir, requirements) {
    return [
        '-m', 'pip', 'install',
        '--upgrade',
        '--upgrade-strategy', 'only-if-needed',
        '--target', targetDir,
        '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple',
        '--trusted-host', 'pypi.tuna.tsinghua.edu.cn',
        ...requirements,
    ];
}
/** 生成依赖版本探测脚本，递归检查传递依赖和 extras。 */
function buildRequirementProbeScript(targetDir, requirements, includeBackendRequirements = false) {
    return [
        'import json, sys',
        'from importlib import metadata',
        'from pip._vendor.packaging.requirements import Requirement',
        `sys.path.insert(0, ${JSON.stringify(targetDir)})`,
        `roots = ${JSON.stringify(requirements)}`,
        ...(includeBackendRequirements
            ? [
                'try:',
                '    roots.extend(metadata.distribution("autowsgr").requires or [])',
                'except metadata.PackageNotFoundError:',
                '    pass',
            ]
            : []),
        'unsatisfied = []',
        'visited = set()',
        'def applies(requirement, active_extras):',
        '    if requirement.marker is None:',
        '        return True',
        '    environments = [{"extra": ""}]',
        '    environments.extend({"extra": extra} for extra in active_extras)',
        '    return any(requirement.marker.evaluate(env) for env in environments)',
        'def install_text(requirement):',
        '    extras = ""',
        '    if requirement.extras:',
        '        extras = "[" + ",".join(sorted(requirement.extras)) + "]"',
        '    if requirement.url:',
        '        return f"{requirement.name}{extras} @ {requirement.url}"',
        '    return f"{requirement.name}{extras}{requirement.specifier}"',
        'pending = [(raw, set()) for raw in roots]',
        'while pending:',
        '    raw, active_extras = pending.pop()',
        '    requirement = Requirement(raw)',
        '    if not applies(requirement, active_extras):',
        '        continue',
        '    key = (',
        '        requirement.name.lower(),',
        '        str(requirement.specifier),',
        '        requirement.url or "",',
        '        tuple(sorted(requirement.extras)),',
        '    )',
        '    if key in visited:',
        '        continue',
        '    visited.add(key)',
        '    try:',
        '        installed = metadata.distribution(requirement.name)',
        '    except metadata.PackageNotFoundError:',
        '        unsatisfied.append(install_text(requirement))',
        '        continue',
        '    if requirement.specifier and not requirement.specifier.contains(',
        '        installed.version, prereleases=True',
        '    ):',
        '        unsatisfied.append(install_text(requirement))',
        '        continue',
        '    for child in installed.requires or []:',
        '        pending.append((child, set(requirement.extras)))',
        'print(json.dumps(list(dict.fromkeys(unsatisfied))))',
    ].join('\n');
}
/** 返回真正缺失或版本不兼容的依赖，探测失败时返回 null。 */
async function findUnsatisfiedRequirements(pythonCmd, deps, requirements, includeBackendRequirements = false) {
    const scriptPath = path.join(deps.getTempDir(), `autowsgr_requirement_probe_${Date.now()}.py`);
    try {
        fs.writeFileSync(scriptPath, buildRequirementProbeScript(deps.localSitePackages(), requirements, includeBackendRequirements), 'utf-8');
        const { stdout } = await execAsync(`"${pythonCmd}" "${scriptPath}"`, { windowsHide: true, timeout: 30000, env: deps.pipEnv() });
        const result = JSON.parse(stdout.trim());
        return Array.isArray(result)
            ? result.filter((item) => typeof item === 'string')
            : null;
    }
    catch {
        return null;
    }
    finally {
        try {
            fs.unlinkSync(scriptPath);
        }
        catch { /* 忽略清理失败。 */ }
    }
}
/** 执行 pip 并将输出转发到安装日志。 */
async function runPip(pythonCmd, args, deps) {
    return new Promise((resolve) => {
        const proc = (0, child_process_1.spawn)(pythonCmd, args, {
            cwd: deps.appRoot(),
            windowsHide: true,
            stdio: 'pipe',
            env: deps.pipEnv(),
        });
        proc.stdout?.on('data', (data) => {
            for (const line of data.toString().split('\n')) {
                if (line.trim())
                    deps.sendProgress(line.trim());
            }
        });
        proc.stderr?.on('data', (data) => {
            for (const line of data.toString().split('\n')) {
                if (line.trim())
                    deps.sendProgress(line.trim());
            }
        });
        proc.on('close', code => resolve(code ?? 1));
        proc.on('error', () => resolve(1));
    });
}
/** 分轮补齐依赖，每轮只安装探测器确认不满足的包。 */
async function ensureRequirements(pythonCmd, deps, requirements, includeBackendRequirements = false) {
    const targetDir = deps.localSitePackages();
    for (let round = 0; round < 16; round += 1) {
        const missing = await findUnsatisfiedRequirements(pythonCmd, deps, requirements, includeBackendRequirements);
        if (missing === null)
            return 'probe-failed';
        if (missing.length === 0)
            return 'ready';
        deps.sendProgress(`正在安装必要依赖: ${missing.join(', ')}`);
        const code = await runPip(pythonCmd, buildBackendRuntimeInstallArgs(targetDir, missing), deps);
        if (code !== 0)
            return 'install-failed';
    }
    return 'install-failed';
}
/** 生成 managed 后端更新参数，确保自动更新不会改装 PyPI 裸包。 */
function buildManagedAutowsgrUpdateArgs(targetDir, backendRequirement, forceInstall = false) {
    return [
        '-m', 'pip', 'install',
        '--upgrade',
        ...(forceInstall ? ['--force-reinstall'] : []),
        '--target', targetDir,
        '--no-build-isolation',
        '--no-deps',
        '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple',
        '--trusted-host', 'pypi.tuna.tsinghua.edu.cn',
        backendRequirement,
    ];
}
/** 依赖元数据无法读取时，回退给 pip 做一次完整兼容性解析。 */
function buildManagedDependencyRepairArgs(targetDir, backendRequirement) {
    return [
        '-m', 'pip', 'install',
        '--upgrade',
        '--upgrade-strategy', 'only-if-needed',
        '--target', targetDir,
        '--no-build-isolation',
        '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple',
        '--trusted-host', 'pypi.tuna.tsinghua.edu.cn',
        backendRequirement,
    ];
}
/** 完整安装提交前验证新后端可导入且满足 GUI 运行契约。 */
async function verifyBackendRuntimeContract(pythonCmd, deps) {
    const scriptPath = path.join(deps.getTempDir(), `autowsgr_full_update_probe_${Date.now()}.py`);
    const targetDir = deps.localSitePackages();
    fs.writeFileSync(scriptPath, [
        'import json, site, sys',
        `target = ${JSON.stringify(targetDir)}`,
        'sys.path.insert(0, target)',
        'site.addsitedir(target)',
        'result = {"ready": False}',
        ...(0, backendContractProbe_1.buildBackendRuntimeContractProbeLines)(),
        'try:',
        '    import autowsgr',
        '    _verify_gui_runtime_contract()',
        '    result["ready"] = True',
        '    result["version"] = getattr(autowsgr, "__version__", "source")',
        'except Exception as error:',
        '    result["error"] = f"{type(error).__name__}: {error}"',
        'print(json.dumps(result))',
    ].join('\n'), 'utf-8');
    try {
        const { stdout } = await execAsync(`"${pythonCmd}" "${scriptPath}"`, { windowsHide: true, timeout: 30000, env: deps.pipEnv() });
        const result = JSON.parse(stdout.trim());
        return Boolean(result
            && typeof result === 'object'
            && result.ready === true);
    }
    catch {
        return false;
    }
    finally {
        try {
            fs.unlinkSync(scriptPath);
        }
        catch { /* 忽略清理失败。 */ }
    }
}
/**
 * 从本地源码归档完整安装 managed 后端，供后端独立更新在
 * 依赖变更或差异过大时退出流程复用现有 pip 安装链路。
 */
async function installBackendArchive(pythonCmd, deps, archivePath) {
    const targetDir = deps.localSitePackages();
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    deps.sendProgress('正在安装后端完整更新…');
    if (!(await deps.ensurePip(pythonCmd))) {
        deps.sendProgress('WARNING pip 不可用，后端完整安装失败');
        return false;
    }
    const buildRequirementState = await ensureRequirements(pythonCmd, deps, BACKEND_BUILD_REQUIREMENTS);
    if (buildRequirementState !== 'ready') {
        const code = await runPip(pythonCmd, buildRequirementFallbackArgs(targetDir, BACKEND_BUILD_REQUIREMENTS), deps);
        if (code !== 0) {
            deps.sendProgress('WARNING 后端构建依赖安装失败');
            return false;
        }
    }
    const installCode = await runPip(pythonCmd, buildManagedAutowsgrUpdateArgs(targetDir, archivePath, true), deps);
    if (installCode !== 0) {
        deps.sendProgress('WARNING 后端完整安装失败');
        return false;
    }
    const runtimeState = await ensureRequirements(pythonCmd, deps, [
        ...dependencies_1.SHIP_LIBRARY_REQUIREMENTS,
        ...dependencies_1.BACKEND_RUNTIME_REQUIREMENTS,
    ], true);
    if (runtimeState !== 'ready') {
        const code = await runPip(pythonCmd, buildManagedDependencyRepairArgs(targetDir, archivePath), deps);
        if (code !== 0) {
            deps.sendProgress('WARNING 后端运行依赖核对失败');
            return false;
        }
    }
    if (!(await verifyBackendRuntimeContract(pythonCmd, deps))) {
        deps.sendProgress('WARNING 后端完整安装后运行契约验证失败');
        return false;
    }
    deps.sendProgress('后端完整更新安装完成 ✓');
    return true;
}
/** 确保 managed 环境使用 GUI 明确支持的后端版本。 */
async function autoUpdateAutowsgr(pythonCmd, deps, forceInstall = false) {
    try {
        const backendRequirement = deps.backendRequirement();
        deps.sendProgress(forceInstall
            ? '正在强制更新当前通道 autowsgr…'
            : '正在检查 autowsgr 更新…');
        // 单次 Python 调用检查本地版本、活动资源和 GUI 运行契约。
        const spFwd = deps.localSitePackages().replace(/\\/g, '\\\\');
        const checkScript = [
            'import json, sys',
            `sys.path.insert(0, r'${spFwd}')`,
            'result = {}',
            'try:',
            '    import autowsgr',
            '    from pathlib import Path',
            '    result["local"] = autowsgr.__version__',
            '    root = Path(autowsgr.__file__).resolve().parent',
            '    result["event20260730"] = (root / "data" / "map" / "event" / "20260730").is_dir()',
            'except:',
            '    result["local"] = None',
            '    result["event20260730"] = False',
            ...(0, backendContractProbe_1.buildBackendRuntimeContractProbeLines)(),
            'try:',
            '    _verify_gui_runtime_contract()',
            '    result["runtime_contract"] = True',
            'except Exception:',
            '    result["runtime_contract"] = False',
            'print(json.dumps(result))',
        ].join('\n');
        const scriptPath = path.join(deps.getTempDir(), 'autowsgr_update_check.py');
        fs.writeFileSync(scriptPath, checkScript, 'utf-8');
        const { stdout } = await execAsync(`"${pythonCmd}" "${scriptPath}"`, { windowsHide: true, timeout: 20000, env: deps.pipEnv() });
        try {
            fs.unlinkSync(scriptPath);
        }
        catch { /* 忽略清理失败。 */ }
        const info = JSON.parse(stdout.trim());
        const localVer = info.local;
        const supportsLatestEvent = info.event20260730 === true;
        const supportsRuntimeContract = info.runtime_contract === true;
        if (!forceInstall
            &&
                localVer
            && supportsLatestEvent
            && supportsRuntimeContract) {
            deps.sendProgress(`autowsgr ${localVer} 与 GUI 运行契约兼容 ✓`);
            return localVer;
        }
        const incompatibilities = [
            ...(!localVer ? ['未安装'] : []),
            ...(!supportsLatestEvent ? ['缺少 20260730 活动资源'] : []),
            ...(!supportsRuntimeContract ? ['缺少 GUI 运行契约'] : []),
        ];
        deps.sendProgress(forceInstall
            ? '正在重新安装当前通道指定的后端…'
            : `当前 autowsgr ${incompatibilities.join('、')}，正在安装 GUI 兼容版本…`);
        const failureVersion = forceInstall ? null : localVer;
        const targetDir = deps.localSitePackages();
        if (!fs.existsSync(targetDir))
            fs.mkdirSync(targetDir, { recursive: true });
        // 确保 pip 可用。
        if (!(await deps.ensurePip(pythonCmd))) {
            deps.sendProgress('WARNING pip 不可用，autowsgr 升级跳过');
            return failureVersion;
        }
        deps.sendProgress('正在检查后端构建依赖…');
        const buildRequirementState = await ensureRequirements(pythonCmd, deps, BACKEND_BUILD_REQUIREMENTS);
        if (buildRequirementState === 'probe-failed') {
            const buildDepsCode = await runPip(pythonCmd, buildRequirementFallbackArgs(targetDir, BACKEND_BUILD_REQUIREMENTS), deps);
            if (buildDepsCode !== 0) {
                deps.sendProgress('WARNING GUI 兼容后端构建依赖安装失败');
                return failureVersion;
            }
        }
        else if (buildRequirementState === 'install-failed') {
            deps.sendProgress('WARNING GUI 兼容后端构建依赖安装失败');
            return failureVersion;
        }
        deps.sendProgress('后端构建依赖已满足版本要求 ✓');
        const exitCode = await runPip(pythonCmd, buildManagedAutowsgrUpdateArgs(targetDir, backendRequirement, forceInstall), deps);
        if (exitCode !== 0) {
            deps.sendProgress('WARNING autowsgr 升级失败，使用当前版本继续');
            return failureVersion;
        }
        deps.sendProgress('正在核对后端依赖版本…');
        const runtimeRoots = [
            ...dependencies_1.SHIP_LIBRARY_REQUIREMENTS,
            ...dependencies_1.BACKEND_RUNTIME_REQUIREMENTS,
        ];
        const runtimeRequirementState = await ensureRequirements(pythonCmd, deps, runtimeRoots, true);
        if (runtimeRequirementState === 'probe-failed') {
            const runtimeDepsCode = await runPip(pythonCmd, buildManagedDependencyRepairArgs(targetDir, backendRequirement), deps);
            if (runtimeDepsCode !== 0) {
                deps.sendProgress('WARNING 后端运行依赖安装失败');
                return failureVersion;
            }
        }
        else if (runtimeRequirementState === 'install-failed') {
            deps.sendProgress('WARNING 后端运行依赖安装失败');
            return failureVersion;
        }
        deps.sendProgress('后端运行依赖已满足版本要求 ✓');
        // 升级后一次性验证版本和关键依赖。
        const postScript = path.join(deps.getTempDir(), 'autowsgr_post_upgrade.py');
        fs.writeFileSync(postScript, [
            'import json, sys, site',
            `sys.path.insert(0, r'${spFwd}')`,
            `site.addsitedir(r'${spFwd}')`,
            'r = {"version": "unknown", "missing": []}',
            'try:',
            '    import autowsgr',
            '    from pathlib import Path',
            '    r["version"] = autowsgr.__version__',
            '    root = Path(autowsgr.__file__).resolve().parent',
            '    r["event20260730"] = (root / "data" / "map" / "event" / "20260730").is_dir()',
            'except: pass',
            ...(0, backendContractProbe_1.buildBackendRuntimeContractProbeLines)(),
            'try:',
            '    _verify_gui_runtime_contract()',
            '    r["runtime_contract"] = True',
            'except Exception:',
            '    r["runtime_contract"] = False',
            `checks = ${JSON.stringify(dependencies_1.PYTHON_DEPENDENCY_SPECS.map(dependency => [dependency.importName, dependency.packageName]))}`,
            'for mod, package in checks:',
            '    try: __import__(mod)',
            '    except Exception: r["missing"].append(package)',
            'print(json.dumps(r))',
        ].join('\n'), 'utf-8');
        try {
            const { stdout: postOut } = await execAsync(`"${pythonCmd}" "${postScript}"`, { windowsHide: true, timeout: 15000, env: deps.pipEnv() });
            try {
                fs.unlinkSync(postScript);
            }
            catch { /* 忽略清理失败。 */ }
            const postResult = JSON.parse(postOut.trim());
            const actualVer = postResult.version;
            const missing = postResult.missing;
            const eventReady = postResult.event20260730 === true;
            const runtimeContractReady = postResult.runtime_contract === true;
            if (!eventReady) {
                deps.sendProgress('WARNING GUI 兼容后端安装后仍缺少 20260730 活动资源');
                return failureVersion;
            }
            if (!runtimeContractReady) {
                deps.sendProgress('WARNING GUI 兼容后端安装后仍不支持运行契约');
                return failureVersion;
            }
            if (missing.length > 0) {
                deps.sendProgress(`升级后缺少依赖: ${missing.join(', ')}，正在补装…`);
                const fixCode = await new Promise((resolve) => {
                    const proc = (0, child_process_1.spawn)(pythonCmd, [
                        '-m', 'pip', 'install',
                        '--target', targetDir,
                        '--force-reinstall', '--no-deps',
                        '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple',
                        '--trusted-host', 'pypi.tuna.tsinghua.edu.cn',
                        ...missing,
                    ], {
                        cwd: deps.appRoot(),
                        windowsHide: true,
                        stdio: 'pipe',
                        env: deps.pipEnv(),
                    });
                    proc.stdout?.on('data', (d) => { for (const l of d.toString().split('\n')) {
                        if (l.trim())
                            deps.sendProgress(l.trim());
                    } });
                    proc.stderr?.on('data', (d) => { for (const l of d.toString().split('\n')) {
                        if (l.trim())
                            deps.sendProgress(l.trim());
                    } });
                    proc.on('close', (code) => resolve(code ?? 1));
                    proc.on('error', () => resolve(1));
                });
                if (fixCode !== 0) {
                    await new Promise((resolve) => {
                        const proc = (0, child_process_1.spawn)(pythonCmd, [
                            '-m', 'pip', 'install',
                            '--target', targetDir,
                            '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple',
                            '--trusted-host', 'pypi.tuna.tsinghua.edu.cn',
                            ...missing,
                        ], {
                            cwd: deps.appRoot(),
                            windowsHide: true,
                            stdio: 'pipe',
                            env: deps.pipEnv(),
                        });
                        proc.stdout?.on('data', (d) => { for (const l of d.toString().split('\n')) {
                            if (l.trim())
                                deps.sendProgress(l.trim());
                        } });
                        proc.stderr?.on('data', (d) => { for (const l of d.toString().split('\n')) {
                            if (l.trim())
                                deps.sendProgress(l.trim());
                        } });
                        proc.on('close', () => resolve());
                        proc.on('error', () => resolve());
                    });
                }
                deps.sendProgress(`依赖补装完成 ✓`);
            }
            if (actualVer !== 'unknown') {
                deps.sendProgress(`autowsgr ${actualVer} GUI 兼容版本已安装 ✓`);
                return actualVer;
            }
        }
        catch {
            try {
                fs.unlinkSync(postScript);
            }
            catch { /* 忽略清理失败。 */ }
        }
        deps.sendProgress('WARNING 无法验证 GUI 兼容后端安装结果');
        return failureVersion;
    }
    catch {
        deps.sendProgress('autowsgr 更新检查跳过（环境不可用或检查超时）');
        return null;
    }
}
