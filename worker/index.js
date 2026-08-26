import { defaultStore, handleApiRequest } from "../src/lib/api.js";

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      const apiResponse = await handleApiRequest(request, defaultStore);
      if (apiResponse.status !== 404) return apiResponse;
    }
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
