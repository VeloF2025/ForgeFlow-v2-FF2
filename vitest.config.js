"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const path_1 = __importDefault(require("path"));
exports.default = (0, config_1.defineConfig)({
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'dist/', '.ccpm/', '**/*.spec.ts', '**/*.test.ts', '**/types/**'],
            thresholds: {
                lines: 95,
                functions: 95,
                branches: 90,
                statements: 95,
            },
        },
    },
    resolve: {
        alias: {
            '@': path_1.default.resolve(__dirname, './src'),
            '@core': path_1.default.resolve(__dirname, './src/core'),
            '@agents': path_1.default.resolve(__dirname, './src/agents'),
            '@protocols': path_1.default.resolve(__dirname, './src/protocols'),
            '@utils': path_1.default.resolve(__dirname, './src/utils'),
            '@types': path_1.default.resolve(__dirname, './src/types'),
            '@integrations': path_1.default.resolve(__dirname, './src/integrations'),
            '@quality': path_1.default.resolve(__dirname, './src/quality'),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map