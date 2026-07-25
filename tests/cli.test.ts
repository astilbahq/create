import { once } from "node:events";
import {
  lstat,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { Writable } from "node:stream";
import { setImmediate as waitForImmediate } from "node:timers/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isJsonOutputRequested,
  parseCliArguments,
  resolveScaffoldRequest,
  runCli,
  scaffoldProject,
} from "../src/cli.js";
import type { CreateAstilbaError } from "../src/errors.js";
import { ApplyGenerationError } from "../src/generator/apply.js";
import { PROJECT_MANIFEST_PATH } from "../src/manifest.js";
import { CliPromptCancelledError } from "../src/terminal.js";
import type { CliPromptId, CliTerminal } from "../src/terminal.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true }))
  );
});

const completeArguments = [
  "my-project",
  "--recipe",
  "typescript-library",
  "--description",
  "An example project.",
  "--github-owner",
  "example",
] as const;

interface RecordingTerminal {
  readonly events: string[];
  readonly notes: string[];
  readonly terminal: CliTerminal;
}

const createRecordingTerminal = (
  values: Partial<
    Record<CliPromptId, boolean | string | readonly (boolean | string)[]>
  > = {}
): RecordingTerminal => {
  const events: string[] = [];
  const notes: string[] = [];
  const answers: Record<
    CliPromptId,
    boolean | string | readonly (boolean | string)[]
  > = {
    "customize-metadata": false,
    description: "An example project.",
    destination: "my-project",
    "edit-field": "description",
    "github-owner": "example",
    "github-repo": "my-project",
    "initialize-git": true,
    "install-dependencies": true,
    "package-name": "my-project",
    "project-name": "my-project",
    recipe: "typescript-library",
    "review-action": "create",
    ...values,
  };
  const answerIndexes = new Map<CliPromptId, number>();
  const readAnswer = (id: CliPromptId): boolean | string => {
    const configuredAnswer = answers[id];
    const answer = Array.isArray(configuredAnswer)
      ? configuredAnswer[answerIndexes.get(id) ?? 0]
      : configuredAnswer;

    if (answer === undefined) {
      throw new Error(`No recorded answer for ${id}.`);
    }

    if (Array.isArray(configuredAnswer)) {
      answerIndexes.set(id, (answerIndexes.get(id) ?? 0) + 1);
    }

    return answer;
  };

  return {
    events,
    notes,
    terminal: {
      cancel: (message) => {
        events.push(`cancel:${message}`);
      },
      confirm: (id) => {
        events.push(`confirm:${id}`);
        const answer = readAnswer(id);

        if (typeof answer !== "boolean") {
          throw new TypeError(`Expected a boolean answer for ${id}.`);
        }

        return Promise.resolve(answer);
      },
      intro: (message) => {
        events.push(`intro:${message}`);
      },
      note: (message, title) => {
        events.push(`note:${title ?? ""}`);
        notes.push(message);
      },
      outro: (message) => {
        events.push(`outro:${message}`);
      },
      select: (id, options) => {
        events.push(`select:${id}`);
        const answer = readAnswer(id);

        if (
          typeof answer !== "string" ||
          !options.options.some((option) => option.value === answer)
        ) {
          throw new TypeError(`Expected a listed option for ${id}.`);
        }

        return Promise.resolve(answer);
      },
      spinner: () => ({
        message: (message) => {
          events.push(`spinner:message:${message}`);
        },
        start: (message) => {
          events.push(`spinner:start:${message}`);
        },
        stop: (message) => {
          events.push(`spinner:stop:${message}`);
        },
      }),
      text: (id) => {
        events.push(`text:${id}`);
        const answer = readAnswer(id);

        if (typeof answer !== "string") {
          throw new TypeError(`Expected a text answer for ${id}.`);
        }

        return Promise.resolve(answer);
      },
    },
  };
};

const createTextOutput = (): {
  readonly read: () => string;
  readonly stream: Writable;
} => {
  let output = "";
  const stream = new PassThrough();
  stream.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf-8");
  });

  return {
    read: () => output,
    stream,
  };
};

describe("Astilba Create CLI", () => {
  it("does not prompt for a complete invocation on a TTY", async () => {
    const recording = createRecordingTerminal();
    const parsed = parseCliArguments(completeArguments);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        interactive: true,
        terminal: recording.terminal,
      })
    ).resolves.toMatchObject({
      initializeGit: true,
      installDependencies: false,
    });
    expect(recording.events).toEqual([]);
  });

  it("prompts only for missing values in a partial TTY invocation", async () => {
    const recording = createRecordingTerminal();
    const parsed = parseCliArguments([
      "my-project",
      "--recipe",
      "typescript-library",
      "--package-name",
      "@example/project",
      "--git",
      "--install",
      "--yes",
    ]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        interactive: true,
        terminal: recording.terminal,
      })
    ).resolves.toMatchObject({
      initializeGit: true,
      installDependencies: true,
      options: {
        description: "An example project.",
        githubOwner: "example",
        packageName: "@example/project",
      },
    });
    expect(recording.events).toEqual([
      "intro:Astilba Create",
      "text:description",
      "text:github-owner",
      "confirm:customize-metadata",
      "note:Review your project",
    ]);
  });

  it("uses --yes only to skip the final confirmation", async () => {
    const recording = createRecordingTerminal();
    const parsed = parseCliArguments(["--yes"]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        interactive: true,
        terminal: recording.terminal,
      })
    ).resolves.toMatchObject({
      initializeGit: true,
      installDependencies: true,
    });

    expect(recording.events).toEqual([
      "intro:Astilba Create",
      "select:recipe",
      "text:destination",
      "text:description",
      "text:github-owner",
      "confirm:customize-metadata",
      "confirm:initialize-git",
      "confirm:install-dependencies",
      "note:Review your project",
    ]);
  });

  it("validates and reviews every resolved value before creation", async () => {
    const recording = createRecordingTerminal({
      "customize-metadata": true,
      "github-repo": "web",
      "package-name": "@example/web",
      "project-name": "web",
      recipe: "react-vite-spa",
    });
    const parsed = parseCliArguments([]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        cwd: "/work",
        interactive: true,
        terminal: recording.terminal,
      })
    ).resolves.toMatchObject({
      destination: path.resolve("/work/my-project"),
      options: {
        githubRepo: "web",
        packageName: "@example/web",
        projectName: "web",
      },
      recipe: "react-vite-spa",
    });

    expect(recording.notes).toHaveLength(1);
    expect(recording.notes[0]).toContain("React + Vite application");
    expect(recording.notes[0]).toContain("@example/web");
    expect(recording.notes[0]).toContain("example/web");
    expect(recording.events.at(-1)).toBe("select:review-action");
  });

  it("returns to the validated review after changing a detail", async () => {
    const recording = createRecordingTerminal({
      "edit-field": "package-name",
      "package-name": "@example/project",
      "review-action": ["change", "create"],
    });
    const parsed = parseCliArguments([]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        cwd: "/work",
        interactive: true,
        terminal: recording.terminal,
      })
    ).resolves.toMatchObject({
      options: {
        packageName: "@example/project",
      },
    });

    expect(recording.notes).toHaveLength(2);
    expect(recording.notes[0]).toContain("Package name: my-project");
    expect(recording.notes[1]).toContain("Package name: @example/project");
    expect(recording.events.slice(-5)).toEqual([
      "select:review-action",
      "select:edit-field",
      "text:package-name",
      "note:Review your project",
      "select:review-action",
    ]);
  });

  it("preserves explicit metadata that matches an inferred name", async () => {
    const recording = createRecordingTerminal({
      destination: "renamed-project",
      "edit-field": "destination",
      "review-action": ["change", "create"],
    });
    const parsed = parseCliArguments([
      "my-project",
      "--recipe",
      "typescript-library",
      "--package-name",
      "my-project",
    ]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        cwd: "/work",
        interactive: true,
        terminal: recording.terminal,
      })
    ).resolves.toMatchObject({
      destination: path.resolve("/work/renamed-project"),
      options: {
        githubRepo: "renamed-project",
        packageName: "my-project",
        projectName: "renamed-project",
      },
    });
  });

  it("updates metadata that is still inferred after a destination change", async () => {
    const recording = createRecordingTerminal({
      destination: ["my-project", "renamed-project"],
      "edit-field": "destination",
      "review-action": ["change", "create"],
    });
    const parsed = parseCliArguments([]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        cwd: "/work",
        interactive: true,
        terminal: recording.terminal,
      })
    ).resolves.toMatchObject({
      destination: path.resolve("/work/renamed-project"),
      options: {
        githubRepo: "renamed-project",
        packageName: "renamed-project",
        projectName: "renamed-project",
      },
    });
  });

  it("keeps manually edited metadata user-owned when its value matches the default", async () => {
    const recording = createRecordingTerminal({
      destination: ["my-project", "renamed-project"],
      "edit-field": ["package-name", "destination"],
      "package-name": "my-project",
      "review-action": ["change", "change", "create"],
    });
    const parsed = parseCliArguments([]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        cwd: "/work",
        interactive: true,
        terminal: recording.terminal,
      })
    ).resolves.toMatchObject({
      options: {
        githubRepo: "renamed-project",
        packageName: "my-project",
        projectName: "renamed-project",
      },
    });
  });

  it("cancels from the review without creating a project", async () => {
    const recording = createRecordingTerminal({
      "review-action": "cancel",
    });
    const parsed = parseCliArguments([]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        interactive: true,
        terminal: recording.terminal,
      })
    ).rejects.toBeInstanceOf(CliPromptCancelledError);
    expect(recording.events.slice(-2)).toEqual([
      "select:review-action",
      "cancel:Project creation cancelled.",
    ]);
  });

  it("keeps cancellation authoritative when its renderer fails", async () => {
    const recording = createRecordingTerminal({
      "review-action": "cancel",
    });
    const terminal: CliTerminal = {
      ...recording.terminal,
      cancel: () => {
        throw new Error("rendering failed");
      },
    };

    await expect(
      runCli([], {
        interactive: true,
        terminal,
      })
    ).rejects.toMatchObject({
      code: "CANCELLED",
      exitCode: 130,
      messageReported: false,
      phase: "input",
      projectCreated: false,
    } satisfies Partial<CreateAstilbaError>);
  });

  it("rejects invalid supplied partial values before prompting", async () => {
    const recording = createRecordingTerminal();
    const parsed = parseCliArguments([
      "--package-name",
      "invalid package name",
    ]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        interactive: true,
        terminal: recording.terminal,
      })
    ).rejects.toThrow("Package name is not a supported npm package name.");
    expect(recording.events).toEqual([]);
  });

  it("keeps JSON output isolated from terminal rendering", async () => {
    const root = await mkdtemp(
      path.join(await realpath(tmpdir()), "create-astilba-json-")
    );
    temporaryRoots.push(root);
    const recording = createRecordingTerminal();
    const output = createTextOutput();

    await runCli([...completeArguments, "--dry-run", "--json"], {
      cwd: root,
      interactive: true,
      output: output.stream,
      terminal: recording.terminal,
    });

    const lines = output.read().trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      action: "plan",
      ok: true,
      schemaVersion: 1,
    });
    expect(recording.events).toEqual([]);
  });

  it("keeps non-interactive output isolated from terminal rendering", async () => {
    const root = await mkdtemp(
      path.join(await realpath(tmpdir()), "create-astilba-output-")
    );
    temporaryRoots.push(root);
    const recording = createRecordingTerminal();
    const output = createTextOutput();

    await runCli([...completeArguments, "--dry-run"], {
      cwd: root,
      interactive: false,
      output: output.stream,
      terminal: recording.terminal,
    });

    expect(output.read()).toMatch(/^Planned TypeScript library at /u);
    expect(recording.events).toEqual([]);
  });

  it("keeps Clack rendering when stdout alone is interactive", async () => {
    const root = await mkdtemp(
      path.join(await realpath(tmpdir()), "create-astilba-mixed-tty-")
    );
    temporaryRoots.push(root);
    const input = new PassThrough();
    const output = createTextOutput();
    Object.defineProperty(output.stream, "isTTY", { value: true });
    const recording = createRecordingTerminal();

    await runCli([...completeArguments, "--dry-run"], {
      cwd: root,
      input,
      output: output.stream,
      terminal: recording.terminal,
    });

    expect(recording.events).toEqual([
      "spinner:start:Planning project",
      "spinner:stop:Project plan ready",
      expect.stringMatching(/^outro:Planned TypeScript library at /u),
    ]);
    expect(output.read()).toBe("");
  });

  it("reports planning and generation as distinct progress phases", async () => {
    const root = await mkdtemp(
      path.join(await realpath(tmpdir()), "create-astilba-progress-")
    );
    temporaryRoots.push(root);
    const recording = createRecordingTerminal();

    await runCli([...completeArguments, "--no-git"], {
      cwd: root,
      interactive: true,
      terminal: recording.terminal,
    });

    expect(recording.events).toEqual([
      "spinner:start:Planning project",
      "spinner:message:Generating project",
      "spinner:stop:Project created",
      expect.stringMatching(
        /^outro:Created TypeScript library at [^\n]+ Dependencies were not installed\.\nNext: open [^\n]+, run pnpm install --frozen-lockfile, then run pnpm verify\.$/u
      ),
    ]);
  });

  it("propagates cancellation into an injected pending prompt", async () => {
    const controller = new AbortController();
    const output = createTextOutput();
    const recording = createRecordingTerminal();
    const terminal: CliTerminal = {
      ...recording.terminal,
      text: async (id, _options, signal) => {
        recording.events.push(`text:${id}`);

        if (!signal) {
          throw new Error("Expected the CLI abort signal.");
        }

        if (!signal.aborted) {
          await once(signal, "abort");
        }

        throw signal.reason;
      },
    };
    const result = runCli(["--recipe", "typescript-library"], {
      interactive: true,
      output: output.stream,
      signal: controller.signal,
      terminal,
    });
    await waitForImmediate();
    controller.abort(new Error("test cancellation"));

    await expect(result).rejects.toMatchObject({
      code: "CANCELLED",
      exitCode: 130,
      phase: "input",
      projectCreated: false,
    } satisfies Partial<CreateAstilbaError>);
    expect(recording.events).toEqual([
      "intro:Astilba Create",
      "text:destination",
    ]);
  });

  it("preserves created-project truth when terminal rendering fails", async () => {
    const root = await mkdtemp(
      path.join(await realpath(tmpdir()), "create-astilba-rendering-")
    );
    temporaryRoots.push(root);
    const destination = path.join(root, "my-project");
    const recording = createRecordingTerminal();
    const terminal: CliTerminal = {
      ...recording.terminal,
      spinner: () => ({
        message: () => {},
        start: () => {},
        stop: () => {
          throw new Error("rendering failed");
        },
      }),
    };

    await expect(
      runCli([...completeArguments, "--no-git"], {
        cwd: root,
        interactive: true,
        terminal,
      })
    ).rejects.toMatchObject({
      code: "UNEXPECTED_ERROR",
      destination,
      phase: "unknown",
      projectCreated: true,
    } satisfies Partial<CreateAstilbaError>);
    const destinationStats = await lstat(destination);
    expect(destinationStats.isDirectory()).toBe(true);
  });

  it("resolves destinations from the caller's working directory", async () => {
    const parsed = parseCliArguments(completeArguments);

    expect(parsed.command).toBe("create");

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        cwd: "/work",
        interactive: false,
      })
    ).resolves.toMatchObject({
      destination: path.resolve("/work/my-project"),
      options: {
        description: "An example project.",
        githubOwner: "example",
        githubRepo: "my-project",
        packageName: "my-project",
        projectName: "my-project",
      },
      recipe: "typescript-library",
    });
  });

  it("allows explicit project names and lifecycle choices", async () => {
    const parsed = parseCliArguments([
      "output",
      "--recipe=react-vite-spa",
      "--description=An example project.",
      "--github-owner=example",
      "--github-repo=web",
      "--package-name=@example/web",
      "--project-name=web",
      "--no-git",
      "--install",
    ]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        cwd: "/work",
        interactive: false,
      })
    ).resolves.toMatchObject({
      initializeGit: false,
      installDependencies: true,
      options: {
        githubRepo: "web",
        packageName: "@example/web",
        projectName: "web",
      },
    });
  });

  it("infers portable project metadata from a human-friendly directory", async () => {
    const parsed = parseCliArguments([
      "My App",
      "--recipe=cloudflare-worker-service",
      "--description=An example project.",
      "--github-owner=example",
    ]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, {
        cwd: "/work",
        interactive: false,
      })
    ).resolves.toMatchObject({
      destination: path.resolve("/work/My App"),
      options: {
        githubRepo: "my-app",
        packageName: "my-app",
        projectName: "my-app",
      },
    });
  });

  it("rejects a directory name that cannot produce project metadata", async () => {
    const parsed = parseCliArguments([
      "___",
      "--recipe=typescript-library",
      "--description=An example project.",
      "--github-owner=example",
    ]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, { interactive: false })
    ).rejects.toThrow(/letter or digit/iu);
  });

  it("rejects an unknown recipe", () => {
    expect(() =>
      parseCliArguments([
        "output",
        "--recipe",
        "mobile",
        "--description",
        "An example project.",
        "--github-owner",
        "example",
      ])
    ).toThrow(/unknown project recipe/iu);
  });

  it("rejects incomplete non-interactive input", async () => {
    const parsed = parseCliArguments([]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, { interactive: false })
    ).rejects.toThrow(/non-interactive creation requires/iu);
  });

  it.each([
    "/absolute",
    "../escape",
    "nested/../escape",
    "C:\\absolute",
    "\\\\server\\share",
    "C:../escape",
    "D:project",
    ".. /project",
    "nested/.. /escape",
    "CON",
    "name.",
    "name ",
    "name?.txt",
  ])("rejects unsafe destination argument %s", async (destination) => {
    const parsed = parseCliArguments([
      destination,
      "--recipe",
      "react-vite-spa",
      "--description",
      "An example project.",
      "--github-owner",
      "example",
    ]);

    if (parsed.command !== "create") {
      throw new Error("Expected a create command.");
    }

    await expect(
      resolveScaffoldRequest(parsed.input, { interactive: false })
    ).rejects.toThrow(/normalized portable relative path without traversal/iu);
  });

  it("returns help and version commands without requiring project options", () => {
    expect(parseCliArguments(["--help"])).toEqual({
      command: "help",
      json: false,
    });
    expect(parseCliArguments(["--version", "--json"])).toEqual({
      command: "version",
      json: true,
    });
  });

  it("only enables JSON output for a parsed JSON option", () => {
    expect(isJsonOutputRequested(["--json", "--unknown"])).toBe(true);
    expect(isJsonOutputRequested(["--description", "--json"])).toBe(false);
  });

  it("creates a project with provenance and a fresh Git history", async () => {
    const root = await mkdtemp(
      path.join(await realpath(tmpdir()), "create-astilba-cli-")
    );
    temporaryRoots.push(root);
    const destination = path.join(root, "project");

    await scaffoldProject({
      destination,
      dryRun: false,
      initializeGit: true,
      installDependencies: false,
      json: false,
      options: {
        description: "An example library.",
        githubOwner: "example",
        githubRepo: "project",
        packageName: "@example/project",
        projectName: "project",
      },
      recipe: "typescript-library",
    });

    const gitStats = await lstat(path.join(destination, ".git"));
    expect(gitStats.isDirectory()).toBe(true);
    await expect(
      lstat(path.join(destination, ".git", "HEAD"))
    ).resolves.toBeDefined();
    await expect(readlink(path.join(destination, "CLAUDE.md"))).resolves.toBe(
      "AGENTS.md"
    );

    const manifest = JSON.parse(
      await readFile(path.join(destination, PROJECT_MANIFEST_PATH), "utf-8")
    ) as { readonly recipe?: { readonly id?: string } };
    expect(manifest.recipe?.id).toBe("typescript-library");
  });

  it("plans without touching the destination", async () => {
    const root = await mkdtemp(
      path.join(await realpath(tmpdir()), "create-astilba-dry-run-")
    );
    temporaryRoots.push(root);
    const destination = path.join(root, "project");

    const result = await scaffoldProject({
      destination,
      dryRun: true,
      initializeGit: true,
      installDependencies: true,
      json: false,
      options: {
        description: "An example application.",
        githubOwner: "example",
        githubRepo: "project",
        packageName: "@example/project",
        projectName: "project",
      },
      recipe: "react-vite-spa",
    });

    expect(result.installed).toBe(false);
    expect(result.destinationState).toBe("unchanged");
    expect(result.plan.files.map((file) => file.path)).toContain(
      PROJECT_MANIFEST_PATH
    );
    await expect(lstat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports every scaffold phase and its final destination state", async () => {
    const phases: string[] = [];
    const applyPlan = vi.fn(() => Promise.resolve());
    const installDependencies = vi.fn(() => Promise.resolve());

    const result = await scaffoldProject(
      {
        destination: "/unused/project",
        dryRun: false,
        initializeGit: false,
        installDependencies: true,
        json: false,
        options: {
          description: "An example application.",
          githubOwner: "example",
          githubRepo: "project",
          packageName: "@example/project",
          projectName: "project",
        },
        recipe: "react-vite-spa",
      },
      [],
      undefined,
      {
        applyPlan,
        installDependencies,
        onPhase: (phase) => {
          phases.push(phase);
        },
      }
    );

    expect(phases).toEqual(["planning", "generation", "installation"]);
    expect(applyPlan).toHaveBeenCalledOnce();
    expect(installDependencies).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      destinationState: "complete",
      installed: true,
    });
  });

  it("preserves an incomplete publication state in generation errors", async () => {
    const failure = new ApplyGenerationError(
      "The incomplete marker was preserved.",
      "incomplete"
    );

    await expect(
      scaffoldProject(
        {
          destination: "/unused/project",
          dryRun: false,
          initializeGit: false,
          installDependencies: false,
          json: false,
          options: {
            description: "An example application.",
            githubOwner: "example",
            githubRepo: "project",
            packageName: "@example/project",
            projectName: "project",
          },
          recipe: "react-vite-spa",
        },
        [],
        undefined,
        {
          applyPlan: () => Promise.reject(failure),
        }
      )
    ).rejects.toMatchObject({
      code: "GENERATION_FAILED",
      destinationState: "incomplete",
      phase: "generation",
      projectCreated: false,
    } satisfies Partial<CreateAstilbaError>);
  });

  it("reports a complete destination when cancellation lands after publication", async () => {
    const controller = new AbortController();

    await expect(
      scaffoldProject(
        {
          destination: "/unused/project",
          dryRun: false,
          initializeGit: false,
          installDependencies: false,
          json: false,
          options: {
            description: "An example application.",
            githubOwner: "example",
            githubRepo: "project",
            packageName: "@example/project",
            projectName: "project",
          },
          recipe: "react-vite-spa",
        },
        [],
        controller.signal,
        {
          applyPlan: () => {
            controller.abort(new Error("test cancellation"));
            return Promise.resolve();
          },
        }
      )
    ).rejects.toMatchObject({
      code: "CANCELLED",
      destinationState: "complete",
      phase: "generation",
      projectCreated: true,
    } satisfies Partial<CreateAstilbaError>);
  });

  it("normalizes unexpected installer failures after publication", async () => {
    await expect(
      scaffoldProject(
        {
          destination: "/unused/project",
          dryRun: false,
          initializeGit: false,
          installDependencies: true,
          json: false,
          options: {
            description: "An example application.",
            githubOwner: "example",
            githubRepo: "project",
            packageName: "@example/project",
            projectName: "project",
          },
          recipe: "react-vite-spa",
        },
        [],
        undefined,
        {
          applyPlan: () => Promise.resolve(),
          installDependencies: () =>
            Promise.reject(new Error("injected installer failure")),
        }
      )
    ).rejects.toMatchObject({
      code: "INSTALLATION_FAILED",
      destinationState: "complete",
      phase: "installation",
      projectCreated: true,
    } satisfies Partial<CreateAstilbaError>);
  });

  it("reports cancellation before generation with stable diagnostics", async () => {
    const controller = new AbortController();
    controller.abort(new Error("test cancellation"));

    await expect(
      scaffoldProject(
        {
          destination: "/unused/project",
          dryRun: false,
          initializeGit: false,
          installDependencies: false,
          json: true,
          options: {
            description: "An example application.",
            githubOwner: "example",
            githubRepo: "project",
            packageName: "@example/project",
            projectName: "project",
          },
          recipe: "react-vite-spa",
        },
        [],
        controller.signal
      )
    ).rejects.toMatchObject({
      code: "CANCELLED",
      destination: "/unused/project",
      exitCode: 130,
      phase: "input",
      projectCreated: false,
    } satisfies Partial<CreateAstilbaError>);
  });

  it("reports planning failures with generation diagnostics", async () => {
    await expect(
      scaffoldProject({
        destination: "/unused/project",
        dryRun: true,
        initializeGit: false,
        installDependencies: false,
        json: true,
        options: {
          description: "An example application.",
          githubOwner: "example",
          githubRepo: "project",
          packageName: "invalid package name",
          projectName: "project",
        },
        recipe: "react-vite-spa",
      })
    ).rejects.toMatchObject({
      code: "GENERATION_FAILED",
      destination: "/unused/project",
      phase: "generation",
      projectCreated: false,
    } satisfies Partial<CreateAstilbaError>);
  });
});
