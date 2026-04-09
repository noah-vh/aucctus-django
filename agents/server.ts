/**
 * Agent Service - HTTP server wrapping the research pipeline.
 * Called by Django to run research with SSE streaming.
 *
 * Endpoints:
 *   POST /research/stream  - SSE stream of agent events + verdict
 *   POST /research/run     - Synchronous, returns verdict JSON
 *   GET  /health           - Health check
 */
import http from "http";
import { runResearch } from "./index";
import { runOrchestratorStreaming, type EmitFn } from "./orchestrator";

const PORT = parseInt(process.env.AGENT_PORT || "4000", 10);

const server = http.createServer(async (req, res) => {
  // CORS headers for Django
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
    return;
  }

  // Parse JSON body
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }
  let data: any = {};
  try {
    data = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  // SSE streaming research
  if (req.method === "POST" && req.url === "/research/stream") {
    const { description, idea_id } = data;

    if (!description || !idea_id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "description and idea_id required" }));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    const emit: EmitFn = (event) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Client disconnected
      }
    };

    try {
      emit({ type: "agent_start", agent: "orchestrator", message: `Starting research on "${description}"`, timestamp: Date.now() });

      const verdict = await runOrchestratorStreaming(description, idea_id, emit);

      emit({ type: "agent_end", agent: "orchestrator", message: `Verdict: ${verdict.recommendation.toUpperCase()} (${verdict.confidence}% confidence)`, timestamp: Date.now() });
      emit({ type: "verdict", agent: "orchestrator", data: verdict, timestamp: Date.now() });
      emit({ type: "done", agent: "system", message: "Research complete.", timestamp: Date.now() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[agent-service] Research error:", message);
      emit({ type: "error", agent: "system", message, timestamp: Date.now() });
    } finally {
      res.end();
    }
    return;
  }

  // Synchronous research
  if (req.method === "POST" && req.url === "/research/run") {
    const { description, idea_id } = data;

    if (!description || !idea_id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "description and idea_id required" }));
      return;
    }

    try {
      const result = await runResearch(description, idea_id);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[agent-service] Running on http://localhost:${PORT}`);
  console.log(`[agent-service] Endpoints:`);
  console.log(`  POST /research/stream  (SSE)`);
  console.log(`  POST /research/run     (sync)`);
  console.log(`  GET  /health`);
});
