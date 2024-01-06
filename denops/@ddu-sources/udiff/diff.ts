export type DiffLine = {
  text: string; // text of line
  linum: number; // line number of patch target file
  olinum: number; // line number of origin file
};

export type DiffData = {
  oldFileName: string;
  newFileName: string;
  header: string[];
  lines: DiffLine[];
};

const hunkAddressExpr = /-(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))?/;

export const splitAtFile = (lines: string[]): string[][][] => {
  let ptr = 0;
  const files: string[][][] = [];
  while (ptr < lines.length) {
    if (lines[ptr].startsWith("---")) {
      const parsed = [[lines[ptr], lines[ptr + 1]]];
      ptr += 2;
      while (lines[ptr][0] === "@") {
        const hunkStart = ptr;
        // Note: hunk size omitted if 1
        //
        const m = lines[ptr].match(hunkAddressExpr);
        if (m == null) {
          throw "invalid hunk at " + ptr;
        }
        const minusLength = parseInt(m[2] ?? "1");
        const plusLength = parseInt(m[4] ?? "1");

        let minusCount = 0;
        let plusCount = 0;

        ptr++;
        while (ptr < lines.length) {
          switch (lines[ptr][0]) {
            case " ":
              minusCount++;
              plusCount++;
              break;
            case "-":
              minusCount++;
              break;
            case "+":
              plusCount++;
              break;
          }
          if (minusCount === minusLength && plusCount === plusLength) {
            parsed.push(lines.slice(hunkStart, ++ptr));
            break;
          }
          ptr++;
        }
      }
      files.push(parsed);
    }
    ptr++;
  }
  return files;
};

export const parseHunk = (lines: string[]): DiffLine[] => {
  const parsed: DiffLine[] = [];
  const m = lines[0].match(hunkAddressExpr);
  if (m == null) {
    throw Error("m == null");
  }
  let olinum = parseInt(m[1] ?? 1);
  let linum = parseInt(m[3] ?? 1);
  parsed.push({
    text: lines[0],
    linum,
    olinum,
  });
  for (let i = 1; i < lines.length; i++) {
    parsed.push({
      text: lines[i],
      linum,
      olinum,
    });
    const head = lines[i][0];
    if (head === "+") {
      linum++;
    } else if (head === "-") {
      olinum++;
    } else {
      linum++;
      olinum++;
    }
  }
  return parsed;
};

export function applyPatch(origin: string[], patch: DiffLine[]): string[] {
  const patched = origin.slice();
  // 簡素化のため、後ろからパッチを打つ
  // 順番狂うので+(linum)を先に処理する
  const realPatch = patch.toSorted((a, b) =>
    b.linum - a.linum || b.olinum - a.olinum
  );
  for (const p of realPatch) {
    const point = p.olinum - 1;
    if (p.text[0] === "-") {
      patched.splice(point, 1);
    } else if (p.text[0] === "+") {
      patched.splice(point, 0, p.text.slice(1));
    }
  }
  return patched;
}

export const parseDiff = (lines: string[]): DiffData[] => {
  const split = splitAtFile(lines);
  const result: DiffData[] = [];
  for (const chunk of split) {
    const oldFileName = chunk[0][0].slice(4).replace(/\t.*$/, "");
    const newFileName = chunk[0][1].slice(4).replace(/\t.*$/, "");
    const lines = chunk.slice(1).flatMap(parseHunk);
    result.push({
      oldFileName,
      newFileName,
      header: chunk[0],
      lines,
    });
  }
  return result;
};
