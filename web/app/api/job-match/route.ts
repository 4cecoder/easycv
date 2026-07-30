import { exec } from "child_process";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promisify } from "util";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getConvexClient } from "../../../lib/convexServer";
import { SESSION_COOKIE } from "../../../lib/session";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      uploadId?: string;
      jobDescription?: string;
    };

    const { uploadId, jobDescription } = body;
    if (!uploadId || !jobDescription) {
      return NextResponse.json(
        { error: "uploadId and jobDescription are required" },
        { status: 400 }
      );
    }

    // Verify session
    const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session" }, { status: 401 });
    }

    // Query Convex structured profile
    const convex = getConvexClient();
    const profile = await convex.query(api.profiles.getStructuredProfile, {
      uploadId: uploadId as Id<"uploads">,
      sessionId,
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Structured profile not found or not owned by this session" },
        { status: 404 }
      );
    }

    // Create temp files for python CLI input
    const tempDir = path.join(process.cwd(), "tmp");
    await fs.mkdir(tempDir, { recursive: true });

    const profilePath = path.join(tempDir, `profile-${randomUUID()}.json`);
    const jdPath = path.join(tempDir, `jd-${randomUUID()}.txt`);

    // We exclude metadata fields to pass clean resume JSON to the LLM
    const cleanProfile = {
      name: profile.name,
      titles: profile.titles,
      summary: profile.summary,
      skills: profile.skills,
      experience: profile.experience,
      education: profile.education,
      certifications: profile.certifications,
      languagesSpoken: profile.languagesSpoken,
    };

    await fs.writeFile(profilePath, JSON.stringify(cleanProfile));
    await fs.writeFile(jdPath, jobDescription);

    const provider = process.env.LLM_PROVIDER || "ollama";
    const model = process.env.LLM_MODEL || "";
    const modelArg = model ? ` --model "${model}"` : "";

    // Execute matching CLI subcommand
    // Execute python command from root project directory
    const rootDir = path.resolve(process.cwd(), "..");
    const command = `uv run python pipeline.py match-job --profile "${profilePath}" --job-desc "${jdPath}" --llm "${provider}"${modelArg}`;

    let matchResult;
    try {
      const { stdout } = await execAsync(command, {
        cwd: rootDir,
        env: {
          ...process.env,
          OLLAMA_API_BASE: process.env.OLLAMA_API_BASE || "",
        },
      });
      
      // The CLI prints log messages followed by JSON. We extract the JSON part.
      const jsonStart = stdout.indexOf("{");
      if (jsonStart !== -1) {
        matchResult = JSON.parse(stdout.substring(jsonStart));
      } else {
        throw new Error("No JSON found in python CLI stdout: " + stdout);
      }
    } finally {
      // Clean up temp files
      await fs.unlink(profilePath).catch(() => {});
      await fs.unlink(jdPath).catch(() => {});
    }

    return NextResponse.json({ success: true, result: matchResult });
  } catch (err) {
    console.error("Job match API failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to analyze job match" },
      { status: 500 }
    );
  }
}
