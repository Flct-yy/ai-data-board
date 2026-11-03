"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn-small-secondary" onClick={() => window.print()}>
      打印 / 导出 PDF
    </button>
  );
}
