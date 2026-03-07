import {defineConfig} from "vite";
import vue from "@vitejs/plugin-vue";


import { cloudflare } from "@cloudflare/vite-plugin";


export default defineConfig({
    server: {
        watch: {
            ignored: ['**/public/tiles/**'],
        },
        host: true, // 或 "0.0.0.0" 允许外部访问
        port: 5173,
    },
    plugins: [{
        name: "request-logger",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                // x-forwarded-for 可能是 string 或 string[]，统一转换成 string
                let forwarded = req.headers["x-forwarded-for"];
                let ip: string;

                if (Array.isArray(forwarded)) {
                    ip = forwarded[0]; // 取第一个
                } else if (typeof forwarded === "string") {
                    ip = forwarded;
                } else {
                    ip = req.socket.remoteAddress ?? "unknown";
                }

                // 过滤本机 IP
                const isLocalhost =
                    ip === "::1" ||
                    ip === "127.0.0.1" ||
                    ip.startsWith("127.") ||
                    ip === "localhost";

                res.on("finish", () => {
                    // 忽略本机
                    if (isLocalhost) return;

                    console.log(`[${ip}] ${req.method} ${req.url} ${res.statusCode}`);
                });

                next();
            });
        },
    }, vue(), cloudflare()],
});