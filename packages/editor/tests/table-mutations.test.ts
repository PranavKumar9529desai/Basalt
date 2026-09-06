/**
 * Table source mutations — pure function tests for row/column operations.
 */
import { describe, expect, it } from "vitest";
import {
  parseTableSource,
  insertRowAbove,
  setAlignment,
  insertRowBelow,
  deleteRow,
  insertColumnLeft,
  insertColumnRight,
  deleteColumn,
  moveRowUp,
  moveRowDown,
  updateCellText,
} from "../src/input/table-mutations";

// Serializer normalizes delimiter row to "| --- | --- |" format.
const TABLE = "| A | B |\n|---|---|\n| 1 | 2 |";

describe("updateCellText", () => {
  it("updates header cell", () => {
    const result = updateCellText(TABLE, 0, 0, "Updated");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("| Updated | B |\n| --- | --- |\n| 1 | 2 |");
  });

  it("updates body cell", () => {
    const result = updateCellText(TABLE, 1, 1, "99");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("| A | B |\n| --- | --- |\n| 1 | 99 |");
  });

  it("escapes pipes and handles newlines in cell content", () => {
    const result = updateCellText(TABLE, 1, 0, "line1\nline2|extra");
    expect(result).not.toBeNull();
    expect(result!.text).toBe("| A | B |\n| --- | --- |\n| line1 line2\\|extra | 2 |");
  });
});

describe("parseTableSource", () => {
  it("parses a 2-column table", () => {
    const model = parseTableSource(TABLE);
    expect(model).not.toBeNull();
    expect(model!.colCount).toBe(2);
    expect(model!.rows).toEqual([["A", "B"], ["1", "2"]]);
    expect(model!.alignments).toEqual(["none", "none"]);
  });

  it("detects alignment from delimiter", () => {
    const model = parseTableSource("| A | B |\n|:---|---:|\n| 1 | 2 |");
    expect(model!.alignments).toEqual(["left", "right"]);
  });

  it("returns null for non-table", () => {
    expect(parseTableSource("just text")).toBeNull();
  });
});

describe("insertRowBelow", () => {
  it("inserts below the header row", () => {
    const result = insertRowBelow(TABLE, 0);
    expect(result).not.toBeNull();
    expect(result!.text).toBe(
      "| A | B |\n| --- | --- |\n|  |  |\n| 1 | 2 |",
    );
  });

  it("inserts below a body row", () => {
    const result = insertRowBelow(TABLE, 1);
    expect(result).not.toBeNull();
    expect(result!.text).toBe(
      "| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |",
    );
  });
});

describe("insertRowAbove", () => {
  it("inserts above a body row", () => {
    const result = insertRowAbove(TABLE, 1);
    expect(result).not.toBeNull();
    expect(result!.text).toBe(
      "| A | B |\n| --- | --- |\n|  |  |\n| 1 | 2 |",
    );
  });

  it("cannot insert above header", () => {
    expect(insertRowAbove(TABLE, 0)).toBeNull();
  });
});

describe("deleteRow", () => {
  it("deletes a body row when multiple exist", () => {
    const threeRow = TABLE + "\n| 3 | 4 |";
    const result = deleteRow(threeRow, 1);
    expect(result).not.toBeNull();
    expect(result!.text).toBe(
      "| A | B |\n| --- | --- |\n| 3 | 4 |",
    );
  });

  it("cannot delete header", () => {
    expect(deleteRow(TABLE, 0)).toBeNull();
  });

  it("cannot delete the last body row", () => {
    expect(deleteRow(TABLE, 1)).toBeNull();
  });
});

describe("insertColumnLeft", () => {
  it("inserts a column at the left", () => {
    const result = insertColumnLeft(TABLE, 0);
    expect(result).not.toBeNull();
    expect(result!.text).toBe(
      "|  | A | B |\n| --- | --- | --- |\n|  | 1 | 2 |",
    );
  });

  it("inserts between columns", () => {
    const result = insertColumnLeft(TABLE, 1);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("| A |  | B |");
  });
});

describe("insertColumnRight", () => {
  it("inserts a column at the right", () => {
    const result = insertColumnRight(TABLE, 1);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("| A | B |  |");
  });
});

describe("deleteColumn", () => {
  it("deletes a column", () => {
    const result = deleteColumn(TABLE, 0);
    expect(result).not.toBeNull();
    expect(result!.text).toBe("| B |\n| --- |\n| 2 |");
  });

  it("cannot delete the last column", () => {
    const singleCol = "| A |\n|---|\n| 1 |";
    expect(deleteColumn(singleCol, 0)).toBeNull();
  });
});

describe("moveRowUp", () => {
  it("cannot move the header", () => {
    expect(moveRowUp(TABLE, 0)).toBeNull();
  });

  it("swaps two body rows", () => {
    const threeRow = TABLE + "\n| 3 | 4 |";
    const result = moveRowUp(threeRow, 2);
    expect(result).not.toBeNull();
    expect(result!.text).toBe(
      "| A | B |\n| --- | --- |\n| 3 | 4 |\n| 1 | 2 |",
    );
  });
});

describe("moveRowDown", () => {
  it("moves a body row down", () => {
    const threeRow = TABLE + "\n| 3 | 4 |";
    const result = moveRowDown(threeRow, 1);
    expect(result).not.toBeNull();
    expect(result!.text).toBe(
      "| A | B |\n| --- | --- |\n| 3 | 4 |\n| 1 | 2 |",
    );
  });

  it("cannot move the last row down", () => {
    const result = moveRowDown(TABLE, 1);
    expect(result).toBeNull();
  });

  it("cannot move the header", () => {
    expect(moveRowDown(TABLE, 0)).toBeNull();
  });
});

describe("setAlignment", () => {
  it("sets left alignment", () => {
    const result = setAlignment(TABLE, 0, "left");
    expect(result).not.toBeNull();
    expect(result!.text).toBe(
      "| A | B |\n| :--- | --- |\n| 1 | 2 |",
    );
  });

  it("sets center alignment", () => {
    const result = setAlignment(TABLE, 1, "center");
    expect(result).not.toBeNull();
    expect(result!.text).toBe(
      "| A | B |\n| --- | :---: |\n| 1 | 2 |",
    );
  });

  it("sets right alignment", () => {
    const result = setAlignment(TABLE, 0, "right");
    expect(result).not.toBeNull();
    expect(result!.text).toBe(
      "| A | B |\n| ---: | --- |\n| 1 | 2 |",
    );
  });

  it("resets to none alignment", () => {
    const aligned = "| A | B |\n|:---|---:|\n| 1 | 2 |";
    const result = setAlignment(aligned, 1, "none");
    expect(result).not.toBeNull();
    expect(result!.text).toBe(
      "| A | B |\n| :--- | --- |\n| 1 | 2 |",
    );
  });

  it("returns null for out-of-range column", () => {
    expect(setAlignment(TABLE, 5, "left")).toBeNull();
  });

  it("returns null for negative column", () => {
    expect(setAlignment(TABLE, -1, "left")).toBeNull();
  });
});
