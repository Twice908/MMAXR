import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const piperDist = dirname(require.resolve("piper-tts-web"));

export default defineConfig(({ command, mode }) => {
	const env = loadEnv(mode, workspaceRoot, "");
	const piperVoiceId = env.PIPER_VOICE_ID || "en_GB-jenny_dioco-medium";
	const piperBasePath = env.PIPER_BASE_PATH || "";
	return {
		define: {
			__PIPER_VOICE_ID__: JSON.stringify(piperVoiceId),
			__PIPER_BASE_PATH__: JSON.stringify(piperBasePath),
		},
		assetsInclude: ["**/*.wav.gz", "**/*.mp3"],
		plugins: command === "serve" ? [piperDevAssets()] : [],
	};
});

function piperDevAssets(): Plugin {
	return {
		name: "mma-piper-dev-assets",
		configureServer(server) {
			server.middlewares.use(async (request, response, next) => {
				const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
				const route = pathname.startsWith("/piper/")
					? { root: resolve(piperDist, "piper"), path: pathname.slice("/piper/".length) }
					: pathname.startsWith("/onnx/")
						? { root: resolve(piperDist, "onnx"), path: pathname.slice("/onnx/".length) }
						: pathname.startsWith("/piper-models/")
							? { root: resolve(workspaceRoot, "audio"), path: pathname.slice("/piper-models/".length) }
							: undefined;
				if (!route || !route.path || basename(route.path) !== route.path) {
					next();
					return;
				}
				try {
					const contents = await readFile(resolve(route.root, route.path));
					response.statusCode = 200;
					response.setHeader("Content-Length", contents.byteLength);
					response.setHeader("Content-Type", mimeType(route.path));
					response.end(contents);
				} catch {
					next();
				}
			});
		},
	};
}

function mimeType(path: string): string {
	if (path.endsWith(".wasm")) return "application/wasm";
	if (path.endsWith(".data") || path.endsWith(".onnx")) return "application/octet-stream";
	return "application/json; charset=utf-8";
}