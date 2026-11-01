"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BACKEND_RUNTIME_REQUIREMENTS = exports.SHIP_LIBRARY_REQUIREMENTS = exports.PYTHON_DEPENDENCY_SPECS = void 0;
/** GUI Python 运行时必须可导入的模块。 */
exports.PYTHON_DEPENDENCY_SPECS = Object.freeze([
    {
        key: 'uvicorn',
        importName: 'uvicorn',
        packageName: 'uvicorn',
    },
    {
        key: 'fastapi',
        importName: 'fastapi',
        packageName: 'fastapi',
    },
    {
        key: 'scipy',
        importName: 'scipy._lib',
        packageName: 'scipy',
    },
    {
        key: 'requests',
        importName: 'requests',
        packageName: 'requests',
    },
    {
        key: 'beautifulSoup',
        importName: 'bs4',
        packageName: 'beautifulsoup4',
    },
    {
        key: 'maafw',
        importName: 'maa',
        packageName: 'maafw>=5.12.3,<6.0',
    },
]);
/** 舰船资料库更新器不由 AutoWSGR 后端依赖间接保证的包。 */
exports.SHIP_LIBRARY_REQUIREMENTS = Object.freeze([
    'requests>=2.32.5',
    'beautifulsoup4>=4.12.0',
]);
/** 使用 --no-deps 更新后端前必须显式安装的运行依赖。 */
exports.BACKEND_RUNTIME_REQUIREMENTS = Object.freeze([
    'maafw>=5.12.3,<6.0',
]);
