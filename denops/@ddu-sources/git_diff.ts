import { parseDiff } from "./udiff/diff.ts";
import { dirname } from "https://deno.land/std@0.193.0/path/mod.ts";
import * as path from "https://deno.land/std@0.193.0/path/mod.ts";
import { ActionData } from "https://deno.land/x/ddu_kind_file@v0.5.2/file.ts";
import { GatherArguments, OnInitArguments } from "https://deno.land/x/ddu_vim@v3.4.1/base/source.ts";
import {
  BaseSource,
  Item,
  ItemHighlight,
} from "https://deno.land/x/ddu_vim@v3.4.1/types.ts";

type _ActionData = ActionData & {
  _git_diff: number; // hack: suppress preview window closer
};

type Params = {
  cached: boolean;
  currentFile: boolean;
  show: boolean;
};

const hls: Record<string, string> = {
  "-": "diffRemoved",
  "+": "diffAdded",
  "@": "diffLine",
};

const run = async (cmd: string[], cwd?: string): Promise<string> => {
  if (cwd == null) {
    cwd = Deno.cwd();
  }
  const proc = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd,
  });
  const { stdout } = await proc.output();
  return new TextDecoder().decode(stdout);
};

export class Source extends BaseSource<Params> {
  kind = "file";

  gather({
    context,
    denops,
    sourceParams,
  }: GatherArguments<Params>): ReadableStream<Item<_ActionData>[]> {
    return new ReadableStream({
      async start(controller) {
        try {
          const currentFile = String(
            await denops.eval(
              `resolve(fnamemodify(bufname(${context.bufNr}), ':p'))`,
            ),
          );
          const currentDir = Deno.statSync(currentFile).isDirectory
            ? currentFile
            : dirname(currentFile);
          const worktree = (await run([
            "git",
            "rev-parse",
            "--show-toplevel",
          ], currentDir)).trim();
          const diff = (await run(
            [
              "git",
              sourceParams.show ? "show" : "diff",
              "--no-color",
              "--no-prefix",
              "--no-relative",
              "--no-renames",
              ...((!sourceParams.show && sourceParams.cached)
                ? ["--cached"]
                : []),
              ...(sourceParams.currentFile ? [currentFile] : []),
            ],
            worktree,
          )).split("\n");
          const chunks = parseDiff(diff);
          const items: Item<_ActionData>[][] = [];
          for (const chunk of chunks) {
            const fileName = path.join(worktree, chunk.fileName);
            items.push(chunk.header.map((line, idx) => {
              const hl = line.startsWith("---")
                ? "diffOldFile"
                : line.startsWith("+++")
                ? "diffNewFile"
                : "";
              const hlID = "git_diff_hl_" + hl;
              return {
                word: line,
                action: {
                  lineNr: 1,
                  path: fileName,
                  _git_diff: -idx,
                },
                highlights: [{
                  name: hlID,
                  "hl_group": hl,
                  col: 1,
                  width: new TextEncoder().encode(line).length,
                }],
              };
            }));
            items.push(chunk.lines.map((line, idx) => {
              const highlights: ItemHighlight[] = [];
              const hl = hls[line.text[0]];
              if (hl != null) {
                highlights.push({
                  name: "git_diff_hl_" + hl,
                  "hl_group": hl,
                  col: 1,
                  width: new TextEncoder().encode(line.text).length,
                });
              }
              return {
                word: line.text,
                action: {
                  lineNr: line.linum,
                  path: fileName,
                  _git_diff: idx,
                },
                highlights,
              };
            }));
          }
          controller.enqueue(items.flat());
          controller.close();
        } catch (e: unknown) {
          console.log(e);
        }
      },
    });
  }

  params(): Params {
    return {
      cached: false,
      currentFile: false,
      show: false,
    };
  }
}
