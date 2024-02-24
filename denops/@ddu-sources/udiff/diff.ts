export type DiffLine = {
  text: string; // text of line
  olinum: number; // line number of origin file
  nlinum: number; // line number of patch target file
};

export type Hunk = {
  header: string;
  ostart: number;
  nstart: number;
  lines: DiffLine[];
};

export type DiffData = {
  oldFileName: string;
  newFileName: string;
  header: string[];
  hunks: Hunk[];
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
        // Note: hunk size is 1 if omitted
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

export const parseHunk = (lines: string[]): Hunk => {
  const parsed: DiffLine[] = [];
  const m = lines[0].match(hunkAddressExpr);
  if (m == null) {
    throw Error("m == null");
  }
  const ostart = parseInt(m[1] ?? 1);
  const nstart = parseInt(m[3] ?? 1);
  const minusLength = parseInt(m[2] ?? "1");
  // 元hunkの長さが0の時、開始位置が-1されてるっぽいので補正
  let olinum = minusLength === 0 ? ostart + 1 : ostart;
  let nlinum = nstart;
  for (let i = 1; i < lines.length; i++) {
    parsed.push({
      text: lines[i],
      olinum,
      nlinum,
    });
    const head = lines[i][0];
    if (head === "+") {
      nlinum++;
    } else if (head === "-") {
      olinum++;
    } else {
      nlinum++;
      olinum++;
    }
  }
  return {
    header: lines[0],
    ostart,
    nstart,
    lines: parsed,
  };
};

export function applyPatch(origin: string[], patch: DiffLine[]): string[] {
  const patched = origin.slice();
  // 簡素化のため、後ろからパッチを打つ
  // 順番狂うので+(linum)を先に処理する
  const realPatch = patch.toSorted((a, b) =>
    b.nlinum - a.nlinum || b.olinum - a.olinum
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
    const hunks = chunk.slice(1).map(parseHunk);
    result.push({
      oldFileName,
      newFileName,
      header: chunk[0],
      hunks,
    });
  }
  return result;
};
