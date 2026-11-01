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
exports.GuiLogService = void 0;
exports.resolveGuiLogDirectory = resolveGuiLogDirectory;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function pad2(value) {
    return String(value).padStart(2, '0');
}
function dateTag() {
    const date = new Date();
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function resolveGuiLogDirectory(configuredRoot, userDataRoot) {
    const root = configuredRoot.trim() || 'logs';
    if (root.includes('\0'))
        throw new Error('GUI log directory contains an invalid character');
    if (root.split(/[\\/]+/).includes('..')) {
        throw new Error('GUI log directory must not contain ..');
    }
    const hasDrivePrefix = /^[a-zA-Z]:/.test(root);
    const windowsAbsolute = path.win32.isAbsolute(root);
    if (hasDrivePrefix && !windowsAbsolute) {
        throw new Error('GUI log directory must not use a drive-relative path');
    }
    if (path.isAbsolute(root) || windowsAbsolute)
        return root;
    return path.resolve(userDataRoot, root);
}
/** Writes renderer logs to the configured root without accepting a renderer path. */
class GuiLogService {
    constructor(appPaths, settings) {
        this.appPaths = appPaths;
        this.settings = settings;
    }
    append(content) {
        if (typeof content !== 'string')
            throw new Error('GUI log content must be a string');
        const directory = resolveGuiLogDirectory(this.settings.guiLogRoot(), this.appPaths.userDataRoot());
        fs.mkdirSync(directory, { recursive: true });
        fs.appendFileSync(path.join(directory, `gui_${dateTag()}.debug.log`), content, 'utf-8');
    }
}
exports.GuiLogService = GuiLogService;
