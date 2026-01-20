import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import envCompatible from 'vite-plugin-env-compatible';
import path from 'path';

export default defineConfig(({ mode }) => {
    // 백엔드 .env 파일과 프론트엔드 환경 변수 모두 로드
    const env = loadEnv(mode, path.resolve(__dirname, '../backend'), '');

    // 환경 변수에서 허용 호스트 읽기 (쉼표로 구분된 문자열)
    const extraHosts = env.ALLOWED_HOSTS ? env.ALLOWED_HOSTS.split(',').map(h => h.trim()) : [];

    // 기본 허용 목록과 병합 (localhost, 127.0.0.1은 필수 기본값으로 유지)
    const allowedHosts = Array.from(new Set([
        'localhost',
        '127.0.0.1',
        ...extraHosts
    ])).filter(Boolean);

    return {
        plugins: [
            react(),
            envCompatible(),
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        server: {
            host: true,
            port: 3000,
            allowedHosts, // 동적으로 생성된 목록 적용
            open: false,
            proxy: {
                '/api': {
                    target: 'http://localhost:5000',
                    changeOrigin: true,
                },
                '/uploads': {
                    target: 'http://localhost:5000',
                    changeOrigin: true,
                }
            },
        },
        logLevel: 'warn',
        build: {
            outDir: 'build',
        },
        esbuild: {
            loader: 'jsx',
            include: /src\/.*\.js$/,
            exclude: [],
        },
        optimizeDeps: {
            esbuildOptions: {
                loader: {
                    '.js': 'jsx',
                },
            },
        },
    };
});
